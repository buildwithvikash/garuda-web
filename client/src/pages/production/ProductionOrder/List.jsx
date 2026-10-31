// Production Order: the saved orders (search, table, paging). A row opens it in ./Form.jsx.
import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, RotateCcw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '@/components/shared/DataTable.jsx';
import Page from '@/components/shared/Page.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { ordersApi } from './ordersApi.js';
import { TEXTS } from './texts.js';

const sel = 'h-8 w-auto min-w-44 text-[13px]';
const inp = 'h-8 w-auto text-[13px]';
const NO_SEARCH = { column: '', op: '', value: '' };

/** coded list columns shown by name, from the order's own lists (Status 1 -> Active) */
const NAMED = { STATUS: 'status', MATERIAL: 'material', UOM: 'uom' };
const order = Object.keys(TEXTS.listColumns);
const placeOf = (name) => order.indexOf(name) + 1 || order.length + 1;

export default function OrderList({ onOpen, onNew }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState([]);
  const [names, setNames] = useState({});
  const [search, setSearch] = useState(NO_SEARCH);
  const [applied, setApplied] = useState(null);
  const [values, setValues] = useState([]);

  // the filterable columns, and the lists that name coded values (once)
  useEffect(() => {
    ordersApi.searchFields().then(setFields).catch(() => setFields([]));
    ordersApi
      .blank()
      .then(({ options }) => setNames(Object.fromEntries(Object.entries(NAMED).map(([col, f]) => [col, Object.fromEntries((options[f] ?? []).map((o) => [String(o.value), o.text]))]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    ordersApi
      .list({ page, search: applied })
      .then((d) => live && setData(d))
      .catch((e) => toast.error(e.message, { id: e.message, duration: 6000 }))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [page, applied]);

  const field = fields.find((f) => f.name === search.column);
  async function pickColumn(name) {
    const f = fields.find((x) => x.name === name);
    setSearch({ column: name, op: f?.operators[0]?.value ?? '', value: '' });
    setValues(name ? await ordersApi.columnValues(name).catch(() => []) : []);
  }
  const run = (e) => {
    e.preventDefault();
    if (!field || search.value === '') return;
    setPage(0);
    setApplied(search);
  };
  const clear = () => {
    setApplied(null);
    setSearch(NO_SEARCH);
    setPage(0);
  };

  const columns = useMemo(
    () =>
      (data?.columns ?? [])
        .map((name, i) => {
          const shown = (r) => names[name]?.[String(r[`c${i}`] ?? '')] ?? r[`c${i}`];
          return { key: `c${i}`, name, header: TEXTS.listColumns[name] ?? name, exactHeader: name in TEXTS.listColumns, text: shown, render: (r) => shown(r) ?? '—' };
        })
        .sort((x, y) => placeOf(x.name) - placeOf(y.name)),
    [data, names],
  );
  const rows = useMemo(() => (data?.rows ?? []).map((r, i) => ({ id: i, ...Object.fromEntries(r.map((v, j) => [`c${j}`, v])) })), [data]);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const leading = (
    <form onSubmit={run} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Search in</span>
        <NativeSelect className={sel} value={search.column} onChange={(e) => pickColumn(e.target.value)} aria-label="Column">
          <option value="">Choose a column…</option>
          {fields.map((f) => <option key={f.name}>{f.name}</option>)}
        </NativeSelect>
      </label>
      {field && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Condition</span>
            <NativeSelect className={sel} value={search.op} onChange={(e) => setSearch((s) => ({ ...s, op: e.target.value }))} aria-label="Condition">
              {field.operators.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
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
      <Button type="submit" size="sm" icon={Search} disabled={!field || search.value === ''}>Search</Button>
      {(applied || search.column) && <Button variant="ghost" size="sm" icon={RotateCcw} onClick={clear}>Clear</Button>}
    </form>
  );

  return (
    <Page icon={ClipboardList} title={TEXTS.title} subtitle={TEXTS.listSubtitle} actions={<Button size="sm" icon={Plus} onClick={onNew}>{TEXTS.addNew}</Button>}>
      <DataTable
        tableId="production-orders"
        columns={columns}
        rows={rows}
        loading={loading}
        leading={leading}
        empty={applied ? 'No records match this search.' : 'No records yet.'}
        onRowClick={(r) => data.keys[r.id] && onOpen(data.keys[r.id])}
        exportName="production-orders"
        pagination={data && { meta: { page: page + 1, pageSize: data.pageSize, total: data.total, totalPages }, onPage: (p) => setPage(p - 1) }}
      />
    </Page>
  );
}
