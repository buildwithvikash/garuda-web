// ════════════════════════════════════════════════════════════════════════════════
//  Work Center
//  Sidebar: Productionsetup › Work Center
//
//  THIS FILE IS THE WHOLE PAGE. Change how it works or looks right here: nothing in this
//  file is used by any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  Map of this file
//    1. SETTINGS    this page's layout and captions                       <- start here
//    2. STATE       how the form's state is read and patched
//    3. ENGINE      sends events to the server and applies its reply
//    4. LIST VIEW   saved records: search, table, paging
//    5. FORM VIEW   one record: fields, buttons, grids, print ...
//    6. PAGE        loads the screen and switches between list and form
// ════════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, Copy, Plus, Printer, RotateCcw, Save, Search, Send, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import { askConfirm } from '@/app/confirm.js';
import Grid from '@/components/shared/DataGrid.jsx';
import DataTable from '@/components/shared/DataTable.jsx';
import { CheckList, ComboField, EngineField, FileField, GuideView, ImageField, Panel, RoleTree } from '@/components/shared/FormControls.jsx';
import { FormError } from '@/components/shared/FormField.jsx';
import Loader from '@/components/shared/Loader.jsx';
import Modal, { ModalFooter } from '@/components/shared/Modal.jsx';
import Page from '@/components/shared/Page.jsx';
import QCPanel from '@/components/shared/QCPanel.jsx';
import Section from '@/components/shared/Section.jsx';
import Toolbar from '@/components/shared/Toolbar.jsx';
import { ScanBox } from '@/components/shopfloor';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { useMe } from '@/layouts/AppLayout.jsx';
import { screenOf } from '@/layouts/Sidebar.jsx';

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// Edit these for this page. `layout` arranges the fields in sections; `page` adds captions / search boxes.
// ────────────────────────────────────────────────────────────────────────────
export const route = '/productionsetup/workcenterform';

// const layout = { icon, subtitle, sections: [{ title, icon, ids: ['ControlId', { id: 'ControlId', label: 'Caption' }] }] };
const layout = undefined;

/** Client-side bits of this page (its code-behind runs on the server): captions the markup gives without a Tag,
 *  and TextBoxes that filter a CheckBoxList. */
const page = {
  checkSearch: { TBCheckListSearch: 'CBProcess' },
  labels: { CBProcess: 'Process List' },
};

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
  const [error, setError] = useState(initialError ?? state.statusMessage ?? '');

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
// 4. LIST VIEW
// The saved records of this screen.
// ────────────────────────────────────────────────────────────────────────────
const sel = 'h-8 w-auto min-w-44 text-[13px]';
const inp = 'h-8 w-auto text-[13px]';

