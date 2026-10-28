// RmReplacement: the form view (create / update one record), with the state and engine only it uses.
// The page (../RmReplacement.jsx) opens it with the screen's state; the list is ./List.jsx.

import { useEffect, useMemo, useRef, useState, useId } from 'react';
import { ArrowLeft, Copy, Printer, Save, Send, Trash2, Boxes, ClipboardCheck, ClipboardList, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import { askConfirm } from '@/app/confirm.js';
import Grid from '@/components/shared/DataGrid.jsx';
import { CheckList, ComboField, EngineField, FileField, GuideView, ImageField, Panel, RoleTree } from '@/components/shared/FormControls.jsx';
import Modal, { ModalFooter } from '@/components/shared/Modal.jsx';
import QCPanel from '@/components/shared/QCPanel.jsx';
import Toolbar from '@/components/shared/Toolbar.jsx';
import { ScanBox } from '@/components/shopfloor';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { createPortal } from 'react-dom';
import { LockedField, Step, TONE_CYCLE } from '@/components/shared/FormStep.jsx';
import { prettyHeader } from '@/components/shared/DataTable.jsx';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────────────────────────────────────
// 2. STATE
// What the client keeps of the form and sends back with each server event.
// ────────────────────────────────────────────────────────────────────────────
const enc = encodeURIComponent;

/** control id -> value (GridViews: their rows) */
const valuesOf = (state) => Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : c.value]));

/** The page as shown, which server page code reads back: Visible / Enabled / Text, plus the items of a page-filled
 *  list or of any list an event or the first load refilled (the server only knows the items the form was built with). */
const uiOf = (controls) =>
  Object.fromEntries(
    controls
      .filter((c) => c.id)
      .map((c) => [c.id, { visible: c.visible !== false, enabled: c.enabled !== false, text: c.text ?? '', ...((c.page || c.refilled) && c.options ? { options: c.options } : {}) }]),
  );

/** Applies a server patch { id: { options?, index?, value?, rows?, visible?, text?, enabled?, maxLength?, guide? } }:
 *  options first, then SelectedIndex / SelectedValue. Returns the new controls and values. */
function applyPatch(controls, values, patch = {}) {
  const ctl = controls.map((c) => {
    const p = patch[c.id];
    if (!p) return c;
    const next = { ...c };
    if (p.options) Object.assign(next, { options: p.options, refilled: true });
    for (const k of ['visible', 'text', 'enabled', 'maxLength']) if (k in p) next[k] = p[k];
    if (p.guide) next.guide = p.guide;
    return next;
  });
  const vals = { ...values };
  for (const c of ctl) if (c.type === 'FileUpload') vals[c.id] = null; // a postback clears a file input, as the browser did
  for (const [k, p] of Object.entries(patch)) {
    if ('index' in p) vals[k] = ctl.find((c) => c.id === k)?.options?.[p.index]?.value ?? '';
    if ('value' in p) vals[k] = p.value;
    if (p.rows) vals[k] = p.rows;
  }
  return { controls: ctl, values: vals };
}

