// API for engine forms (TitleControl + TopPanel pages): spec/new state, list, record, save, update, cancel.
import { Router } from 'express';
import { writeSession } from '../../lib/session.js';
import { readFileSync } from 'node:fs';
import { requireAuth } from '../../middleware/auth.js';
import { canOpen, userMenu } from '../menu/service.js';
import { KEEP } from '../menu/keep.js';
import { netString } from '../../lib/net.js';
import { newFormState, displayState, copyState, copyOptions, engineControls } from './state.js';
import { comboRows } from './children.js';
import { PAGE_EVENTS, PAGE_POSTBACK, PAGE_LIST_TAG, PAGE_SAVE, PAGE_UPDATE, PAGE_CANCEL, PAGE_LOAD, PAGE_PRINT, CUSTOM_DISPLAY, eventHelpers } from './pages.js';
import { printerOptions } from './labels.js';
import { routeByLabel } from './wip.js';
import { listPage, searchColumns, distinctValues, operatorsFor, OPERATOR_TEXT } from './lists.js';
import { collect, insert, update, cancel } from './write.js';

// the screens this app offers: specs extracted for the keep-list only (scripts/extract-forms.mjs, menu/keep.js)
export const FORMS = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('./forms.json', import.meta.url), 'utf8'))).filter(([r]) => KEEP.has(r)));

export const formRoutes = Router();
formRoutes.use(requireAuth);

async function load(req, res) {
  const path = netString(req.query.path ?? req.body?.path).toLowerCase();
  const spec = FORMS[path];
  if (!spec) return void res.status(404).json({ message: 'Form not found' });
  const ok = spec.menuModuleId == null ? (await userMenu(req.session.userCode)).systemUser : await canOpen(req.session.userCode, spec.menuModuleId);
  if (!ok) return void res.status(403).json({ message: 'You do not have access to this screen' });
  return spec;
}
const ctxOf = (req) => ({ businessUnit: req.session.businessUnit, department: req.session.department, userCode: req.session.userCode, userId: req.session.userId, line: req.session.line ?? '0', lineName: req.session.lineName ?? '' });
const publicState = (s) => ({ title: s.title, controls: s.controls, viewState: s.viewState ?? {}, recordStatus: s.recordStatus ?? null, statusMessage: s.statusMessage ?? null, buttons: s.buttons });

// Original messages are shown as they were (alert / status bar).
const fail = (res, e) => res.status(400).json({ message: e.message });

formRoutes.get('/spec', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const ctx = ctxOf(req);
    const [state, cols, copy] = await Promise.all([newFormState(spec, ctx), spec.view?.tag ? searchColumns(spec, ctx).catch(() => []) : [], copyOptions(spec)]);
    // the page's first-load code; an exception there shows as the form's message
    const built = new Map(state.controls.map((c) => [c, c.options]));
    const loaded = await PAGE_LOAD[spec.file]?.(state.controls, ctx, (state.viewState ??= {}));
    // lists the first load filled: the client posts their items back with each event (the server rebuilds only the form)
    for (const c of state.controls) if (c.options && c.options !== built.get(c)) c.refilled = true;
    if (loaded?.alert) state.statusMessage = loaded.alert;
    res.json({
      ...publicState(state),
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
      searchColumns: cols.map((c) => ({ name: c.name, operators: operatorsFor(c.type).map((o) => [o, OPERATOR_TEXT[o]]) })),
    });
  } catch (e) {
    fail(res, e);
  }
});

formRoutes.get('/list', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const search = req.query.column ? { column: netString(req.query.column), op: netString(req.query.op), value: netString(req.query.value) } : null;
    // a page whose code rewrites the list's Tag (from the form's choices, sent back as f.<name>)
    const filter = Object.fromEntries(Object.entries(req.query).filter(([k]) => k.startsWith('f.')).map(([k, v]) => [k.slice(2), netString(v)]));
    const tag = PAGE_LIST_TAG[spec.file]?.(filter, ctxOf(req));
    res.json(await listPage(tag ? { ...spec, view: { ...spec.view, tag } } : spec, ctxOf(req), Math.max(0, Number(req.query.page) || 0), search));
  } catch (e) {
    fail(res, e);
  }
});

formRoutes.get('/distinct', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    res.json((await distinctValues(spec, ctxOf(req), netString(req.query.column))).map((v) => netString(v)));
  } catch (e) {
    fail(res, e);
  }
});

formRoutes.get('/record', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const s = await displayState(spec, ctxOf(req), netString(req.query.key));
    // a page with its own display(key) skips ViewControl's status checks: a cancelled record stays editable
    res.json(publicState(CUSTOM_DISPLAY.has(spec.file) ? { ...s, recordStatus: null, statusMessage: null } : s));
  } catch (e) {
    fail(res, e);
  }
});

formRoutes.get('/copy', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  if (!spec.titleBar.copybutton) return void res.status(404).json({ message: 'Copy is not available on this screen' });
  try {
    res.json(publicState(await copyState(spec, ctxOf(req), netString(req.query.key))));
  } catch (e) {
    fail(res, e);
  }
});

