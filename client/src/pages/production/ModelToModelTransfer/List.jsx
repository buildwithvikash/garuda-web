// Model To Model Transfer: the history (table ModelToModel), read only, with a search on one column.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '@/components/shared/DataTable.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { transfersApi } from './transfersApi.js';

const enc = encodeURIComponent;
const sel = 'h-8 w-auto min-w-44 text-[13px]';
const inp = 'h-8 w-auto text-[13px]';

export default function TransferHistory() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchColumns, setSearchColumns] = useState([]);
  const [search, setSearch] = useState({ column: '', op: '', value: '' });
  const [applied, setApplied] = useState(null);
  const [values, setValues] = useState([]);

  useEffect(() => {
    transfersApi.historyColumns().then(setSearchColumns).catch((e) => toast.error(e.message, { id: e.message, duration: 6000 }));
  }, []);

  const load = useCallback(() => {
    const q = applied ? `&column=${enc(applied.column)}&op=${enc(applied.op)}&value=${enc(applied.value)}` : '';
    setLoading(true);
    transfersApi.history(`page=${page}${q}`)
      .then(setData)
      .catch((e) => toast.error(e.message, { id: e.message, duration: 6000 }))
      .finally(() => setLoading(false));
  }, [page, applied]);
  useEffect(load, [load]);

  const col = searchColumns.find((c) => c.name === search.column);
  async function pickColumn(name) {
    const c = searchColumns.find((x) => x.name === name);
    setSearch({ column: name, op: c?.operators[0]?.[0] ?? '', value: '' });
    setValues(name ? await transfersApi.historyValues(name).catch(() => []) : []);
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

  const columns = useMemo(() => (data?.columns ?? []).map((c, i) => ({ key: `c${i}`, name: c.name, header: c.name, text: (r) => r[`c${i}`], render: (r) => r[`c${i}`] ?? '—' })), [data]);
  const rows = useMemo(() => (data?.rows ?? []).map((r, i) => ({ id: i, ...Object.fromEntries(r.map((v, j) => [`c${j}`, v])) })), [data]);
  const totalPages = data ? Math.max(1, Math.ceil(data.count / data.pageSize)) : 1;

  const leading = (
    <form onSubmit={run} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Search in</span>
        <NativeSelect className={sel} value={search.column} onChange={(e) => pickColumn(e.target.value)} aria-label="Column">
          <option value="">Choose a column…</option>
          {searchColumns.map((c) => <option key={c.name}>{c.name}</option>)}
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
      tableId="/production/modeltomodeltransferform"
      columns={columns}
      rows={rows}
      loading={loading}
      leading={leading}
      empty={applied ? 'No records match this search.' : 'No records yet.'}
      exportName="model-to-model-transfer"
      pagination={data && { meta: { page: page + 1, pageSize: data.pageSize, total: data.count, totalPages }, onPage: (p) => setPage(p - 1) }}
    />
  );
}