/** Panel.Visible / Panel.Enabled = false hide / disable everything inside the panel. */
function panelState(controls) {
  const byId = new Map(controls.filter((c) => c.id).map((c) => [c.id, c]));
  const up = (c, key) => {
    for (let p = c.parent; p; p = byId.get(p)?.parent) if (byId.get(p)?.[key] === false) return false;
    return true;
  };
  return { shown: (c) => up(c, 'visible'), live: (c) => (up(c, 'enabled') ? c : { ...c, enabled: false }) };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. ENGINE
// A control with code-behind (AutoPostBack, a page button, a grid command) sends the form to /forms/event; the reply is applied here.
// ────────────────────────────────────────────────────────────────────────────
function useEngine({ path, state, events, onDone, onListFilter, onResult, initialError }) {
  const [controls, setControls] = useState(state.controls);
  const [values, setValues] = useState(() => valuesOf(state));
  const [viewState, setViewState] = useState(state.viewState ?? {});
  const [buttonPatch, setButtonPatch] = useState({});
  const [busy, setBusy] = useState(false);
  // Errors are never drawn on the page: they pop up as toasts.
  const [error, setErrorState] = useState('');
  const setError = (message) => {
    setErrorState(message);
    if (message) toast.error(message, { id: message, duration: 6000 });
  };
  useEffect(() => {
    const first = initialError ?? state.statusMessage;
    if (first) setError(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = (r) => {
    if (r.alert) setError(r.alert);
    else {
      setError('');
      if (r.success) toast.success(r.message && r.message !== '✔' ? r.message : 'Done');
    }
  };

  async function fire(control, next = values, arg, base = controls, index) {
    setBusy(true);
    try {
      const r = await api('/forms/event', { method: 'POST', body: { path, control, values: next, viewState, arg, index, ui: uiOf(base) } });
      const p = applyPatch(base, next, r.set);
      setControls(p.controls);
      setValues(p.values);
      setViewState(r.viewState ?? viewState);
      if (r.redirect) return void window.location.assign(r.redirect);
      if (r.list) onListFilter?.(r.list);
      if (r.buttons) setButtonPatch((b) => ({ ...b, ...r.buttons }));
      // FooterControl's Save succeeded: the form starts again
      if (r.reset && onDone) return void onDone(r.alert ? { ok: false, text: r.alert } : { ok: true, text: r.message || 'Saved' });
      onResult ? onResult(r, control) : report(r);
      return r;
    } catch (e) {
      setError(e.message);
      onResult?.({ alert: e.message }, control);
    } finally {
      setBusy(false);
    }
  }
  function change(id, v) {
    const next = { ...values, [id]: v };
    setValues(next);
    if (events.includes(id)) fire(id, next);
  }
  // ComboBox: the picked row becomes the list's only item, then its handler (if the page wired one) runs
  const pick = (id) => (item) => {
    const ctl = controls.map((c) => (c.id === id ? { ...c, options: [item] } : c));
    const next = { ...values, [id]: item.value };
    setControls(ctl);
    setValues(next);
    if (events.includes(id)) fire(id, next, undefined, ctl);
  };

  const { shown, live } = panelState(controls);
  const byId = new Map(controls.filter((c) => c.id).map((c) => [c.id, c]));
  /** the control as the page shows it (disabled when a panel above it is) */
  const ctl = (id) => (byId.has(id) ? live(byId.get(id)) : null);
  /** visible, with every panel above it */
  const vis = (id) => {
    const c = byId.get(id);
    return !!c && c.visible !== false && shown(c);
  };

  return { controls, setControls, values, setValues, viewState, buttonPatch, busy, setBusy, error, setError, report, fire, change, pick, shown, live, ctl, vis };
}

// ────────────────────────────────────────────────────────────────────────────
// 5. FORM VIEW
// One record: the fields, the buttons, grids, QC, print, copy.
// ────────────────────────────────────────────────────────────────────────────
const EDITOR_TYPES = ['TextBox', 'DropDownList', 'CheckBox', 'Button', 'ImageButton', 'FileUpload', 'Image'];
const WIDE = ['GridView', 'QC', 'CheckBoxList', 'TreeView', 'Picture', 'Footer', 'Panel'];
const INPUT_TYPES = [...EDITOR_TYPES, 'ComboBox', 'GridView', 'QC', 'CheckBoxList', 'TreeView'];

function RecordForm({ path, state, mode: initialMode, notice, buttons: specButtons, callNewOnSave, copyOptions, events, print, printers, onCopy, onBack, onDone, onReload, onListFilter, layout, page = {} }) {
  const formId = useId();
  // TitleControl buttons, as the page's display code may switch them for the record (e.g. Display_Update(false))
  const e = useEngine({ path, state, events, onDone, onListFilter, initialError: notice && !notice.ok ? notice.text : undefined });
  const { controls, values, setValues, viewState, busy, setBusy, error, setError, fire, change, pick, shown, live, vis, ctl } = e;
  const buttons = { ...specButtons, ...(state.buttons ?? {}), ...e.buttonPatch };
  const [mode, setMode] = useState(initialMode);
  const [deleting, setDeleting] = useState(null); // the reason being typed, or null
  const [copyKey, setCopyKey] = useState('');
  const [printer, setPrinter] = useState(printers?.value ?? '');
  const cancelled = state.recordStatus === 200;
  const saved = useRef(JSON.stringify(valuesOf(state)));
  const dirty = JSON.stringify(values) !== saved.current;
  // a success notice from the step before (saved, deleted, ...) shows once as a toast
  useState(() => notice?.ok && notice.text && toast.success(notice.text === '✔' ? 'Done' : notice.text));

  const set = (id) => (v) => change(id, v);

  async function printLabel() {
    setBusy(true);
    setError('');
    try {
      const r = await api('/forms/print', { method: 'POST', body: { path, values, printer } });
      if (r.alert) setError(r.alert);
      else toast.success('Sent to printer');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(kind, extra = {}) {
    setBusy(true);
    setError('');
    try {
      const r = await api(`/forms/${kind}`, { method: 'POST', body: { path, values, viewState, ui: uiOf(controls), ...extra } });
      // a page's own Save handler: it signed the user out (password changed) / reported failure
      if (r.logout) return void window.location.assign('/login');
      if (r.ok === false) return void setError(r.message);
      // what the page itself alerted wins over the success message
      const result = r.alert ? { ok: false, text: r.alert } : { ok: true, text: r.message };
      if (r.display) return onReload(r.display, result); // the page shows the saved record again
      // Delete always clears the form; Save/Update clear it unless CallNewOnSave = false (the record stays open)
      if (kind === 'cancel' || callNewOnSave) return onDone(result);
      if (result.ok) toast.success(result.text || 'Saved');
      else setError(result.text);
      setValues((x) => {
        const next = r.key && 'PrimaryKey' in x ? { ...x, PrimaryKey: r.key } : { ...x };
        for (const [k, p] of Object.entries(r.set ?? {})) if ('value' in p) next[k] = p.value;
        saved.current = JSON.stringify(next);
        return next;
      });
      setMode('edit');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  async function back() {
    if (dirty && !(await askConfirm({ title: 'Leave without saving?', message: 'Your changes on this form will be lost.', confirmLabel: 'Leave', variant: 'danger' }))) return;
    onBack();
  }

  // the page's own editors (and engine controls with an empty Tag), in markup order
  const searchBoxes = new Set(Object.keys(page.checkSearch ?? {}));
  const editors = controls
    .filter((c) => c.id && c.visible && shown(c) && !searchBoxes.has(c.id) && (EDITOR_TYPES.includes(c.type) || (c.type === 'Label' && c.page && (c.text ?? '') !== '')) && (c.page || (c.table.trim() === '' && c.column.trim() === '')))
    .sort((a, b) => a.order - b.order);
  // Label + input pairs by Tag (table|column); TextBoxes with an empty Tag are left to the page logic.
  const fields = useMemo(() => {
    const labels = controls.filter((c) => c.type === 'Label');
    return controls
      .filter((c) => ['TextBox', 'DropDownList', 'CheckBox', 'ComboBox'].includes(c.type) && c.visible && shown(c) && c.id && (c.table.trim() !== '' || c.column.trim() !== ''))
      .map((c) => ({ c, label: (labels.find((l) => l.table === c.table && l.column === c.column && l.visible)?.text ?? c.column).replace(/\s*:\s*$/, '') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);
  const label = (c) => page.labels?.[c.id] ?? c.caption ?? c.column;
  const searched = new Set(Object.values(page.checkSearch ?? {}));
  const rowPick = page.pick; // { grid, box, go, field, allow(row), hint }: a grid row picked into a scan box

  /** a control that takes a whole row: list, tree, guide, picture, footer save, checklist, grid */
  function block(c) {
    if (c.type === 'CheckBoxList') return <CheckList key={c.id} c={c} label={label(c)} value={values[c.id]} onChange={set(c.id)} search={searched.has(c.id)} />;
    if (c.type === 'TreeView' && c.nodes) return <RoleTree key={c.id} c={c} label={label(c)} value={values[c.id]} onChange={set(c.id)} />;
    if (c.type === 'Panel' && c.guide) return <GuideView key={c.id} g={c.guide} />;
    if (c.type === 'Picture') return values[c.id] ? <Panel key={c.id}><img src={String(values[c.id]).replace(/^~\//, '/')} alt="" className="max-h-[70vh] rounded-lg" /></Panel> : null;
    if (c.type === 'Footer') {
      return events.includes('Footer:save') ? (
        <div key={c.id} className="flex justify-end">
          <Button icon={Save} loading={busy} disabled={cancelled} onClick={() => fire('Footer:save', values)}>Save</Button>
        </div>
      ) : null;
    }
    if (c.type === 'QC') {
      const qc = (next) => ({ ...values, [c.id]: next });
      return <QCPanel key={c.id} s={values[c.id]} busy={busy} onChange={(next) => setValues(qc(next))} onEvent={(name, next = values[c.id], arg, i) => fire(name.replace(/^QC:/, `${c.id}:`), qc(next), arg, controls, i)} />;
    }
    if (c.type === 'GridView') {
      const can = (k) => !cancelled && c.columns.some((x) => x.kind === 'commandfield' && x[k]) && events.includes(`${c.id}:${k}`);
      return (
        <Grid
          key={c.id}
          c={c}
          rows={values[c.id]}
          onSelect={can('select') ? (k, i) => fire(`${c.id}:select`, values, k, controls, i) : null}
          onDelete={can('delete') ? (k, i) => fire(`${c.id}:delete`, values, k, controls, i) : null}
          onCommand={(cmdName, k, i) => events.includes(`${c.id}:${cmdName}`) && fire(`${c.id}:${cmdName}`, values, k, controls, i)}
          onEdit={(i, field, v) => setValues((x) => ({ ...x, [c.id]: x[c.id].map((r, j) => (j === i ? { ...r, [field]: v } : r)) }))}
          {...(rowPick?.grid === c.id && {
            // page.pick: a row's field into a scan box, then that box's Go, as if it had been scanned
            onPick: (r) => {
              const next = { ...values, [rowPick.box]: String(r[rowPick.field] ?? '') };
              setValues(next);
              fire(rowPick.go, next);
            },
            canPick: (r) => !cancelled && !busy && ctl(rowPick.box)?.enabled !== false && rowPick.allow(r),
            pickHint: rowPick.hint,
          })}
        />
      );
    }
    return null;
  }

  const pairLabel = new Map(fields.map((x) => [x.c.id, x.label]));
  /** one control of a layout section, under its caption */
  function one(c, l = pairLabel.get(c.id) ?? c.caption ?? page.labels?.[c.id] ?? c.column ?? '') {
    if (c.type === 'TextBox' && c.readOnly) return <LockedField key={c.id} c={c} label={l} value={values[c.id]} />;
    if (WIDE.includes(c.type)) return <div key={c.id} className="col-span-full min-w-0">{block(c)}</div>;
    if (c.type === 'Button' || c.type === 'ImageButton') {
      return events.includes(c.id) ? (
        <div key={c.id} className="self-end">
          <Button loading={busy} disabled={!c.enabled || cancelled} onClick={() => fire(c.id, values)}>{l || (c.text ?? '').trim() || 'Go'}</Button>
        </div>
      ) : null;
    }
    if (c.type === 'ComboBox') return <ComboField key={c.id} path={path} c={c} label={l} value={values[c.id]} onPick={pick(c.id)} />;
    if (c.type === 'Image') return <ImageField key={c.id} c={c} label={l} value={values[c.id]} onChange={set(c.id)} />;
    if (c.type === 'FileUpload') return <FileField key={c.id} c={c} label={l} value={values[c.id]} onChange={(v) => setValues({ ...values, [c.id]: v })} />;
    if (c.type === 'Label') return (c.text ?? '') !== '' ? <span key={c.id} className="self-end pb-2.5 text-sm text-muted-foreground">{c.text}</span> : null;
    return <EngineField key={c.id} c={live(c)} label={l} value={values[c.id]} onChange={set(c.id)} />;
  }

    /** A screen without a layout of its own, as numbered steps (the Production Order design): its fields, then its own
   *  inputs and buttons, then each list / grid / tree / QC panel as a step of its own, in markup order. The record
   *  status goes in the page header, as on Production Order. */
  function autoLayout() {
    // the department and the record status go in the page header, as on Production Order
    const dept = fields.find(({ c }) => c.type === 'DropDownList' && /^department$/i.test(String(c.column ?? '').trim()));
    const header = [...(dept ? [{ id: dept.c.id, label: dept.label }] : []), ...(vis('ddlStatus') ? [{ id: 'ddlStatus', label: 'Record status' }] : [])];
    const steps = [];
    const details = fields.filter(({ c }) => !header.some((h) => h.id === c.id)).map(({ c, label: l }) => ({ id: c.id, label: l }));
    if (details.length) steps.push({ title: 'Details', subtitle: 'The main information of this record', icon: ClipboardList, ids: details });
    if (editors.length) steps.push({ title: 'More details', subtitle: 'Further entries and actions of this screen', icon: SlidersHorizontal, ids: editors.map((c) => ({ id: c.id, label: c.caption ?? page.labels?.[c.id] ?? '' })) });
    // (a role tree without its nodes, or an image not picked yet, shows nothing, so it gets no step)
    const blocks = controls.filter((c) => c.id && c.visible !== false && shown(c) && ['GridView', 'CheckBoxList', 'TreeView', 'QC', 'Picture'].includes(c.type) && (c.type !== 'TreeView' || c.nodes) && (c.type !== 'Picture' || values[c.id]));
    for (const c of blocks) steps.push({ title: c.type === 'QC' ? 'Quality checks' : c.type === 'Picture' ? 'Image' : prettyHeader(page.labels?.[c.id] ?? c.caption ?? c.column ?? c.id) || 'Items', icon: c.type === 'QC' ? ClipboardCheck : Boxes, ids: [c.id] });
    // what has no step of its own: a guide panel, the approval footer (shown after the steps)
    const tail = controls.filter((c) => c.id && c.visible !== false && shown(c) && ((c.type === 'Panel' && c.guide) || c.type === 'Footer'));
    return { header, sections: steps, tail };
  }

  /** the layout's steps (the screen's own, or autoLayout()), numbered as shown; visible controls a screen's own layout
   *  does not place follow under "Other details" */
  const itemsOf = (list) => (list ?? []).map((i) => (typeof i === 'string' ? { id: i } : i)).filter((i) => vis(i.id));
  /** a grid a layout item gives `columns` (data fields) shows only those; its rows keep every field */
  const shownColumns = (c, keep) => (keep && c?.type === 'GridView' ? { ...c, columns: c.columns.filter((x) => x.kind !== 'boundfield' || keep.includes(x.dataField)) } : c);
  const L = layout ?? autoLayout();
  function sections() {
    const idOf = (i) => (typeof i === 'string' ? i : i.id);
    const listed = new Set([...(L.header ?? []).map(idOf), ...L.sections.flatMap((x) => [...x.ids.map(idOf), ...(x.actions ?? []).map(idOf), ...[...(x.scan ? [x.scan] : []), ...(x.scans ?? [])].flatMap((s) => [s.box, s.go])]), ...(L.tail ?? []).map((c) => c.id)]);
    const rest = layout ? controls.filter((c) => c.id && !listed.has(c.id) && !layout.hide?.includes(c.id) && INPUT_TYPES.includes(c.type) && vis(c.id) && (c.type !== 'Button' || events.includes(c.id))) : [];
    const steps = [...L.sections, ...(rest.length ? [{ title: 'Other details', subtitle: 'More fields of this screen', tone: 'slate', ids: rest.map((c) => c.id) }] : [])];
    let n = 0;
    return [
      ...steps.map((x) => {
        const items = itemsOf(x.ids);
        const acts = itemsOf(x.actions);
        // a step's scans (`scan`, or `scans` side by side): a box with its Go / Clear
        const scans = [...(x.scan ? [x.scan] : []), ...(x.scans ?? [])].filter((s) => vis(s.box));
        if (!items.length && !acts.length && !scans.length) return null;
        n += 1;
        return (
          <Step key={x.title} n={n} tone={x.tone ?? TONE_CYCLE[(n - 1) % TONE_CYCLE.length]} icon={x.icon ?? Boxes} title={x.title} subtitle={x.subtitle} actions={acts.length > 0 && acts.map((i) => <div key={i.id} className="min-w-48">{one(ctl(i.id), i.label)}</div>)}>
            {/* `side`: the scans on the left, the step's fields / list on the right (wide screens) */}
            <div className={x.side ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : 'space-y-4'}>
              {scans.length > 0 && (
                <div className={cn('grid gap-4', scans.length > 1 && !x.side && 'sm:grid-cols-2')}>
                  {scans.map((s) => (
                    <ScanBox key={s.box} size="md" label={s.label} placeholder={s.placeholder} value={values[s.box]} onChange={(v) => change(s.box, v)} onScan={() => fire(s.go, values)} locked={ctl(s.go)?.text === 'Clr'} onClear={() => fire(s.go, values)} busy={busy} disabled={cancelled} />
                  ))}
                </div>
              )}
              {items.length > 0 && (
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map((i) => {
                    const c = shownColumns(ctl(i.id), i.columns);
                    return (
                      <div key={i.id} className={cn('min-w-0', (WIDE.includes(c.type) || i.wide) && 'col-span-full', i.span === 2 && 'sm:col-span-2')}>
                        {/* a grid / list a layout names gets its name above it */}
                        {WIDE.includes(c.type) && i.label && <h4 className="mb-2 text-sm font-semibold text-foreground">{i.label}</h4>}
                        {one(c, i.label)}
                        {i.count && c.maxLength > 0 && (
                          <p className="tabular mt-1 text-right text-[11px] text-muted-foreground">
                            {String(values[c.id] ?? '').length}/{c.maxLength}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Step>
        );
      }),
      ...(L.tail ?? []).map((c) => block(c)),
    ];
  }

  // the page header's part (in the page header's slot): Back to list, the header fields (record status ...), print /
  // copy, Save / Update
  const [slot, setSlot] = useState(null);
  useEffect(() => setSlot(document.getElementById('page-header-slot')), []);
  const bar = (
    <div className="flex flex-wrap items-end gap-3">
      <span className="hidden items-center gap-2 self-center xl:inline-flex">
        {mode === 'new' ? <Badge variant="info" dot>New record</Badge> : cancelled ? <Badge variant="danger" dot>Cancelled</Badge> : <Badge variant="neutral" dot>Saved record</Badge>}
        {dirty && !cancelled && <Badge variant="warning" dot>Unsaved changes</Badge>}
      </span>
      {/* a screen without a list of saved records (its View button off) has nothing to go back to */}
      {onBack && <Button type="button" variant="outline" icon={ArrowLeft} className="h-10" onClick={back}>Back to list</Button>}
      {/* a new record takes the screen's default status (Active): its status shows once it is saved */}
      {itemsOf(L.header).filter((i) => mode !== 'new' || i.id !== 'ddlStatus').map((i) => (
        <div key={i.id} className="w-56">{one(cancelled ? { ...ctl(i.id), enabled: false } : ctl(i.id), i.label)}</div>
      ))}
      {print && mode === 'edit' && !cancelled && (
        <span className="flex items-center gap-2">
          {printers && (
            <NativeSelect className="h-10 w-auto" aria-label="Printer" value={printer} onChange={(e) => setPrinter(e.target.value)}>
              {printers.options.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
            </NativeSelect>
          )}
          <Button type="button" variant="outline" icon={Printer} loading={busy} className="h-10" onClick={printLabel}>Print</Button>
        </span>
      )}
      {copyOptions && (
        <span className="flex items-center gap-2">
          <NativeSelect className="h-10 w-auto max-w-56" aria-label="Record to copy" value={copyKey} onChange={(e) => setCopyKey(e.target.value)}>
            {copyOptions.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
          </NativeSelect>
          <Button type="button" variant="outline" icon={Copy} className="h-10" disabled={copyKey === '' || busy} onClick={() => onCopy(copyKey)}>Copy</Button>
        </span>
      )}
      {buttons.post && events.includes('TitleControl:post') && <Button type="button" icon={Send} loading={busy} className="h-10" onClick={() => fire('TitleControl:post', values)}>Post</Button>}
      {false && mode === 'edit' && !cancelled && buttons.delete && (
        <Button type="button" variant="outline" icon={Trash2} className="h-10 text-rose-700 dark:text-rose-300! hover:border-rose-300!" onClick={() => setDeleting('')}>Delete</Button>
      )}
      {mode === 'new' && buttons.add && <Button type="submit" form={formId} icon={Save} loading={busy} className="h-10 px-5">{L.saveLabel ?? 'Save'}</Button>}
      {mode === 'edit' && !cancelled && buttons.update && <Button type="submit" form={formId} icon={Save} loading={busy} className="h-10 px-5">{L.updateLabel ?? 'Update'}</Button>}
    </div>
  );

    return (
    <form
      id={formId}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(mode === 'new' ? 'save' : 'update');
      }}
    >
      {slot ? createPortal(bar, slot) : <Toolbar>{bar}</Toolbar>}

      <fieldset disabled={cancelled} className="space-y-4">
        {sections()}
      </fieldset>

      {deleting !== null && (
        <Modal
          title="Delete this record?"
          subtitle="The record is cancelled, not erased. Give the reason; it is kept with the record."
          size="sm"
          onClose={() => setDeleting(null)}
          footer={<ModalFooter onCancel={() => setDeleting(null)} onSave={() => act('cancel', { remark: deleting })} saveLabel="Delete" saveVariant="danger" saving={busy} />}
        >
          <label className="block">
            <span className="text-sm leading-none font-medium">Reason for deleting</span>
            <Input value={deleting} onChange={(e) => setDeleting(e.target.value)} autoFocus />
          </label>
        </Modal>
      )}
    </form>
  );
}

export default RecordForm;
