// Saved production orders: search on one column, numbered pages; a click opens the order.
import { RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import DataTable from '@/components/shared/DataTable.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { columnValues, listOrders, searchFields } from './ordersApi.js';

const sel = 'h-8 w-auto min-w-44 text-[13px]';

export default function OrderList({ onOpen }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState([]);
  const [search, setSearch] = useState({ column: '', op: '', value: '' });
  const [applied, setApplied] = useState(null);
  const [choices, setChoices] = useState([]);

  useEffect(() => {
    searchFields().then(setFields, () => setFields([]));
  }, []);
  useEffect(() => {
    setLoading(true);
    listOrders({ page, search: applied })
      .then((d) => (setData(d), setError(null)))
      .catch((e) => setError({ data: { message: e.message } }))
      .finally(() => setLoading(false));
  }, [page, applied]);

  const field = fields.find((f) => f.name === search.column);
  async function pickColumn(name) {
    const f = fields.find((x) => x.name === name);
    setSearch({ column: name, op: f?.operators[0]?.value ?? '', value: '' });
    setChoices(name ? await columnValues(name).catch(() => []) : []);
  }
  const run = (e) => {
    e?.preventDefault();
    if (!field || search.value === '') return;
    setPage(0);
    setApplied(search);
  };
  const clear = () => (setApplied(null), setSearch({ column: '', op: '', value: '' }), setPage(0));

  const columns = useMemo(() => (data?.columns ?? []).map((name, i) => ({ key: `c${i}`, header: name, text: (r) => r[`c${i}`], render: (r) => r[`c${i}`] ?? '—' })), [data]);
  const rows = useMemo(() => (data?.rows ?? []).map((r, i) => ({ id: i, prodNo: data.keys[i], ...Object.fromEntries(r.map((v, j) => [`c${j}`, v])) })), [data]);

  const leading = (
    <div className="flex w-full flex-wrap items-end gap-x-5 gap-y-3">
      <div className="min-w-fit pb-1">
        <p className="text-sm font-semibold">Find an order</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Filter saved orders</p>
      </div>
      <form onSubmit={run} className="flex min-w-0 flex-1 flex-wrap items-end gap-2.5">
        <label className="flex min-w-44 flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Field</span>
          <NativeSelect className={sel} value={search.column} onChange={(e) => pickColumn(e.target.value)} aria-label="Search field">
            <option value="">Select a field…</option>
            {fields.map((f) => <option key={f.name}>{f.name}</option>)}
          </NativeSelect>
        </label>
        {field && (
          <>
            <label className="flex min-w-36 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Match</span>
              <NativeSelect className={sel} value={search.op} onChange={(e) => setSearch((s) => ({ ...s, op: e.target.value }))} aria-label="Match condition">
                {field.operators.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
              </NativeSelect>
            </label>
            <label className="flex min-w-48 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Value</span>
              {search.op === 'like' ? (
                <Input className="h-8 w-full text-[13px] sm:w-56" value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))} aria-label="Search value" placeholder="Type to search…" />
              ) : (
                <NativeSelect className={`${sel} w-full sm:w-56`} value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))} aria-label="Search value">
                  <option value="">Select a value…</option>
                  {choices.map((v, i) => <option key={i}>{v}</option>)}
                </NativeSelect>
              )}
            </label>
          </>
        )}
        <Button type="submit" size="sm" icon={Search} disabled={!field || search.value === ''}>Search</Button>
        {(applied || search.column) && <Button type="button" variant="ghost" size="sm" icon={RotateCcw} onClick={clear}>Clear</Button>}
      </form>
    </div>
  );

  return (
    <DataTable
      tableId="production-orders"
      columns={columns}
      rows={rows}
      loading={loading}
      error={error}
      leading={leading}
      inlineLeading
      empty={applied ? 'No orders match this search.' : 'No production orders yet.'}
      onRowClick={(r) => r.prodNo && onOpen(r.prodNo)}
      exportName="production-orders"
      pagination={data && { meta: { page: page + 1, pageSize: data.pageSize, total: data.total, totalPages: Math.max(1, Math.ceil(data.total / data.pageSize)) }, onPage: (p) => setPage(p - 1) }}
    />
  );
}