// AutoPostBack: run the page's handler for a control on the current values; returns option/value patches + alert.
formRoutes.post('/event', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  const handler = PAGE_EVENTS[spec.file]?.[netString(req.body?.control)];
  if (!handler) return void res.status(404).json({ message: 'No such event' });
  const v = Object.fromEntries(Object.entries(await posted(req, spec)).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)]));
  const vs = req.body?.viewState && typeof req.body.viewState === 'object' ? Object.fromEntries(Object.entries(req.body.viewState).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)])) : {};
  try {
    const ui = req.body?.ui && typeof req.body.ui === 'object' ? req.body.ui : {};
    const r = await handler(v, eventHelpers(spec, ctxOf(req), v, { viewState: vs, arg: req.body?.arg, index: Number(req.body?.index ?? -1), ui }));
    // page code that sets a session value (WrapperAvatar.Department = ...): only the department is allowed
    if (r.session && 'department' in r.session) writeSession(res, { ...req.session, department: netString(r.session.department) });
    const { session: _, ...rest } = r;
    res.json({ ...rest, viewState: r.viewState ?? vs });
  } catch (e) {
    fail(res, e);
  }
});

// TitleControl Print: the page's print handler with the chosen printer
formRoutes.post('/print', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  const handler = PAGE_PRINT[spec.file];
  if (!handler) return void res.status(404).json({ message: 'Nothing to print on this screen' });
  const raw = values(req.body);
  const v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)]));
  try {
    res.json(await handler(v, { ...eventHelpers(spec, ctxOf(req), v), printer: netString(req.body?.printer) }));
  } catch (e) {
    fail(res, e);
  }
});

// ComboBoxControl picker: open (first 2000 rows) or search
formRoutes.get('/combo', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  const c = engineControls(spec).find((x) => x.id === netString(req.query.id) && x.type === 'ComboBox');
  if (!c) return void res.status(404).json({ message: 'No such list' });
  try {
    res.json(await comboRows(c, req.session.businessUnit, req.query.search == null ? null : netString(req.query.search)));
  } catch (e) {
    fail(res, e);
  }
});

const values = (b) => (b?.values && typeof b.values === 'object' ? b.values : {});
// the posted values as the page's handlers see them: after a Page_Load that also runs on postbacks
const posted = async (req, spec) => (PAGE_POSTBACK[spec.file] ? PAGE_POSTBACK[spec.file](values(req.body), spec, ctxOf(req)) : values(req.body));

formRoutes.post('/save', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const own = PAGE_SAVE[spec.file];
    if (own) {
      const raw = await posted(req, spec);
      const v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)]));
      const r = await own(v, { ...eventHelpers(spec, ctxOf(req), raw, { viewState: req.body?.viewState ?? {}, ui: req.body?.ui ?? {} }), raw });
      if (r.logout) req.session.destroy(() => {});
      return void res.json(r);
    }
    const key = await insert(spec, await collect(spec, await posted(req, spec), ctxOf(req)), ctxOf(req));
    res.json({ ok: true, key, message: 'Record Created Successfully' });
  } catch (e) {
    fail(res, e);
  }
});

// WIP Capture's route progress: the scanned label's stages (read only; the WIP events themselves are unchanged)
formRoutes.get('/route', async (req, res) => {
  if (netString(req.query.path).toLowerCase() !== '/production/wipcaptureform') return void res.status(404).json({ message: 'Form not found' });
  const spec = await load(req, res);
  if (!spec) return;
  const label = netString(req.query.label).trim();
  if (label === '' || label.length > 100) return void res.status(400).json({ message: 'Scan a unit serial' });
  try {
    res.json({ steps: await routeByLabel(label) });
  } catch (e) {
    fail(res, e);
  }
});

formRoutes.post('/update', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const own = PAGE_UPDATE[spec.file];
    if (own) {
      const raw = await posted(req, spec);
      const v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)]));
      return void res.json(await own(v, { ...eventHelpers(spec, ctxOf(req), raw, { viewState: req.body?.viewState ?? {}, ui: req.body?.ui ?? {} }), raw }));
    }
    const key = await update(spec, await collect(spec, await posted(req, spec), ctxOf(req)), ctxOf(req));
    res.json({ ok: true, key, message: 'Record Updated Successfully' });
  } catch (e) {
    fail(res, e);
  }
});

formRoutes.post('/cancel', async (req, res) => {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const own = PAGE_CANCEL[spec.file];
    if (own) {
      const raw = await posted(req, spec);
      const v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)]));
      return void res.json(await own(v, { ...eventHelpers(spec, ctxOf(req), raw, { viewState: req.body?.viewState ?? {}, ui: req.body?.ui ?? {} }), raw, remark: netString(req.body?.remark) }));
    }
    await cancel(spec, await collect(spec, await posted(req, spec), ctxOf(req)), ctxOf(req), netString(req.body?.remark));
    res.json({ ok: true, message: 'Record Deleted Successfully' });
  } catch (e) {
    fail(res, e);
  }
});
