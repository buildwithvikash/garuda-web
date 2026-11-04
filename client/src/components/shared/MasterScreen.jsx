// A setup screen on its plain API (/api/masters/<name>, server modules/masters/plain-masters.js): the saved records,
// or one record open as numbered steps (the Production Order design). A page names its fields and groups them:
//   <MasterScreen name="departments" title="Department" icon={Building2} sections={[{ title, subtitle, icon, fields: [
//     { f: 'name', label: 'Name', required: true, max: 100 }, { f: 'deptType', label: 'Type', kind: 'select' } ] }]} />
// Field kinds: text (default; `type` number / date / password), select (the server's list), key (the record's number,
// locked), checks (a tick list), tree (the role tree), image (a PNG). The record keeps every field the server gave, shown
// or not, and is sent back whole. After Save / Update the form starts a new record, as the original's did.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, Plus, RotateCw, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import { askConfirm } from '@/app/confirm.js';
import { openedRecord, useRememberView } from '@/lib/recordParam.js';
import { cn } from '@/lib/utils';
import { CheckList, ImageField, RoleTree } from '@/components/shared/FormControls.jsx';
import { Select, TextInput } from '@/components/shared/FormField.jsx';
import { LockedValue, STEP_COLS, Step, TONE_CYCLE } from '@/components/shared/FormStep.jsx';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import RecordsList from '@/components/shared/RecordsList.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';

const enc = encodeURIComponent;

/** the screen's server calls */
export function masterApi(name) {
  const base = `/masters/${name}`;
  return {
    list: (query) => api(`${base}?${query}`),
    searchFields: () => api(`${base}/search-fields`),
    columnValues: (column) => api(`${base}/search-fields/${enc(column)}/values`),
    blank: () => api(`${base}/new`),
    get: (key) => api(`${base}/${enc(key)}`),
    copy: (key) => api(`${base}/${enc(key)}/copy`),
    create: (record) => api(base, { method: 'POST', body: { record } }),
    update: (key, record) => api(`${base}/${enc(key)}`, { method: 'PUT', body: { record } }),
  };
}

/** the saved records (RecordsList's source over the screen's list call); a row opens its record. A coded column named
 *  as one of the form's lists (Status, LicenceType ...) shows the list's text for the stored value, as before. */
function MasterList({ name, onOpen }) {
  const keys = useRef([]);
  const source = useMemo(() => {
    const m = masterApi(name);
    // { field (lower case): { value: text } }, from a blank record's lists
    const names = m.blank().then((b) => Object.fromEntries(Object.entries(b.options).map(([f, o]) => [f.toLowerCase(), Object.fromEntries(o.map((x) => [String(x.value), x.text]))]))).catch(() => ({}));
    return {
      list: (q) =>
        Promise.all([m.list(q), names]).then(([d, n]) => {
          keys.current = d.keys ?? [];
          const byCol = d.columns.map((c) => n[c.toLowerCase()]);
          const rows = d.rows.map((r) => r.map((v, i) => byCol[i]?.[String(v ?? '')] ?? v));
          return { columns: d.columns.map((c) => ({ name: c })), rows, count: d.total, pageSize: d.pageSize };
        }),
      columns: () => m.searchFields().then((cols) => cols.map((c) => ({ name: c.name, operators: c.operators.map((o) => [o.value, o.text]) }))),
      values: (column) => m.columnValues(column),
    };
  }, [name]);
  return <RecordsList tableId={`/masters/${name}`} exportName={name} source={source} onOpen={(r) => keys.current[r.id] && onOpen(keys.current[r.id])} />;
}

