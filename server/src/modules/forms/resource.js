// A screen as a REST resource with JSON field names. The rules stay where parity proved them: the screen's own
// handlers (./screens, through the registries in ./pages.js) for load, option changes, buttons and own saves, and the
// forms writer (./write.js) for Save / Update / Delete. This only translates between the API's names (uomCode, name,
// workCenterProcesses ...) and the screen's controls (PrimaryKey, TextBox3, CBProcess ...), as production-orders does
// by hand.
//   field name: the column a control is bound to (camelCase); a list control (grid, check list, tree) is named after
//   its child table; a control with no column, or a name two controls would share, is named after its control ID.
//   Values are the screen's: grid rows keep their column names, check lists / trees their checked values, lists their
//   items as the screen has them (the "Select" placeholder included).
import { FORMS } from './specs.js';
import { newFormState, displayState, copyState, copyOptions, engineControls, pageControls } from './state.js';
import { comboRows } from './children.js';
import { collect, insert, update, cancel as cancelRecord } from './write.js';
import { listPage, searchColumns, distinctValues, operatorsFor, OPERATOR_TEXT } from './lists.js';
import { PAGE_EVENTS, PAGE_POSTBACK, PAGE_LIST_TAG, PAGE_SAVE, PAGE_UPDATE, PAGE_CANCEL, PAGE_LOAD, PAGE_PRINT, CUSTOM_DISPLAY, eventHelpers } from './pages.js';
import { printerOptions } from '../production/labels.service.js';
import { netString } from '../../shared/net.js';
import { AppError } from '../../shared/AppError.js';

const camel = (s) => netString(s).trim().replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ?? '').toUpperCase()).replace(/^[A-Z]+(?=[A-Z][a-z]|$)|^[A-Z]/, (m) => m.toLowerCase());
const LISTS = new Set(['GridView', 'CheckBoxList', 'TreeView']);
const plain = (x) => (x !== null && typeof x === 'object' ? x : netString(x));
const plainAll = (v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
/** control -> value, as the screen posts them */
const valuesOf = (state) => Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : c.value]));
/** displayState of a key that is not there (AssignData's error, or the key is not a number): no such record */
const MISSING = /^There is no row at position 0\.$|^Invalid column name /;

/** The screen as /api/forms/spec and GET <api>/layout send it: the blank form after the page's first-load code (every
 *  control with its type, caption, items, value, visibility), its buttons, print / copy / list options. */
export async function specPayload(spec, ctx) {
  const [state, cols, copy] = await Promise.all([newFormState(spec, ctx), spec.view?.tag ? searchColumns(spec, ctx).catch(() => []) : [], copyOptions(spec)]);
  // the page's first-load code; an exception there shows as the form's message
  const built = new Map(state.controls.map((c) => [c, c.options]));
  const loaded = await PAGE_LOAD[spec.file]?.(state.controls, ctx, (state.viewState ??= {}));
  // lists the first load filled: the client posts their items back with each event (the server rebuilds only the form)
  for (const c of state.controls) if (c.options && c.options !== built.get(c)) c.refilled = true;
  if (loaded?.alert) state.statusMessage = loaded.alert;
  return {
    title: state.title,
    controls: state.controls,
    viewState: state.viewState ?? {},
    recordStatus: state.recordStatus ?? null,
    statusMessage: state.statusMessage ?? null,
    buttons: {
      add: spec.titleBar.addbutton !== false,
      update: spec.titleBar.update !== false,
      delete: spec.titleBar.delete !== false,
    },
    // after Save/Update TitleControl shows Print (record stays open) on print pages, else clears unless CallNewOnSave = false
    callNewOnSave: spec.titleBar.callnewonsave !== false && !spec.titleBar.print,
    print: !!spec.titleBar.print && !!PAGE_PRINT[spec.file],
    printers: spec.titleBar.printer ? await printerOptions(ctx.businessUnit) : null,
    copyOptions: copy,
    events: Object.keys(PAGE_EVENTS[spec.file] ?? {}),
    // TitleControl shows the list first unless the TopPanel is visible or the View button is switched off
    startOnList: !spec.topPanelVisible && !!spec.view?.tag && spec.titleBar.viewbutton !== false,
    // the screen has a list of saved records to go back to (a list query and its View button not switched off)
    hasList: !!spec.view?.tag && spec.titleBar.viewbutton !== false,
    searchColumns: cols.map((c) => ({ name: c.name, operators: operatorsFor(c.type).map((o) => [o, OPERATOR_TEXT[o]]) })),
  };
}

