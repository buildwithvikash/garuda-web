// A screen's saved records: column / condition / value search, then QMAS's DataTable with numbered pages.
import { RotateCcw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import Button from '../../ui/Button.jsx';
import DataTable from '../../ui/DataTable.jsx';

const enc = encodeURIComponent;
const sel = 'h-9 pl-3 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 cursor-pointer hover:border-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500';
const inp = 'h-9 px-3 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder-slate-400 hover:border-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500';

export default function RecordList({ path, spec, onOpen, filter = {} }) {
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
        <span className="eyebrow">Search in</span>
        <select className={sel} value={search.column} onChange={(e) => pickColumn(e.target.value)} aria-label="Column">
          <option value="">Choose a column…</option>
          {spec.searchColumns.map((c) => <option key={c.name}>{c.name}</option>)}
        </select>
      </label>
      {col && (
        <>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Condition</span>
            <select className={sel} value={search.op} onChange={(e) => setSearch((s) => ({ ...s, op: e.target.value }))} aria-label="Condition">
              {col.operators.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Value</span>
            {search.op === 'like' ? (
              <input className={`${inp} w-56`} value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))} aria-label="Value" autoFocus />
            ) : (
              <select className={`${sel} w-56`} value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))} aria-label="Value">
                <option value="">Choose…</option>
                {values.map((v, i) => <option key={i}>{v}</option>)}
              </select>
            )}
          </label>
        </>
      )}
      <Button type="submit" size="sm" icon={Search} className="h-9" disabled={!col || search.value === ''}>Search</Button>
      {(applied || search.column) && <Button variant="ghost" size="sm" icon={RotateCcw} className="h-9" onClick={clear}>Clear</Button>}
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