/** one record: new (key null) or saved; onDone(notice) after Save / Update starts a new one */
function MasterForm({ name, title, icon, subtitle, sections, layout, canAdd, canUpdate, saveLabel, hasList, initial, onBack, onCopy, onDone }) {
  const formId = useId();
  const m = useMemo(() => masterApi(name), [name]);
  const [form, setForm] = useState(null); // { record, options, status, statusMessage, copyFrom, tree }
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copyKey, setCopyKey] = useState('');
  const saved = useRef('');
  const isNew = !initial.key;

  useEffect(() => {
    let live = true;
    (initial.copyOf ? m.copy(initial.copyOf) : isNew ? m.blank() : m.get(initial.key))
      .then(async (r) => {
        // a copy is a new record: the lists and copy choices come with a blank one
        const b = initial.copyOf ? await m.blank() : null;
        if (!live) return;
        const f = b ? { ...b, record: r.record } : r;
        saved.current = JSON.stringify(f.record);
        setForm(f);
        if (f.statusMessage) toast.error(f.statusMessage, { id: f.statusMessage, duration: 6000 });
      })
      .catch((e) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [m, initial]);

  const dirty = !!form && JSON.stringify(form.record) !== saved.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const cancelled = form?.status === 200;
  const set = (f) => (v) => setForm((x) => ({ ...x, record: { ...x.record, [f]: v } }));

  async function back() {
    if (dirty && !(await askConfirm({ title: 'Leave without saving?', message: 'Your changes on this form will be lost.', confirmLabel: 'Leave', variant: 'danger' }))) return;
    onBack();
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = isNew ? await m.create(form.record) : await m.update(initial.key, form.record);
      if (r.logout) return void window.location.assign('/login'); // a password changed: sign in again
      saved.current = JSON.stringify(form.record);
      // what the screen itself alerted wins over the success message
      onDone(r.alert ? { ok: false, text: r.alert } : { ok: true, text: r.message || 'Saved' });
    } catch (err) {
      toast.error(err.alert ?? err.message, { id: err.message, duration: 6000 });
    } finally {
      setBusy(false);
    }
  }

  const shell = (children, actions) => (
    <Page icon={icon} title={title} subtitle={subtitle} actions={actions}>
      {children}
    </Page>
  );
  const backButton = hasList && (
    <Button type="button" variant="outline" icon={ArrowLeft} className="h-10" onClick={back}>
      Back to list
    </Button>
  );
  if (loadError)
    return shell(
      <div className="flex flex-col items-start gap-3 p-4">
        <p role="alert" className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" icon={RotateCw} onClick={() => window.location.reload()}>Try again</Button>
      </div>,
      backButton,
    );
  if (!form) return shell(<Loader />);

  const { record, options } = form;
  const opts = (f) => (options[f] ?? []).map((o) => ({ value: o.value, label: o.text }));

  function field(x) {
    const { f, label, kind = 'text', required, max, type, span, selectAll } = x;
    const cls = cn('min-w-0', span === 'full' ? 'col-span-full' : span === 2 && 'sm:col-span-2');
    if (kind === 'key') return <LockedValue key={f} label={label} value={/^0?$/.test(String(record[f] ?? '').trim()) ? '' : record[f]} placeholder="Auto-generated" className={cls} />;
    if (kind === 'select') return <Select key={f} label={label} required={required} value={record[f]} options={opts(f)} onChange={(v) => set(f)(v ?? '')} className={cls} />;
    if (kind === 'image') return <div key={f} className={cls}><ImageField c={{ id: f }} label={label} value={record[f]} onChange={set(f)} /></div>;
    if (kind === 'tree') return <div key={f} className="col-span-full min-w-0"><RoleTree c={{ nodes: form.tree ?? [], enabled: !cancelled }} label={label} value={record[f]} onChange={set(f)} /></div>;
    if (kind === 'checks') {
      const all = (options[f] ?? []).map((o) => o.value);
      const every = all.length > 0 && all.every((v) => (record[f] ?? []).includes(v));
      return (
        <div key={f} className="col-span-full min-w-0 space-y-2">
          {/* "Select all": every item ticked / unticked, as the original's check box did */}
          {selectAll && (
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground/80 select-none">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={every} onChange={(e) => set(f)(e.target.checked ? all : [])} /> Select all
            </label>
          )}
          <CheckList c={{ options: options[f] ?? [], enabled: !cancelled }} label={label} value={record[f]} onChange={set(f)} search={all.length > 12} />
        </div>
      );
    }
    return (
      <TextInput
        key={f}
        label={label}
        required={required}
        type={type}
        step={type === 'number' ? 1 : undefined}
        inputMode={type === 'number' ? 'numeric' : undefined}
        autoComplete={type === 'password' ? 'new-password' : undefined}
        maxLength={max}
        value={record[f] ?? ''}
        onChange={(e) => set(f)(e.target.value)}
        className={cls}
      />
    );
  }

  const showStatus = !isNew && 'status' in record && options.status;
  const actions = (
    <div className="flex flex-wrap items-end gap-3">
      <span className="hidden items-center gap-2 self-center xl:inline-flex">
        {isNew ? <Badge variant="info" dot>New record</Badge> : cancelled ? <Badge variant="danger" dot>Cancelled</Badge> : <Badge variant="neutral" dot>Saved record</Badge>}
        {dirty && !cancelled && <Badge variant="warning" dot>Unsaved changes</Badge>}
      </span>
      {backButton}
      {/* a new record takes the default status (Active); it shows once the record is saved */}
      {showStatus && <div className="w-56"><Select label="Record status" value={record.status} options={opts('status')} onChange={(v) => set('status')(v ?? '')} disabled={cancelled} /></div>}
      {form.copyFrom && (
        <span className="flex items-center gap-2">
          <NativeSelect className="h-10 w-auto max-w-56" aria-label="Record to copy" value={copyKey} onChange={(e) => setCopyKey(e.target.value)}>
            <option value="">Copy from…</option>
            {form.copyFrom.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
          </NativeSelect>
          <Button type="button" variant="outline" icon={Copy} className="h-10" disabled={copyKey === '' || busy} onClick={() => onCopy(copyKey)}>Copy</Button>
        </span>
      )}
      {((isNew && canAdd) || (!isNew && !cancelled && canUpdate)) && (
        <Button type="submit" form={formId} icon={Save} loading={busy} className="h-10 px-5">
          {isNew ? saveLabel : 'Update'}
        </Button>
      )}
    </div>
  );

  return shell(
    <form id={formId} onSubmit={submit}>
      <fieldset disabled={cancelled} className={cn('grid min-w-0 items-start gap-2', layout)}>
        {sections.map((s, i) => (
          <Step key={s.title} n={i + 1} tone={s.tone ?? TONE_CYCLE[i % TONE_CYCLE.length]} icon={s.icon} title={s.title} subtitle={s.subtitle}>
            <div className={STEP_COLS[s.cols ?? 4]}>{s.fields.map(field)}</div>
          </Step>
        ))}
      </fieldset>
    </form>,
    actions,
  );
}

/** the screen: its saved records, or one record open. hasList false: the form only (Change / Reset Password).
 *  canAdd false: records are only changed (Company). layout: grid classes placing the sections (default one under another). */
export default function MasterScreen({ name, title, icon, subtitle, sections, layout, hasList = true, canAdd = true, canUpdate = true, saveLabel = 'Save' }) {
  const remember = useRememberView();
  const [view, setView] = useState(() => {
    const r = hasList ? openedRecord() : 'new';
    return r && (r !== 'new' || canAdd) ? { kind: 'form', key: r === 'new' ? null : r } : { kind: 'list' };
  });
  const [seq, setSeq] = useState(0); // a fresh form each time one is shown
  const show = (v, notice) => {
    setSeq((n) => n + 1);
    setView(v);
    if (hasList) remember(v.kind === 'form' ? { kind: 'form', mode: v.key ? 'edit' : 'new', key: v.key } : v);
    if (notice) notice.ok ? toast.success(notice.text) : toast.error(notice.text, { id: notice.text, duration: 6000 });
  };
  const newRecord = (notice) => show({ kind: 'form', key: null }, notice);

  if (view.kind === 'list')
    return (
      <Page icon={icon} title={title} subtitle="Saved records — click one to open it" actions={canAdd && <Button size="sm" icon={Plus} onClick={() => newRecord()}>Add new</Button>}>
        <MasterList name={name} onOpen={(key) => show({ kind: 'form', key })} />
      </Page>
    );
  return (
    <MasterForm
      key={seq}
      name={name}
      title={title}
      icon={icon}
      subtitle={subtitle}
      sections={sections}
      layout={layout}
      canAdd={canAdd}
      canUpdate={canUpdate}
      saveLabel={saveLabel}
      hasList={hasList}
      initial={view}
      onBack={() => show({ kind: 'list' })}
      onCopy={(key) => show({ kind: 'form', key: null, copyOf: key })}
      // Save / Update start a new record (the list, where nothing new can be added)
      onDone={(notice) => (canAdd ? newRecord(notice) : show(hasList ? { kind: 'list' } : { kind: 'form', key: null }, notice))}
    />
  );
}