export function screenResource(route) {
  const spec = FORMS[route];
  if (!spec) throw new Error(`No screen ${route}`);
  const file = spec.file;

  // API field -> control ID: the engine's controls and those only the page code uses (Labels / Panels / Buttons carry
  // no value; what the page does to them comes back under ui)
  const controls = [...engineControls(spec), ...pageControls(spec)].filter((c) => !['Label', 'Panel', 'Button', 'ImageButton'].includes(c.type));
  const base = (c) => camel(LISTS.has(c.type) && c.type !== 'GridView' ? c.table : c.column) || camel(c.id);
  const count = new Map();
  for (const c of controls) count.set(base(c), (count.get(base(c)) ?? 0) + 1);
  const FIELDS = {};
  for (const c of controls) {
    let f = count.get(base(c)) > 1 || !base(c) ? camel(c.id) : base(c);
    while (FIELDS[f]) f += '_';
    FIELDS[f] = c.id;
  }
  // fields holding the screen's own structure (QC panel, footer, picked file, image): passed as they are
  const NESTED = new Set(Object.entries(FIELDS).filter(([, id]) => ['QC', 'Footer', 'FileUpload', 'Image'].includes(controls.find((c) => c.id === id)?.type)).map(([f]) => f));
  const FIELD_OF = Object.fromEntries(Object.entries(FIELDS).map(([f, id]) => [id, f]));
  // every control's API name (ui entries, events): its field, else its control ID in camelCase (the ID itself when
  // two controls would share a name)
  const NAME_OF = { ...FIELD_OF };
  const taken = new Set(Object.keys(FIELDS));
  for (const c of spec.controls) {
    if (!c.id || NAME_OF[c.id]) continue;
    let n = camel(c.id);
    if (!n || taken.has(n)) n = c.id;
    while (taken.has(n)) n += '_';
    NAME_OF[c.id] = n;
    taken.add(n);
  }
  const name = (id) => NAME_OF[id] ?? camel(id);
  const CONTROL_OF = Object.fromEntries(Object.entries(NAME_OF).map(([id, n]) => [n, id]));
  // events: by the field of their control, a button / unbound control by its ID
  const EVENTS = Object.fromEntries(Object.keys(PAGE_EVENTS[file] ?? {}).map((id) => [name(id), id]));
  const keyField = FIELD_OF.PrimaryKey;
  const copy = !!spec.titleBar.copybutton;
  /** a page's own save / update / delete answers ok: false with the reason: a refusal */
  const own = (r) => {
    if (r?.ok === false) throw AppError.badRequest(netString(r.message) || 'Not saved', { alert: r.alert ?? undefined });
    return fromResult(r);
  };

  /** the screen's state as the API returns it */
  function fromState(state) {
    const record = {};
    const options = {};
    const ui = {};
    for (const c of state.controls) {
      if (!c.id) continue;
      // how every control shows (refilled: a list the page's code filled, which the client posts back with events)
      ui[name(c.id)] = { visible: c.visible !== false, enabled: c.enabled !== false, readOnly: !!c.readOnly, ...(c.text !== undefined && { text: c.text }), ...(c.refilled && { refilled: true }) };
      const f = FIELD_OF[c.id];
      if (!f) continue;
      record[f] = c.type === 'GridView' ? (c.rows ?? []) : c.value; // as the screen holds it (a file not picked: null)
      if (c.options) options[f] = c.options;
    }
    return { record, options, ui, viewState: state.viewState ?? {}, status: state.recordStatus ?? null, statusMessage: state.statusMessage ?? null };
  }
  /** the screen's values: the base (a fresh or a saved record, as the screen built it) with the API's fields on top */
  function toValues(baseValues, record = {}) {
    const v = { ...baseValues };
    for (const [f, x] of Object.entries(record)) if (FIELDS[f]) v[FIELDS[f]] = x;
    return v;
  }
  /** a handler's result ({ set: { control: { value, options, index, rows, visible, enabled ... } }, alert ... }) in API terms.
   *  An item picked by position in a list the patch does not send is looked up in the list the screen has (listOf). */
  function fromResult(r, listOf = () => null) {
    const { set, alert, session: _, ...rest } = r ?? {};
    const record = {};
    const options = {};
    const ui = {};
    for (const [id, p] of Object.entries(set ?? {})) {
      const f = name(id);
      const { value, options: o, index, rows, ...state } = p;
      if (o) options[f] = o;
      if (index !== undefined) {
        const items = o ?? listOf(id);
        if (items) record[f] = netString(items[index]?.value);
        else state.index = index; // a list only the client holds: it picks the item
      }
      if (value !== undefined) record[f] = value;
      if (rows) record[f] = rows;
      if (Object.keys(state).length) ui[f] = state;
    }
    return { ...rest, record, options, ui, alert: alert ?? null }; // alert: what the page itself showed
  }

  const fresh = async (ctx) => valuesOf(await newFormState(spec, ctx));
  /** the screen's state for a saved record; null when there is none */
  async function saved(ctx, key) {
    try {
      return await displayState(spec, ctx, key);
    } catch (e) {
      if (MISSING.test(e.message)) return null;
      throw e;
    }
  }
  /** the values as the page's handlers see them: after a Page_Load that also runs on postbacks */
  const posted = async (v, ctx) => (PAGE_POSTBACK[file] ? PAGE_POSTBACK[file](v, spec, ctx) : v);
  const helpers = (ctx, raw, { viewState = {}, ui = {}, arg, index = -1 } = {}) => eventHelpers(spec, ctx, raw, { viewState, ui, arg, index });

  return {
    SCREEN: route,
    FIELDS,
    NESTED,
    EVENTS,
    NAMES: NAME_OF,
    /** the control an API name (field, or a ui / event entry) stands for */
    controlOf: (n) => CONTROL_OF[n] ?? n,
    print: !!PAGE_PRINT[file],
    copy,

    /** what a page draws the screen from (the /api/forms/spec payload), with the API's names for its controls:
     *  fields (field -> control), names (control -> field or ui name), events (event -> control) */
    async layout(ctx) {
      return { ...(await specPayload(spec, ctx)), api: { fields: FIELDS, names: NAME_OF, events: EVENTS } };
    },
    /** a new record as the screen opens it (its first-load code included) */
    async blank(ctx) {
      const state = await newFormState(spec, ctx);
      const loaded = await PAGE_LOAD[file]?.(state.controls, ctx, (state.viewState ??= {}));
      if (loaded?.alert) state.statusMessage = loaded.alert;
      return {
        ...fromState(state),
        events: Object.keys(EVENTS),
        printers: spec.titleBar.printer ? await printerOptions(ctx.businessUnit) : null,
        copyFrom: copy ? await copyOptions(spec) : null,
      };
    },
    /** a saved record; null when there is none. A page with its own display(key) does not lock a cancelled one. */
    async get(ctx, key) {
      const state = await saved(ctx, key);
      if (!state) return null;
      const r = fromState(state);
      return CUSTOM_DISPLAY.has(file) ? { ...r, status: null, statusMessage: null } : r;
    },
    /** a new record filled from a saved one (TitleControl Copy); null when there is none */
    async copyOf(ctx, key) {
      try {
        return fromState(await copyState(spec, ctx, key));
      } catch (e) {
        if (MISSING.test(e.message)) return null;
        throw e;
      }
    },
    /** one page of records (PAGE_SIZE a page, lists.js), optionally filtered on one column; filter: the page's own list choices */
    async list(ctx, { page = 0, search = null, filter = {} } = {}) {
      const tag = PAGE_LIST_TAG[file]?.(filter, ctx);
      const r = await listPage(tag ? { ...spec, view: { ...spec.view, tag } } : spec, ctx, page, search);
      return { columns: r.columns.map((c) => c.name), rows: r.rows, keys: r.keys, total: r.count, page: r.page, pageSize: r.pageSize };
    },
    /** the columns a list can be filtered on, with their conditions */
    async searchFields(ctx) {
      return (await searchColumns(spec, ctx)).map((c) => ({ name: c.name, operators: operatorsFor(c.type).map((o) => ({ value: o, text: OPERATOR_TEXT[o] })) }));
    },
    /** the values a column holds (the filter's picker) */
    columnValues: async (ctx, column) => (await distinctValues(spec, ctx, column)).map((v) => netString(v)),
    /** a search picker's rows (first 2000, or those matching search); null when the field has none */
    async picker(ctx, field, search) {
      const c = engineControls(spec).find((x) => x.id === FIELDS[field] && x.type === 'ComboBox');
      return c ? comboRows(c, ctx.businessUnit, search) : null;
    },

    /** What an option change or a button does (the screen's own handler for it), on the record the client holds.
     *  body: { record, viewState, ui (values of controls outside the form), arg, index (grid row) } */
    async event(ctx, event, body) {
      const id = EVENTS[event];
      if (!id) throw AppError.notFound(`Event ${event}`);
      const state = await newFormState(spec, ctx);
      const raw = await posted(toValues(valuesOf(state), body.record), ctx);
      const v = plainAll(raw);
      const viewState = plainAll(body.viewState ?? {});
      // the lists as the client has them (ui: what the page or an earlier event filled), else as the screen builds them
      const listOf = (cid) => body.ui?.[cid]?.options ?? state.controls.find((c) => c.id === cid)?.options ?? null;
      const r = await PAGE_EVENTS[file][id](v, helpers(ctx, v, { viewState, ui: body.ui ?? {}, arg: body.arg, index: body.index ?? -1 }));
      return { ...fromResult(r, listOf), viewState: r.viewState ?? viewState, session: r.session && 'department' in r.session ? { department: netString(r.session.department) } : undefined };
    },

    /** a new record; { key, message } (or the page's own save result) */
    async create(ctx, body) {
      // the record as the client holds it, key included, as the screen posts it: the writer takes a new key, and a
      // page's own save may work on the record an event loaded (Rework Confirmation saves the inspection Go found)
      const raw = await posted(toValues(await fresh(ctx), body.record), ctx);
      if (PAGE_SAVE[file]) return own(await PAGE_SAVE[file](plainAll(raw), { ...helpers(ctx, raw, body), raw }));
      const key = await insert(spec, await collect(spec, raw, ctx), ctx);
      return { ok: true, key: netString(key), message: 'Record Created Successfully' };
    },
    /** the record saved again with the given fields; null when there is none */
    async save(ctx, key, body) {
      const state = await saved(ctx, key);
      if (!state) return null;
      const raw = await posted(toValues(valuesOf(state), { ...body.record, ...(keyField && { [keyField]: key }) }), ctx);
      if (PAGE_UPDATE[file]) return own(await PAGE_UPDATE[file](plainAll(raw), { ...helpers(ctx, raw, body), raw }));
      const k = await update(spec, await collect(spec, raw, ctx), ctx);
      return { ok: true, key: netString(k), message: 'Record Updated Successfully' };
    },
    /** the record cancelled (status 200, not erased), with the reason; null when there is none */
    async cancel(ctx, key, remark, body = {}) {
      const state = await saved(ctx, key);
      if (!state) return null;
      const raw = await posted(toValues(valuesOf(state), { ...body.record, ...(keyField && { [keyField]: key }) }), ctx);
      if (PAGE_CANCEL[file]) return own(await PAGE_CANCEL[file](plainAll(raw), { ...helpers(ctx, raw, body), raw, remark }));
      await cancelRecord(spec, await collect(spec, raw, ctx), ctx, remark);
      return { ok: true, key, message: 'Record Deleted Successfully' };
    },
    /** TitleControl Print: the page's print handler on the record, with the chosen printer */
    async printRecord(ctx, body) {
      if (!PAGE_PRINT[file]) throw AppError.notFound('Print on this screen');
      const v = plainAll(toValues(await fresh(ctx), body.record));
      return fromResult(await PAGE_PRINT[file](v, { ...helpers(ctx, v, body), printer: netString(body.printer) }));
    },
  };
}
