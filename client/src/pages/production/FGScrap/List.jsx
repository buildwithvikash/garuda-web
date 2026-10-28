// FGScrap: the list view. The original screen had no list of its own; this one is the scrap history (owner,
// 28 Oct 2026): every unit / item scrapped on a job card of the business unit, newest first, read only
// (GET /api/production/fg-scrap/history). The page (../FGScrap.jsx) shows it; its header button goes back to the form
// (./Form.jsx).

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import DataTable from '@/components/shared/DataTable.jsx';
import DateRangeFilter from '@/components/shared/DateRangeFilter.jsx';

// ────────────────────────────────────────────────────────────────────────────
// 4. LIST VIEW
// The scraps done so far.
// ────────────────────────────────────────────────────────────────────────────
function RecordList({ path }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState({ start: '', end: '' }); // the date-time filter (empty: no limit)

  const load = useCallback(() => {
    setLoading(true);
    const q = Object.entries(range).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
    api(`/production/fg-scrap/history?page=${page}${q}`)
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
      tableId={`${path}:history`}
      title="Scrap history"
      toolbar={<DateRangeFilter value={range} onApply={(r) => (setPage(0), setRange(r))} />}
      columns={columns}
      rows={rows}
      loading={loading}
      error={error}
      empty={range.start || range.end ? 'Nothing was scrapped in this time range.' : 'Nothing has been scrapped yet.'}
      exportName="fg-scrap-history"
      pagination={data && { meta: { page: page + 1, pageSize: data.pageSize, total: data.count, totalPages }, onPage: (p) => setPage(p - 1) }}
    />
  );
}

export default RecordList;
