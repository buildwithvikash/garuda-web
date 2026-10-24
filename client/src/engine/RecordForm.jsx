// One record of an engine screen: the form, its actions (Save / Update / Delete / Print / Copy / Post) and the page's
// server events. Every control with code-behind posts the form and ViewState to /forms/event and applies the patch.
import { ArrowLeft, Copy, Printer, Save, Send, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import { askConfirm } from '@/app/confirm.js';
import { Badge } from '@/components/ui/badge.jsx';
import Section from '@/components/shared/Section.jsx';
import Toolbar from '@/components/shared/Toolbar.jsx';
import { Button } from '@/components/ui/button.jsx';
import { FormError } from '@/components/shared/FormField.jsx';
import Modal, { ModalFooter } from '@/components/shared/Modal.jsx';
import { uiOf, valuesOf } from './engineState.js';
import { CheckList, ComboField, EngineField, FileField, GuideView, ImageField, Panel, RoleTree } from './FormControls.jsx';
import Grid from './Grid.jsx';
import QCPanel from './QCPanel.jsx';
import useEngine from './useEngine.js';
import { ScanBox } from '@/components/shopfloor';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { Input } from '@/components/ui/input.jsx';

const EDITOR_TYPES = ['TextBox', 'DropDownList', 'CheckBox', 'Button', 'ImageButton', 'FileUpload', 'Image'];
const WIDE = ['GridView', 'QC', 'CheckBoxList', 'TreeView', 'Picture', 'Footer', 'Panel'];
const INPUT_TYPES = [...EDITOR_TYPES, 'ComboBox', 'GridView', 'QC', 'CheckBoxList', 'TreeView'];

export default function RecordForm({ path, state, mode: initialMode, notice, buttons: specButtons, callNewOnSave, copyOptions, events, print, printers, onCopy, onBack, onDone, onReload, onListFilter, layout, page = {} }) {
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
