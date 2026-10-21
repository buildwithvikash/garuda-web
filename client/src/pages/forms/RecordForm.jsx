// One record of an engine screen: the form, its actions (Save / Update / Delete / Print / Copy / Post) and the page's
// server events. Every control with code-behind posts the form and ViewState to /forms/event and applies the patch.
import { ArrowLeft, Copy, Printer, Save, Send, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../api.js';
import { askConfirm } from '../../app/confirm.js';
import Badge from '../../ui/Badge.jsx';
import Button from '../../ui/Button.jsx';
import { FormError } from '../../ui/fields.jsx';
import Modal, { ModalFooter } from '../../ui/Modal.jsx';
import { applyPatch, panelState, uiOf, valuesOf } from './engineState.js';
import { CheckList, ComboField, EngineField, FileField, GuideView, ImageField, Panel, RoleTree } from './FormControls.jsx';
import Grid from './Grid.jsx';
import { PAGES } from './pages.js';
import QCPanel from './QCPanel.jsx';

const EDITOR_TYPES = ['TextBox', 'DropDownList', 'CheckBox', 'Button', 'ImageButton', 'FileUpload', 'Image'];

export default function RecordForm({ path, state, mode: initialMode, notice, buttons: specButtons, callNewOnSave, copyOptions, events, print, printers, onCopy, onBack, onDone, onReload, onListFilter }) {
  const page = PAGES[path] ?? {};
  // TitleControl buttons, as the page's display code may switch them for the record (e.g. Display_Update(false))
  const [buttonPatch, setButtonPatch] = useState({});
  const buttons = { ...specButtons, ...(state.buttons ?? {}), ...buttonPatch };
  const [mode, setMode] = useState(initialMode);
  const [controls, setControls] = useState(state.controls);
  const [values, setValues] = useState(() => valuesOf(state));
  const [error, setError] = useState(notice && !notice.ok ? notice.text : state.statusMessage ?? '');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null); // the reason being typed, or null
  const [copyKey, setCopyKey] = useState('');
  const [viewState, setViewState] = useState(state.viewState ?? {});
  const [printer, setPrinter] = useState(printers?.value ?? '');
  const cancelled = state.recordStatus === 200;
  const saved = useRef(JSON.stringify(valuesOf(state)));
  const dirty = JSON.stringify(values) !== saved.current;
  // a success notice from the step before (saved, deleted, ...) shows once as a toast
  useState(() => notice?.ok && notice.text && toast.success(notice.text === '✔' ? 'Done' : notice.text));

  const report = (r) => {
    if (r.alert) setError(r.alert);
    else {
      setError('');
      if (r.success) toast.success(r.message && r.message !== '✔' ? r.message : 'Done');
    }
  };

  // Postback: a control with a code-behind handler (AutoPostBack, a page button, a grid command) sends the form and
  // the page's ViewState; the server returns { set: { id: patch }, alert?, viewState, ... }.
  async function fire(control, next, arg, base = controls, index) {
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
      if (r.reset) return void onDone(r.alert ? { ok: false, text: r.alert } : { ok: true, text: r.message || 'Saved' });
      report(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function change(id, v) {
    const next = { ...values, [id]: v };
    setValues(next);
    if (events.includes(id)) fire(id, next);
  }
  const set = (id) => (v) => change(id, v);
  // ComboBox: the picked row becomes the list's only item, then its handler (if the page wired one) runs
  const pick = (id) => (item) => {
    const ctl = controls.map((c) => (c.id === id ? { ...c, options: [item] } : c));
    const next = { ...values, [id]: item.value };
    setControls(ctl);
    setValues(next);
    if (events.includes(id)) fire(id, next, undefined, ctl);
  };

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

  const { shown, live } = panelState(controls);
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

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        act(mode === 'new' ? 'save' : 'update');
      }}
    >
      <div className="card sticky top-[calc(var(--page-header-h,0px)+0.5rem)] z-10 flex flex-wrap items-center gap-2 px-3 py-2.5 shadow-sm">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={back}>Back to list</Button>
        <span className="hidden sm:inline-flex items-center gap-2">
          {mode === 'new' ? <Badge variant="info" dot>New record</Badge> : cancelled ? <Badge variant="danger" dot>Cancelled</Badge> : <Badge variant="neutral" dot>Saved record</Badge>}
          {dirty && !cancelled && <Badge variant="warning" dot>Unsaved changes</Badge>}
        </span>
        {print && mode === 'edit' && !cancelled && (
          <span className="flex items-center gap-2">
            {printers && (
              <select className="h-9 pl-3 pr-8 text-sm rounded-lg border border-slate-300 bg-white cursor-pointer" aria-label="Printer" value={printer} onChange={(e) => setPrinter(e.target.value)}>
                {printers.options.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
              </select>
            )}
            <Button variant="secondary" size="sm" icon={Printer} loading={busy} onClick={printLabel}>Print</Button>
          </span>
        )}
        {copyOptions && (
          <span className="flex items-center gap-2">
            <select className="h-9 pl-3 pr-8 text-sm rounded-lg border border-slate-300 bg-white cursor-pointer max-w-56" aria-label="Record to copy" value={copyKey} onChange={(e) => setCopyKey(e.target.value)}>
              {copyOptions.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
            </select>
            <Button variant="secondary" size="sm" icon={Copy} disabled={copyKey === '' || busy} onClick={() => onCopy(copyKey)}>Copy</Button>
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {buttons.post && events.includes('TitleControl:post') && <Button size="sm" icon={Send} loading={busy} onClick={() => fire('TitleControl:post', values)}>Post</Button>}
          {mode === 'edit' && !cancelled && buttons.delete && (
            <Button variant="secondary" size="sm" icon={Trash2} className="text-rose-700! hover:border-rose-300!" onClick={() => setDeleting('')}>Delete</Button>
          )}
          {mode === 'new' && buttons.add && <Button type="submit" size="sm" icon={Save} loading={busy}>Save</Button>}
          {mode === 'edit' && !cancelled && buttons.update && <Button type="submit" size="sm" icon={Save} loading={busy}>Update</Button>}
        </div>
      </div>

      <FormError message={error} />

      <fieldset disabled={cancelled} className="space-y-3">
        {fields.length > 0 && (
          <Panel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map(({ c, label: l }) =>
                c.type === 'ComboBox' ? <ComboField key={c.id} path={path} c={c} label={l} value={values[c.id]} onPick={pick(c.id)} /> : <EngineField key={c.id} c={live(c)} label={l} value={values[c.id]} onChange={set(c.id)} />,
              )}
            </div>
          </Panel>
        )}
        {editors.length > 0 && (
          <Panel>
            <div className="flex flex-wrap items-end gap-4">
              {editors.map((c) => {
                const l = c.caption ?? page.labels?.[c.id] ?? '';
                if (c.type === 'Label') return <span key={c.id} className="pb-2.5 text-sm text-slate-600">{c.text}</span>;
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
        {controls
          .filter((c) => c.visible && c.id && shown(c))
          .map((c) => {
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
          })}
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
            <span className="label">Reason for deleting</span>
            <input className="field" value={deleting} onChange={(e) => setDeleting(e.target.value)} autoFocus />
          </label>
        </Modal>
      )}
    </form>
  );
}