function RecordList({ path, spec, onOpen, filter = {} }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState({ column: '', op: '', value: '' });
  const [applied, setApplied] = useState(null);
  const [values, setValues] = useState([]);

  const load = useCallback(() => {
    // filter: what the page's own code put in the list's Tag (e.g. the area chosen on the form)
    const q = (applied ? `&column=${enc(applied.column)}&op=${enc(applied.op)}&value=${enc(applied.value)}` : '') + Object.entries(filter).map(([k, v]) => `&f.${enc(k)}=${enc(v)}`).join('');
    setLoading(true);
    api(`/forms/list?path=${enc(path)}&page=${page}${q}`)
      .then((d) => (setData(d), setError(null)))
      .catch((e) => setError({ data: { message: e.message } }))
      .finally(() => setLoading(false));
  }, [path, page, applied, filter]);
  useEffect(load, [load]);

  const col = spec.searchColumns.find((c) => c.name === search.column);
  async function pickColumn(name) {
    const c = spec.searchColumns.find((x) => x.name === name);
    setSearch({ column: name, op: c?.operators[0]?.[0] ?? '', value: '' });
    setValues(name ? await api(`/forms/distinct?path=${enc(path)}&column=${enc(name)}`).catch(() => []) : []);
  }
  const run = (e) => {
    e?.preventDefault();
    if (!col || search.value === '') return;
    setPage(0);
    setApplied(search);
  };
  const clear = () => {
    setApplied(null);
    setSearch({ column: '', op: '', value: '' });
    setPage(0);
  };

  const columns = useMemo(
    () => (data?.columns ?? []).map((c, i) => ({ key: `c${i}`, header: c.name, text: (r) => r[`c${i}`], render: (r) => { const v = r[`c${i}`]; return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v ?? '—'; } })),
    [data],
  );
  const rows = useMemo(() => (data?.rows ?? []).map((r, i) => ({ id: i, ...Object.fromEntries(r.map((v, j) => [`c${j}`, v])) })), [data]);
  const totalPages = data ? Math.max(1, Math.ceil(data.count / data.pageSize)) : 1;

  const leading = (
    <form onSubmit={run} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Search in</span>
        <NativeSelect className={sel} value={search.column} onChange={(e) => pickColumn(e.target.value)} aria-label="Column">
          <option value="">Choose a column…</option>
          {spec.searchColumns.map((c) => <option key={c.name}>{c.name}</option>)}
        </NativeSelect>
      </label>
      {col && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Condition</span>
            <NativeSelect className={sel} value={search.op} onChange={(e) => setSearch((s) => ({ ...s, op: e.target.value }))} aria-label="Condition">
              {col.operators.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Value</span>
            {search.op === 'like' ? (
              <Input className={`${inp} w-56`} value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))} aria-label="Value" autoFocus />
            ) : (
              <NativeSelect className={`${sel} w-56`} value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))} aria-label="Value">
                <option value="">Choose…</option>
                {values.map((v, i) => <option key={i}>{v}</option>)}
              </NativeSelect>
            )}
          </label>
        </>
      )}
      <Button type="submit" size="sm" icon={Search} disabled={!col || search.value === ''}>Search</Button>
      {(applied || search.column) && <Button variant="ghost" size="sm" icon={RotateCcw} onClick={clear}>Clear</Button>}
    </form>
  );

  return (
    <DataTable
      tableId={path}
      columns={columns}
      rows={rows}
      loading={loading}
      error={error}
      leading={leading}
      empty={applied ? 'No records match this search.' : 'No records yet.'}
      onRowClick={(r) => data.keys[r.id] && onOpen(data.keys[r.id])}
      selectable
      exportName={spec.title?.replaceAll(' ', '-').toLowerCase() || 'records'}
      pagination={data && { meta: { page: page + 1, pageSize: data.pageSize, total: data.count, totalPages }, onPage: (p) => setPage(p - 1) }}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 5. FORM VIEW
// One record: the fields, the buttons, grids, QC, print, copy.
// ────────────────────────────────────────────────────────────────────────────
const EDITOR_TYPES = ['TextBox', 'DropDownList', 'CheckBox', 'Button', 'ImageButton', 'FileUpload', 'Image'];
const WIDE = ['GridView', 'QC', 'CheckBoxList', 'TreeView', 'Picture', 'Footer', 'Panel'];
const INPUT_TYPES = [...EDITOR_TYPES, 'ComboBox', 'GridView', 'QC', 'CheckBoxList', 'TreeView'];

function RecordForm({ path, state, mode: initialMode, notice, buttons: specButtons, callNewOnSave, copyOptions, events, print, printers, onCopy, onBack, onDone, onReload, onListFilter, layout, page = {} }) {
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
        />
      );
    }
    return null;
  }

  const pairLabel = new Map(fields.map((x) => [x.c.id, x.label]));
  /** one control of a layout section, under its caption */
  function one(c, l = pairLabel.get(c.id) ?? c.caption ?? page.labels?.[c.id] ?? c.column ?? '') {
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

  /** a dedicated screen's sections (layouts.js); visible controls a layout does not list follow under "Other details" */
  function sections() {
    const listed = new Set(layout.sections.flatMap((x) => [...x.ids.map((i) => (typeof i === 'string' ? i : i.id)), ...(x.scan ? [x.scan.box, x.scan.go] : [])]));
    const rest = controls.filter((c) => c.id && !listed.has(c.id) && !layout.hide?.includes(c.id) && INPUT_TYPES.includes(c.type) && vis(c.id) && (c.type !== 'Button' || events.includes(c.id)));
    const sections = [...layout.sections, ...(rest.length ? [{ title: 'Other details', ids: rest.map((c) => c.id) }] : [])];
    return sections.map((x) => {
      const items = x.ids.map((i) => (typeof i === 'string' ? { id: i } : i)).filter((i) => vis(i.id));
      const scan = x.scan && vis(x.scan.box);
      if (!items.length && !scan) return null;
      const Icon = x.icon;
      return (
        <Section key={x.title} icon={Icon} title={x.title}>
          <div className="space-y-4">
            {scan && (
              <ScanBox label={x.scan.label} placeholder={x.scan.placeholder} value={values[x.scan.box]} onChange={(v) => change(x.scan.box, v)} onScan={() => fire(x.scan.go, values)} locked={ctl(x.scan.go)?.text === 'Clr'} onClear={() => fire(x.scan.go, values)} busy={busy} disabled={cancelled} />
            )}
            {items.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((i) => one(ctl(i.id), i.label))}</div>}
          </div>
        </Section>
      );
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(mode === 'new' ? 'save' : 'update');
      }}
    >
      <Toolbar>
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={back}>Back to list</Button>
        <span className="hidden sm:inline-flex items-center gap-2">
          {mode === 'new' ? <Badge variant="info" dot>New record</Badge> : cancelled ? <Badge variant="danger" dot>Cancelled</Badge> : <Badge variant="neutral" dot>Saved record</Badge>}
          {dirty && !cancelled && <Badge variant="warning" dot>Unsaved changes</Badge>}
        </span>
        {print && mode === 'edit' && !cancelled && (
          <span className="flex items-center gap-2">
            {printers && (
              <NativeSelect className=" h-8 w-auto" aria-label="Printer" value={printer} onChange={(e) => setPrinter(e.target.value)}>
                {printers.options.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
              </NativeSelect>
            )}
            <Button variant="outline" size="sm" icon={Printer} loading={busy} onClick={printLabel}>Print</Button>
          </span>
        )}
        {copyOptions && (
          <span className="flex items-center gap-2">
            <NativeSelect className=" h-8 w-auto max-w-56" aria-label="Record to copy" value={copyKey} onChange={(e) => setCopyKey(e.target.value)}>
              {copyOptions.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
            </NativeSelect>
            <Button variant="outline" size="sm" icon={Copy} disabled={copyKey === '' || busy} onClick={() => onCopy(copyKey)}>Copy</Button>
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {buttons.post && events.includes('TitleControl:post') && <Button size="sm" icon={Send} loading={busy} onClick={() => fire('TitleControl:post', values)}>Post</Button>}
          {mode === 'edit' && !cancelled && buttons.delete && (
            <Button variant="outline" size="sm" icon={Trash2} className="text-rose-700 dark:text-rose-300! hover:border-rose-300!" onClick={() => setDeleting('')}>Delete</Button>
          )}
          {mode === 'new' && buttons.add && <Button type="submit" size="sm" icon={Save} loading={busy}>Save</Button>}
          {mode === 'edit' && !cancelled && buttons.update && <Button type="submit" size="sm" icon={Save} loading={busy}>Update</Button>}
        </div>
      </Toolbar>

      <FormError message={error} />

      <fieldset disabled={cancelled} className="space-y-4">
        {!layout && fields.length > 0 && (
          <Panel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map(({ c, label: l }) =>
                c.type === 'ComboBox' ? <ComboField key={c.id} path={path} c={c} label={l} value={values[c.id]} onPick={pick(c.id)} /> : <EngineField key={c.id} c={live(c)} label={l} value={values[c.id]} onChange={set(c.id)} />,
              )}
            </div>
          </Panel>
        )}
        {!layout && editors.length > 0 && (
          <Panel>
            <div className="flex flex-wrap items-end gap-4">
              {editors.map((c) => {
                const l = c.caption ?? page.labels?.[c.id] ?? '';
                if (c.type === 'Label') return <span key={c.id} className="pb-2.5 text-sm text-muted-foreground">{c.text}</span>;
                if (c.type === 'Button' || c.type === 'ImageButton') {
                  return events.includes(c.id) ? (
                    <Button key={c.id} loading={busy} disabled={!c.enabled} onClick={() => fire(c.id, values)}>
                      {(c.text ?? '').trim() || (c.type === 'ImageButton' ? 'Close' : 'Go')}
                    </Button>
                  ) : null;
                }
                return (
                  <div key={c.id} className="min-w-52 flex-1 sm:flex-none">
                    {c.type === 'Image' ? (
                      <ImageField c={c} label={l} value={values[c.id]} onChange={set(c.id)} />
                    ) : c.type === 'FileUpload' ? (
                      <FileField c={c} label={l} value={values[c.id]} onChange={(v) => setValues({ ...values, [c.id]: v })} />
                    ) : (
                      <EngineField c={live(c)} label={l} value={values[c.id]} onChange={set(c.id)} />
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
        {layout ? sections() : controls.filter((c) => c.visible && c.id && shown(c)).map((c) => block(c))}
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

// ────────────────────────────────────────────────────────────────────────────
// 6. PAGE
// Loads the screen from the server and switches between the list and the form.
// ────────────────────────────────────────────────────────────────────────────
export default function WorkCenter() {
  const me = useMe();
  const { pathname } = useLocation();
  const path = route;
  const screen = me ? screenOf(me.menu, pathname) : null;
  const [spec, setSpec] = useState(null);
  const [view, setView] = useState({ kind: 'list' });
  const [error, setError] = useState('');
  const [seq, setSeq] = useState(0);
  const [listFilter, setListFilter] = useState({});
  const show = (v) => {
    setError('');
    setSeq((n) => n + 1); // a fresh form each time, never on unrelated re-renders
    setView(v);
  };

  useEffect(() => {
    setSpec(null);
    api(`/forms/spec?path=${enc(path)}`)
      .then((s) => {
        setSpec(s);
        show(s.startOnList ? { kind: 'list' } : { kind: 'form', mode: 'new', state: s });
      })
      .catch((e) => setError(e.message));
  }, [path]);

  const run = (p) => p.catch((e) => setError(e.message));
  const open = (key, notice) => run(api(`/forms/record?path=${enc(path)}&key=${enc(key)}`).then((state) => show({ kind: 'form', mode: 'edit', state, notice })));
  // the "new" state is rebuilt each time (ClearForm: today's date, refreshed lists)
  const fresh = (notice) => run(api(`/forms/spec?path=${enc(path)}`).then((state) => show({ kind: 'form', mode: 'new', state, notice })));
  const copy = (key) => run(api(`/forms/copy?path=${enc(path)}&key=${enc(key)}`).then((state) => show({ kind: 'form', mode: 'new', state })));

  const title = spec?.title || screen?.caption || 'Screen';
  return (
    <Page
      icon={layout?.icon ?? screen?.group.icon}
      title={title}
      subtitle={view.kind === 'list' && spec ? 'Saved records — click one to open it' : layout?.subtitle}
      actions={spec && view.kind === 'list' && spec.buttons.add && <Button size="sm" icon={Plus} onClick={() => fresh()}>Add new</Button>}
    >
        <FormError message={error} />
        {!spec ? (
          !error && <Loader />
        ) : view.kind === 'list' ? (
          <RecordList path={path} spec={spec} onOpen={open} filter={listFilter} />
        ) : (
          <RecordForm
            key={seq}
            path={path}
            state={view.state}
            mode={view.mode}
            notice={view.notice}
            buttons={spec.buttons}
            callNewOnSave={spec.callNewOnSave}
            copyOptions={spec.copyOptions}
            print={spec.print}
            printers={spec.printers}
            onReload={(key, notice) => open(key, notice)}
            events={spec.events ?? []}
            onCopy={copy}
            onBack={() => show({ kind: 'list' })}
            onDone={(notice) => fresh(notice)}
            onListFilter={setListFilter}
            layout={layout}
            page={page}
          />
        )}
    </Page>
  );
}
