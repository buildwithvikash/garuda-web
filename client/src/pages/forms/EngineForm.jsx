// TitleControl + TopPanel/ViewPanel pages (the original form engine): record list -> form with Save/Update/Delete,
// Copy, and the child controls (GridView rows, role TreeView, CheckBoxList). Per-page code-behind lives in pages.js.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { PAGES } from './pages.js';

const enc = encodeURIComponent;

function RecordList({ path, spec, onOpen, onAdd, filter = {} }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState({ column: '', op: '', value: '' });
  const [applied, setApplied] = useState(null);
  const [values, setValues] = useState([]);

  const load = useCallback(() => {
    // filter: what the page's own code put in the list's Tag (e.g. the area chosen on the form)
    const q = (applied ? `&column=${enc(applied.column)}&op=${enc(applied.op)}&value=${enc(applied.value)}` : '') + Object.entries(filter).map(([k, v]) => `&f.${enc(k)}=${enc(v)}`).join('');
    api(`/forms/list?path=${enc(path)}&page=${page}${q}`).then(setData).catch((e) => setError(e.message));
  }, [path, page, applied, filter]);
  useEffect(load, [load]);

  const col = spec.searchColumns.find((c) => c.name === search.column);
  async function pickColumn(name) {
    const c = spec.searchColumns.find((x) => x.name === name);
    setSearch({ column: name, op: c?.operators[0]?.[0] ?? '', value: '' });
    setValues(name ? await api(`/forms/distinct?path=${enc(path)}&column=${enc(name)}`).catch(() => []) : []);
  }
  const pages = data ? Math.max(1, Math.ceil(data.count / data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label className="min-w-44"><span className="label">Column</span>
          <select className="field" value={search.column} onChange={(e) => pickColumn(e.target.value)}>
            <option value="" />
            {spec.searchColumns.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
        </label>
        {col && (
          <>
            <label className="min-w-36"><span className="label">Condition</span>
              <select className="field" value={search.op} onChange={(e) => setSearch((s) => ({ ...s, op: e.target.value }))}>
                {col.operators.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <label className="min-w-52"><span className="label">Value</span>
              {search.op === 'like' ? (
                <input className="field" value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))} />
              ) : (
                <select className="field" value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))}>
                  <option value="" />
                  {values.map((v, i) => <option key={i}>{v}</option>)}
                </select>
              )}
            </label>
          </>
        )}
        <button className="btn" disabled={!col || search.value === ''} onClick={() => { setPage(0); setApplied(search); }}>Search</button>
        <button className="btn-ghost ring-1 ring-slate-200" onClick={() => { setApplied(null); setSearch({ column: '', op: '', value: '' }); setPage(0); }}>Refresh</button>
        {spec.buttons.add && <button className="btn ml-auto" onClick={onAdd}>+ Add new</button>}
      </div>
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {data && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="w-10 px-3 py-2" />{data.columns.map((c, i) => <th key={i} className="whitespace-nowrap px-3 py-2">{c.name}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.length === 0 && <tr><td colSpan={data.columns.length + 1} className="px-3 py-6 text-center text-slate-400">No records</td></tr>}
                {data.rows.map((r, i) => (
                  <tr key={i} className="cursor-pointer hover:bg-brand-50/60" onClick={() => data.keys[i] && onOpen(data.keys[i])}>
                    <td className="px-3 py-1.5 text-brand-600" aria-label="Open">✎</td>
                    {r.map((v, j) => <td key={j} className="whitespace-nowrap px-3 py-1.5">{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-sm text-slate-500">
            <span>{data.count.toLocaleString('en-IN')} records</span>
            <span className="flex items-center gap-2">
              <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              Page {page + 1} of {pages}
              <button className="btn-ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ c, label, value, onChange }) {
  const id = `f-${c.id}`;
  const common = { id, disabled: !c.enabled, readOnly: c.readOnly, required: c.required, className: 'field' };
  let input;
  if (c.type === 'DropDownList') {
    input = (
      <select {...common} size={c.listBox ? 5 : undefined} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {c.options.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
      </select>
    );
  } else if (c.type === 'CheckBox') {
    return (
      <label className="flex items-center gap-2 pt-6 text-sm">
        <input type="checkbox" id={id} checked={!!value} disabled={!c.enabled} onChange={(e) => onChange(e.target.checked)} /> {label || c.text}
      </label>
    );
  } else if (c.inputType === 'textarea') {
    input = <textarea {...common} rows={4} value={value ?? ''} maxLength={c.maxLength > 0 && c.maxLength < 100000 ? c.maxLength : undefined} onChange={(e) => onChange(e.target.value)} />;
  } else {
    input = <input {...common} type={c.inputType} step={c.step} value={value ?? ''} maxLength={c.maxLength > 0 && c.maxLength < 100000 ? c.maxLength : undefined} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div>
      <label htmlFor={id} className="label">{label}{c.required && <span className="text-red-500"> *</span>}</label>
      {input}
    </div>
  );
}

/** ProcessGuide's guide file: a PDF, an AutoCAD drawing (sharecad viewer) or an image */
const GuideView = ({ g }) =>
  g.kind === 'png' ? <img src={g.url} alt="" className="max-h-[70vh] rounded" /> : <iframe title="Guide file" className="h-[70vh] w-full rounded" src={g.kind === 'dwg' ? `//sharecad.org/cadframe/load?url=${g.url}` : g.url} allowFullScreen />;

const Section = ({ title, children }) => (
  <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
    {title && <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>}
    {children}
  </section>
);

/** CheckBoxList, with the page's search box if it has one (SearchCheckList: case-insensitive "contains"). */
function CheckList({ c, label, value, onChange, search }) {
  const [q, setQ] = useState('');
  const on = new Set(value ?? []);
  const shown = c.options.filter((o) => q === '' || o.text.toUpperCase().includes(q.toUpperCase()));
  const toggle = (v, checked) => onChange(c.options.map((o) => o.value).filter((x) => (x === v ? checked : on.has(x))));
  return (
    <Section title={label}>
      {search && <input className="field mb-3 max-w-sm" placeholder="Search process" aria-label="Search process" value={q} onChange={(e) => setQ(e.target.value)} />}
      <ul className="grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((o) => (
          <li key={o.value}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!c.enabled} checked={on.has(o.value)} onChange={(e) => toggle(o.value, e.target.checked)} /> {o.text}
            </label>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Role TreeView with the page's OnTreeClick script: a click sets all descendants; a checked node checks its
 *  ancestors; an unchecked node unchecks its parent only when all its siblings are unchecked (and so on upwards). */
function RoleTree({ c, label, value, onChange }) {
  const on = new Set(value ?? []);
  const parents = useMemo(() => {
    const m = new Map();
    const walk = (n, p) => {
      m.set(n.value, p);
      n.children.forEach((x) => walk(x, n));
    };
    (c.nodes ?? []).forEach((n) => walk(n, null));
    return m;
  }, [c.nodes]);
  function toggle(node, checked) {
    const next = new Set(on);
    const all = (n) => [n, ...n.children.flatMap(all)];
    for (const n of all(node)) checked ? next.add(n.value) : next.delete(n.value);
    let state = checked;
    for (let p = parents.get(node.value); p; p = parents.get(p.value)) {
      state = state || p.children.some((s) => next.has(s.value));
      state ? next.add(p.value) : next.delete(p.value);
    }
    onChange([...next]);
  }
  const Node = ({ n }) => (
    <li>
      <label className="flex items-center gap-2 py-0.5 text-sm">
        <input type="checkbox" disabled={!c.enabled} checked={on.has(n.value)} onChange={(e) => toggle(n, e.target.checked)} /> {n.text}
      </label>
      {n.children.length > 0 && <ul className="ml-6 border-l border-slate-100 pl-2">{n.children.map((x) => <Node key={x.value} n={x} />)}</ul>}
    </li>
  );
  return (
    <Section title={label}>
      <ul className="gap-8 md:columns-2 xl:columns-3">{(c.nodes ?? []).map((n) => <div key={n.value} className="break-inside-avoid"><Node n={n} /></div>)}</ul>
    </Section>
  );
}

/** GridView (BoundFields); rows live in the form until Save/Update, as in ViewState. Its Select (edit) and Delete
 *  command columns run the page's handlers on the server, with the row's DataKey. */
function Grid({ c, rows = [], onSelect, onDelete, onEdit, onCommand }) {
  // BoundFields show text; TemplateFields (a TextBox bound to "<header without spaces>") are edited in place
  // no columns in the markup: AutoGenerateColumns, one per data column
  const markup = c.columns.length ? c.columns : Object.keys(rows[0] ?? {}).filter((k) => !k.startsWith('__')).map((k) => ({ kind: 'boundfield', dataField: k, header: k }));
  const cols = markup
    .filter((x) => x.dataField || x.kind === 'templatefield')
    .map((x) => ({ ...x, field: x.dataField ?? x.template?.bind ?? x.header.replaceAll(' ', ''), edit: x.kind === 'templatefield' && (x.template?.type ?? 'TextBox') === 'TextBox', command: x.template?.type === 'Button' ? x.template : null }));
  const key = (r) => r[c.keyName] ?? '';
  return (
    <Section>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{onSelect && <th className="w-10" />}{cols.map((x) => <th key={x.field} className="whitespace-nowrap px-3 py-2">{x.header || x.field}</th>)}{onDelete && <th className="w-10" />}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={cols.length + 2} className="px-3 py-4 text-center text-slate-400">No rows</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} className={r.__color === 'green' ? 'bg-green-100' : r.__color === 'red' ? 'bg-red-100' : undefined}>
                {onSelect && <td className="px-2"><button type="button" className="text-brand-600" aria-label="Edit row" onClick={() => onSelect(key(r), i)}>✎</button></td>}
                {cols.map((x) => (
                  <td key={x.field} className="whitespace-nowrap px-3 py-1.5">
                    {x.command ? (
                      onCommand && <button type="button" className="btn-ghost py-0.5 ring-1 ring-slate-200" onClick={() => onCommand(x.command.command, key(r), i)}>{x.command.text}</button>
                    ) : x.edit ? (
                      <input className="field w-20 py-1" aria-label={`${x.header} row ${i + 1}`} value={r[x.field] ?? ''} onChange={(e) => onEdit(i, x.field, e.target.value)} />
                    ) : (
                      r[x.field]
                    )}
                  </td>
                ))}
                {onDelete && <td className="px-2"><button type="button" className="text-red-600" aria-label="Remove row" onClick={() => onDelete(key(r), i)}>✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/** A GridView the page fills with a calendar (minutes down, days across): free time green, a job card red. */
function Calendar({ c }) {
  const { days, blocks } = c.calendar;
  return (
    <Section>
      <div className="max-h-[70vh] overflow-auto">
        <div className="sticky top-0 z-10 flex bg-slate-50 text-xs font-medium text-slate-500">
          <div className="w-12 shrink-0 px-1 py-2">Time</div>
          {days.map((d) => <div key={d} className="w-24 shrink-0 px-1 py-2">{d}</div>)}
        </div>
        <div className="flex">
          <div className="w-12 shrink-0">
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="h-[60px] border-t border-slate-100 px-1 text-xs text-slate-400">{h}</div>)}
          </div>
          {days.map((d) => (
            <div key={d} className="relative h-[1440px] w-24 shrink-0 border-l border-slate-100">
              {blocks.filter((b) => b.day === d).map((b) => (
                <div key={b.start} title={b.text.trim() || 'Free'} className={`absolute inset-x-0.5 overflow-hidden rounded text-[10px] ${b.color === 'busy' ? 'bg-red-500 text-white' : 'bg-green-200'}`} style={{ top: b.start, height: b.span }}>
                  {b.text.trim()}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** QCValueCaptureControl: the checklist popup. Its state (rows, shown item, inputs) is the control's value; its
 *  buttons run the page's "QC:<name>" events on the server. */
function QCPanel({ s, busy, onChange, onEvent }) {
  const f = s.f;
  const set = (patch) => onChange({ ...s, f: { ...f, ...patch } });
  const url = (u) => (u ?? '').replace(/^~\//, '/');
  const cellOf = (r, n) => r[Object.keys(r).find((k) => k.toLowerCase() === n.toLowerCase())];
  const rows = s.rows ?? [];
  return (
    <Section>
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-slate-800">{f.lblTitle}</h2>
        <button type="button" className="btn-ghost" disabled={busy} aria-label="Close" onClick={() => onEvent('QC:close')}>✕</button>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{f.LblDescription}</p>
          {f.LblMaxMin.visible && <p className="text-xs text-slate-500">{f.LblMaxMin.text}</p>}
          {f.TopDataPanel && (
            <div className="space-y-3">
              {f.DataPanel && (
                <div className="flex flex-wrap items-end gap-3">
                  {f.TBValue.visible && (
                    <label className="text-sm">
                      {f.LblValue && <span className="label">Value</span>}
                      <input className="field" type={f.TBValue.mode === 'Number' ? 'number' : 'text'} value={f.TBValue.text} onChange={(e) => set({ TBValue: { ...f.TBValue, text: e.target.value } })} onBlur={() => onEvent('QC:value')} />
                    </label>
                  )}
                  {f.DDLUom.visible && (
                    <select className="field w-28" aria-label="UOM" value={f.DDLUom.value} onChange={(e) => set({ DDLUom: { ...f.DDLUom, value: e.target.value } })}>
                      {f.DDLUom.options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
                    </select>
                  )}
                  {f.DDLList.visible && (
                    <label className="text-sm">
                      {f.LblList && <span className="label">Select from List</span>}
                      <select className="field" value={f.DDLList.value} onChange={(e) => onEvent('QC:list', { ...s, f: { ...f, DDLList: { ...f.DDLList, value: e.target.value } } })}>
                        {f.DDLList.options.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
                      </select>
                    </label>
                  )}
                  {f.PnlImage && (
                    <div>
                      {f.Image && <img src={f.Image} alt="" className="mb-2 h-24 rounded ring-1 ring-slate-200" />}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        aria-label="Photo"
                        className="text-sm"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const r = new FileReader();
                          r.onload = () => set({ TBImage: String(r.result), Image: String(r.result) });
                          r.readAsDataURL(file);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="label">Remark</span>
                  <input className="field" value={f.TBRemark} onChange={(e) => set({ TBRemark: e.target.value })} />
                </label>
                {f.DdlQCStatus.visible && (
                  <label className="text-sm">
                    {f.Label2 && <span className="label">Quality Status</span>}
                    <select className="field w-32" value={f.DdlQCStatus.value} onChange={(e) => set({ DdlQCStatus: { ...f.DdlQCStatus, value: e.target.value } })}>
                      <option value="1">Pass</option>
                      <option value="0">Fail</option>
                    </select>
                  </label>
                )}
              </div>
              {f.InstrumentPanel && (
                <div className="flex items-end gap-2">
                  <label className="text-sm">
                    <span className="label">AssetID</span>
                    <input className="field" value={f.TBBarcode.text} onChange={(e) => set({ TBBarcode: { ...f.TBBarcode, text: e.target.value } })} />
                  </label>
                  <button type="button" className="btn" disabled={busy} onClick={() => onEvent('QC:go')}>Go</button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="btn-ghost ring-1 ring-slate-200" disabled={busy || !f.BtnPrevious.enabled} onClick={() => onEvent('QC:prev')}>{f.BtnPrevious.text}</button>
                <button type="button" className="btn" disabled={busy} onClick={() => onEvent('QC:save')}>Save</button>
                <button type="button" className="btn-ghost ring-1 ring-slate-200" disabled={busy || !f.BtnNext.enabled} onClick={() => onEvent('QC:next')}>{f.BtnNext.text}</button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="w-8" /><th className="px-2 py-1">Code</th><th className="px-2 py-1">Parameter</th><th className="px-2 py-1">Value</th><th className="px-2 py-1">Remark</th><th className="px-2 py-1">Result</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => {
                  const type = String(cellOf(r, 'InputType') ?? '').toLowerCase();
                  const v = cellOf(r, 'qcvalue');
                  const yes = v === null || v === undefined || v === '' ? true : ['1', 'true', 'y', 'yes'].includes(String(v).trim().toLowerCase());
                  return (
                    <tr key={i}>
                      <td className="px-2"><button type="button" className="text-brand-600" aria-label="Show item" disabled={busy} onClick={() => onEvent('QC:select', s, String(cellOf(r, 'LineCode') ?? ''), i)}>✎</button></td>
                      <td className="px-2 py-1">{cellOf(r, 'LineCode')}</td>
                      <td className="px-2 py-1">{cellOf(r, 'Name')}</td>
                      <td className="px-2 py-1">{type === 'bit' && s.bound === false ? (v == null ? '' : String(v) === '1' ? 'Yes' : 'No') : type === 'bit' ? <input type="checkbox" disabled checked={yes} aria-label="Value" /> : type === 'image' && v != null ? <img src={v} alt="" className="h-10" /> : v}</td>
                      <td className="px-2 py-1">{cellOf(r, 'remark')}</td>
                      <td className="px-2 py-1">{String(cellOf(r, 'qcstatus') ?? '') === '1' ? '✔' : '✘'}</td>
                      <td className="px-2 py-1">
                        {type === 'bit' && v != null && (String(v) === '1'
                          ? <button type="button" className="btn-ghost py-0.5 ring-1 ring-slate-200" disabled={busy} onClick={() => onEvent('QC:Fail', s, '', i)}>Fail</button>
                          : <button type="button" className="btn-ghost py-0.5 ring-1 ring-slate-200" disabled={busy} onClick={() => onEvent('QC:Pass', s, '', i)}>Pass</button>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {f.GuideImage.visible && f.GuideImage.url && <img src={url(f.GuideImage.url)} alt="" className="max-h-80 rounded ring-1 ring-slate-200" />}
      </div>
    </Section>
  );
}

/** ComboBoxControl: shows the one item picked; "…" opens a picker (first 2000 rows, or a search) whose rows are
 *  value + the other columns; picking one makes it the list's only item. */
function ComboField({ path, c, label, value, onPick }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = (q) =>
    api(`/forms/combo?path=${enc(path)}&id=${enc(c.id)}${q == null ? '' : `&search=${enc(q)}`}`)
      .then((d) => (setData(d), setErr('')))
      .catch((e) => setErr(e.message));
  const current = c.options?.find((o) => o.value === value);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <input className="field" readOnly value={current ? current.text : ''} aria-label={label || c.id} />
        <button type="button" className="btn-ghost ring-1 ring-slate-200" disabled={!c.enabled} onClick={() => (open ? setOpen(false) : (setOpen(true), setSearch(''), setData(null), load(null)))}>…</button>
      </div>
      {open && (
        <div className="mt-2 rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200">
          <div className="mb-2 flex gap-2">
            <input className="field" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), load(search))} />
            <button type="button" className="btn-ghost ring-1 ring-slate-200" onClick={() => load(search)} aria-label="Search">🔍</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>
          {err && <div role="alert" className="text-sm text-red-600">{err}</div>}
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {(data?.rows ?? []).map((r, i) => (
                  <tr key={i} className="cursor-pointer hover:bg-brand-50/60" onClick={() => (setOpen(false), onPick({ value: r[0], text: r.length > 1 ? r[1] : r[0] }))}>
                    {r.slice(1).map((x, j) => <td key={j} className="px-2 py-1">{x}</td>)}
                    {r.length === 1 && <td className="px-2 py-1">{r[0]}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** UploadImage user control: a PNG read into a data URL (what its hidden TBImage held). */
function ImageField({ c, label, value, onChange }) {
  return (
    <div>
      <span className="label">{label}</span>
      {value && <img src={value} alt="" className="mb-2 h-20 rounded ring-1 ring-slate-200" />}
      <input
        type="file"
        accept="image/png"
        aria-label={label || c.id}
        className="text-sm"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => onChange(r.result);
          r.readAsDataURL(f);
        }}
      />
    </div>
  );
}

/** asp:FileUpload: the picked file as { name, data (base64) }; a postback clears it, as the browser did */
function FileField({ c, label, value, onChange }) {
  return (
    <div>
      <span className="label">{label}</span>
      <input
        key={value ? 'picked' : 'empty'}
        type="file"
        aria-label={label || c.id}
        className="text-sm"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return onChange(null);
          const r = new FileReader();
          r.onload = () => onChange({ name: f.name, data: String(r.result).split(',')[1] ?? '' });
          r.readAsDataURL(f);
        }}
      />
    </div>
  );
}

const valuesOf = (state) => Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : c.value]));

// the page as shown: what page code reads back (Visible / Enabled / Text, the items of a page-filled list or of any
// list an event refilled - the server only knows the items the form was built with)
const uiOf = (controls) => Object.fromEntries(controls.filter((c) => c.id).map((c) => [c.id, { visible: c.visible !== false, enabled: c.enabled !== false, text: c.text ?? '', ...((c.page || c.refilled) && c.options ? { options: c.options } : {}) }]));

function RecordForm({ path, state, mode: initialMode, notice, buttons: specButtons, callNewOnSave, copyOptions, events, print, printers, onCopy, onBack, onDone, onReload, onListFilter }) {
  const page = PAGES[path] ?? {};
  // TitleControl buttons, as the page's display code may switch them for the record (e.g. Display_Update(false))
  // ...and the page's events (TitleControl.Display_Save / Display_Post ...)
  const [buttonPatch, setButtonPatch] = useState({});
  const buttons = { ...specButtons, ...(state.buttons ?? {}), ...buttonPatch };
  const [mode, setMode] = useState(initialMode);
  const [controls, setControls] = useState(state.controls);
  const [values, setValues] = useState(() => valuesOf(state));
  const [msg, setMsg] = useState(notice ?? (state.statusMessage ? { ok: false, text: state.statusMessage } : null));
  const [busy, setBusy] = useState(false);
  const [remark, setRemark] = useState(null);
  const [copyKey, setCopyKey] = useState('');
  const [viewState, setViewState] = useState(state.viewState ?? {});
  const [printer, setPrinter] = useState(printers?.value ?? '');
  const cancelled = state.recordStatus === 200;

  // Postback: a control with a code-behind handler (AutoPostBack, a page button, a grid command) sends the form and
  // the page's ViewState to the server, which returns { set: { id: { options?, index?, value?, rows?, visible?,
  // text? } }, alert?, viewState } (options first, then SelectedIndex / SelectedValue).
  async function fire(control, next, arg, base = controls, index) {
    setBusy(true);
    try {
      const ui = uiOf(base);
      const r = await api('/forms/event', { method: 'POST', body: { path, control, values: next, viewState, arg, index, ui } });
      const patch = r.set ?? {};
      const ctl = base.map((c) => {
        const p = patch[c.id];
        if (!p) return c;
        return { ...c, ...(p.options ? { options: p.options, refilled: true } : {}), ...('visible' in p ? { visible: p.visible } : {}), ...('text' in p ? { text: p.text } : {}), ...('enabled' in p ? { enabled: p.enabled } : {}), ...(p.calendar ? { calendar: p.calendar } : {}), ...('maxLength' in p ? { maxLength: p.maxLength } : {}), ...('guide' in p ? { guide: p.guide } : {}) };
      });
      const vals = { ...next };
      for (const c of ctl) if (c.type === 'FileUpload') vals[c.id] = null;
      for (const [k, p] of Object.entries(patch)) {
        if ('index' in p) vals[k] = ctl.find((c) => c.id === k)?.options?.[p.index]?.value ?? '';
        if ('value' in p) vals[k] = p.value;
        if (p.rows) vals[k] = p.rows;
      }
      setControls(ctl);
      setValues(vals);
      setViewState(r.viewState ?? viewState);
      if (r.redirect) return void window.location.assign(r.redirect);
      if (r.list) onListFilter?.(r.list);
      if (r.buttons) setButtonPatch((b) => ({ ...b, ...r.buttons }));
      // FooterControl's Save succeeded: the form starts again
      if (r.reset) return void onDone(r.alert ? { ok: false, text: r.alert } : { ok: true, text: r.message || '✔' });
      setMsg(r.alert ? { ok: false, text: r.alert } : r.success ? { ok: true, text: r.message || "✔" } : null);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
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
    setMsg(null);
    try {
      const r = await api('/forms/print', { method: 'POST', body: { path, values, printer } });
      setMsg(r.alert ? { ok: false, text: r.alert } : { ok: true, text: r.success ? '✔' : 'Sent to printer' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }
  // Panel.Enabled = false disables the controls inside it
  const live = (c) => {
    for (let p = c.parent; p; p = controls.find((x) => x.id === p)?.parent) if (controls.find((x) => x.id === p)?.enabled === false) return { ...c, enabled: false };
    return c;
  };
  const panelShown = (c) => {
    for (let p = c.parent; p; p = controls.find((x) => x.id === p)?.parent) if (controls.find((x) => x.id === p)?.visible === false) return false;
    return true;
  };
  // the page's own editors (and engine controls with an empty Tag), in markup order, under their captions
  const searchBoxes = new Set(Object.keys(page.checkSearch ?? {}));
  const editors = controls
    .filter((c) => c.id && c.visible && panelShown(c) && !searchBoxes.has(c.id) && (['TextBox', 'DropDownList', 'CheckBox', 'Button', 'ImageButton', 'FileUpload', 'Image'].includes(c.type) || (c.type === 'Label' && c.page && (c.text ?? '') !== '')) && (c.page || (c.table.trim() === '' && c.column.trim() === '')))
    .sort((a, b) => a.order - b.order);

  // Label + input pairs by Tag (table|column); inputs without a caption still show. TextBoxes with an empty Tag
  // ("|||") take no part in the engine (e.g. a list search box) and are left to the page logic.
  const fields = useMemo(() => {
    const labels = controls.filter((c) => c.type === 'Label');
    return controls
      .filter((c) => ['TextBox', 'DropDownList', 'CheckBox', 'ComboBox'].includes(c.type) && c.visible && panelShown(c) && c.id && (c.table.trim() !== '' || c.column.trim() !== ''))
      .map((c) => ({ c, label: (labels.find((l) => l.table === c.table && l.column === c.column && l.visible)?.text ?? c.column).replace(/\s*:\s*$/, '') }));
  }, [controls]);
  const label = (c) => page.labels?.[c.id] ?? c.caption ?? c.column;
  const searched = new Set(Object.values(page.checkSearch ?? {}));

  async function act(kind, extra = {}) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api(`/forms/${kind}`, { method: 'POST', body: { path, values, viewState, ui: uiOf(controls), ...extra } });
      // a page's own Save handler: it signed the user out (password changed) / reported TitleControl.Success = false
      if (r.logout) return void window.location.assign('/login');
      if (r.ok === false) return void setMsg({ ok: false, text: r.message });
      // what the page itself alerted wins over TitleControl's success message
      const notice = r.alert ? { ok: false, text: r.alert } : { ok: true, text: r.message };
      // the page displays the saved record again (MaterialBarcode: display(PrimaryKey))
      if (r.display) return onReload(r.display, notice);
      // TitleControl: Delete always clears the form; Save/Update clear it unless CallNewOnSave = false,
      // in which case the record stays open for Update/Delete with its new key.
      if (kind === 'cancel' || callNewOnSave) return onDone(notice);
      setMsg(notice);
      setValues((x) => {
        const next = r.key && 'PrimaryKey' in x ? { ...x, PrimaryKey: r.key } : { ...x };
        for (const [k, p] of Object.entries(r.set ?? {})) if ('value' in p) next[k] = p.value;
        return next;
      });
      setMode('edit');
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
      setRemark(null);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(mode === 'new' ? 'save' : 'update');
      }}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <button type="button" className="btn-ghost" onClick={onBack}>← List</button>
        {print && mode === 'edit' && !cancelled && (
          <span className="flex items-center gap-2">
            {printers && (
              <select className="field w-48" aria-label="Printer" value={printer} onChange={(e) => setPrinter(e.target.value)}>
                {printers.options.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
              </select>
            )}
            <button type="button" className="btn-ghost ring-1 ring-slate-200" disabled={busy} onClick={printLabel}>Print</button>
          </span>
        )}
        {copyOptions && (
          <span className="flex items-center gap-2">
            <select className="field w-56" aria-label="Record to copy" value={copyKey} onChange={(e) => setCopyKey(e.target.value)}>
              {copyOptions.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
            </select>
            <button type="button" className="btn-ghost ring-1 ring-slate-200" disabled={copyKey === '' || busy} onClick={() => onCopy(copyKey)}>Copy</button>
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {mode === 'new' && buttons.add && <button className="btn" disabled={busy}>Save</button>}
          {buttons.post && events.includes('TitleControl:post') && <button type="button" className="btn" disabled={busy} onClick={() => fire('TitleControl:post', values)}>Post</button>}
          {mode === 'edit' && !cancelled && buttons.update && <button className="btn" disabled={busy}>Update</button>}
          {mode === 'edit' && !cancelled && buttons.delete && (
            <button type="button" className="btn-ghost text-red-600 ring-1 ring-red-200" onClick={() => setRemark('')}>Delete</button>
          )}
        </div>
      </div>
      {remark !== null && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
          <label className="min-w-72 flex-1"><span className="label">Reason for deleting</span><input className="field" value={remark} onChange={(e) => setRemark(e.target.value)} autoFocus /></label>
          <button type="button" className="btn bg-red-600 hover:bg-red-700" disabled={busy} onClick={() => act('cancel', { remark })}>Confirm delete</button>
          <button type="button" className="btn-ghost" onClick={() => setRemark(null)}>Cancel</button>
        </div>
      )}
      {msg && <div role="alert" className={`rounded-xl p-3 text-sm ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      <fieldset disabled={cancelled} className="space-y-4">
        <div className="grid gap-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(({ c, label: l }) => (c.type === 'ComboBox' ? <ComboField key={c.id} path={path} c={c} label={l} value={values[c.id]} onPick={pick(c.id)} /> : <Field key={c.id} c={live(c)} label={l} value={values[c.id]} onChange={set(c.id)} />))}
        </div>
        {editors.length > 0 && (
          <div className="flex flex-wrap items-end gap-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            {editors.map((c) => {
              const l = c.caption ?? page.labels?.[c.id] ?? '';
              if (c.type === 'Label') return <span key={c.id} className="pb-2 text-sm text-slate-600">{c.text}</span>;
              if (c.type === 'Button' || c.type === 'ImageButton') {
                return events.includes(c.id) ? <button key={c.id} type="button" className="btn" disabled={busy || !c.enabled} onClick={() => fire(c.id, values)}>{(c.text ?? '').trim() || (c.type === 'ImageButton' ? '✕' : '✔')}</button> : null;
              }
              return (
                <div key={c.id} className="min-w-48">
                  {c.type === 'Image' ? <ImageField c={c} label={l} value={values[c.id]} onChange={set(c.id)} /> : c.type === 'FileUpload' ? <FileField c={c} label={l} value={values[c.id]} onChange={(v) => setValues({ ...values, [c.id]: v })} /> : <Field c={live(c)} label={l} value={values[c.id]} onChange={set(c.id)} />}
                </div>
              );
            })}
          </div>
        )}
        {controls.filter((c) => c.visible && c.id && panelShown(c)).map((c) => {
          if (c.type === 'CheckBoxList') return <CheckList key={c.id} c={c} label={label(c)} value={values[c.id]} onChange={set(c.id)} search={searched.has(c.id)} />;
          if (c.type === 'TreeView' && c.nodes) return <RoleTree key={c.id} c={c} label={label(c)} value={values[c.id]} onChange={set(c.id)} />;
          if (c.type === 'GridView' && c.calendar) return <Calendar key={c.id} c={c} />;
          if (c.type === 'Panel' && c.guide) return <Section key={c.id}><GuideView g={c.guide} /></Section>;
          if (c.type === 'Picture') return values[c.id] ? <Section key={c.id}><img src={String(values[c.id]).replace(/^~\//, '/')} alt="" className="max-h-[70vh] rounded" /></Section> : null;
          if (c.type === 'Footer') {
            return events.includes('Footer:save') ? (
              <div key={c.id} className="flex justify-end">
                <button type="button" className="btn" disabled={busy || cancelled} onClick={() => fire('Footer:save', values)}>Save</button>
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
    </form>
  );
}

export default function EngineForm({ path }) {
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

  if (error && !spec) return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!spec) return <div className="p-4 text-sm text-slate-500">Loading…</div>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">{spec.title}</h1>
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {view.kind === 'list' ? (
        <RecordList path={path} spec={spec} onOpen={open} onAdd={() => fresh()} filter={listFilter} />
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
        />
      )}
    </div>
  );
}
