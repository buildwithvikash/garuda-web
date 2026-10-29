// Department: the list view (the saved records). The page (../Department.jsx) shows it; a row opens the form (./Form.jsx).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { screenApi } from '@/lib/screenApi.js';
import DataTable from '@/components/shared/DataTable.jsx';
import { dropdownNames, nameIn } from '@/lib/dropdownNames.js';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';

const enc = encodeURIComponent;

// ────────────────────────────────────────────────────────────────────────────
// 4. LIST VIEW
// The saved records of this screen.
// ────────────────────────────────────────────────────────────────────────────
const sel = 'h-8 w-auto min-w-44 text-[13px]';
const inp = 'h-8 w-auto text-[13px]';

/** a list column's place in the page's texts (the columns it does not name come after, as they were) */
const placeOf = (texts, name) => {
  const names = Object.keys(texts.list ?? {});
  return names.indexOf(name) + 1 || names.length + 1;
};
/** texts.list: the page's texts for the list's columns ({ column: { header, hidden } }) */
function RecordList({ path, spec, onOpen, filter = {}, texts = {} }) {
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
    screenApi(path).list(`&page=${page}${q}`)
      .then((d) => (setData(d), setError(null)))
      .catch((e) => toast.error(e.message, { id: e.message, duration: 6000 }))
      .finally(() => setLoading(false));
  }, [path, page, applied, filter]);
  useEffect(load, [load]);

  const col = spec.searchColumns.find((c) => c.name === search.column);
  async function pickColumn(name) {
    const c = spec.searchColumns.find((x) => x.name === name);
    setSearch({ column: name, op: c?.operators[0]?.[0] ?? '', value: '' });
    setValues(name ? await screenApi(path).distinct(name).catch(() => []) : []);
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

  // a column the form has as a dropdown shows its names, not the stored codes (Status 1 -> Active)
  const names = useMemo(() => dropdownNames(spec), [spec]);
  const columns = useMemo(
    () => (data?.columns ?? []).map((c, i) => ({ key: `c${i}`, name: c.name, header: texts.list?.[c.name]?.header ?? c.name, exactHeader: texts.list?.[c.name]?.header != null, text: (r) => nameIn(names, c.name, r[`c${i}`]), render: (r) => { const v = nameIn(names, c.name, r[`c${i}`]); return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v ?? '—'; } })).filter((c) => !texts.list?.[c.name]?.hidden).sort((x, y) => placeOf(texts, x.name) - placeOf(texts, y.name)),
    [data, texts, names],
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
      exportName={spec.title?.replaceAll(' ', '-').toLowerCase() || 'records'}
      pagination={data && { meta: { page: page + 1, pageSize: data.pageSize, total: data.count, totalPages }, onPage: (p) => setPage(p - 1) }}
    />
  );
}

export default RecordList;
