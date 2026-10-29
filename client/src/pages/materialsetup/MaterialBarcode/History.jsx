// Material Barcode: the reprint history (owner, 29 Oct 2026), read only: every reprint of an FG label or an assembly or
// foaming barcode in the business unit, newest first, with its reason and who reprinted it
// (GET /api/masters/material-barcodes/reprint/history). The page (../MaterialBarcode.jsx) switches to it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import DataTable from '@/components/shared/DataTable.jsx';
import DateRangeFilter from '@/components/shared/DateRangeFilter.jsx';

export default function History() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState({ start: '', end: '' }); // the date-time filter (empty: no limit)

  const load = useCallback(() => {
    setLoading(true);
    const q = Object.entries(range).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
    api(`/masters/material-barcodes/reprint/history?page=${page}${q}`)
      .then((d) => (setData(d), setError(null)))
      .catch((e) => (setError({ data: { message: e.message } }), toast.error(e.message, { id: e.message, duration: 6000 })))
      .finally(() => setLoading(false));
  }, [page, range]);
  useEffect(load, [load]);

  const columns = useMemo(() => (data?.columns ?? []).map((c, i) => ({ key: `c${i}`, header: c.name, text: (r) => r[`c${i}`] })), [data]);
  const rows = useMemo(() => (data?.rows ?? []).map((r, i) => ({ id: i, ...Object.fromEntries(r.map((v, j) => [`c${j}`, v])) })), [data]);
  const totalPages = data ? Math.max(1, Math.ceil(data.count / data.pageSize)) : 1;

  return (
    <DataTable
      tableId="/materialsetup/materialbarcode:history"
      title="Reprint history"
      toolbar={<DateRangeFilter value={range} onApply={(r) => (setPage(0), setRange(r))} />}
      columns={columns}
      rows={rows}
      loading={loading}
      error={error}
      empty={range.start || range.end ? 'No label was reprinted in this time range.' : 'No label has been reprinted yet.'}
      exportName="material-barcode-reprints"
      pagination={data && { meta: { page: page + 1, pageSize: data.pageSize, total: data.count, totalPages }, onPage: (p) => setPage(p - 1) }}
    />
  );
}
