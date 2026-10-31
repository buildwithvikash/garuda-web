// Production Order: the serials generated for a saved order (its job cards' stage labels, printed by Production
// Assignment), shown below the order.
import { useEffect, useState } from 'react';
import DataTable from '@/components/shared/DataTable.jsx';
import { ordersApi } from './ordersApi.js';


const COLUMNS = [
  { key: 'serial', header: 'Serial', text: (r) => r.serial, render: (r) => <span className="font-mono">{r.serial}</span> },
  { key: 'jobCard', header: 'Job card', text: (r) => r.jobCard, render: (r) => r.jobCard || '—' },
  { key: 'process', header: 'Process', text: (r) => r.process, render: (r) => r.process || '—' },
  { key: 'station', header: 'Station', text: (r) => r.station, render: (r) => r.station || '—' },
  { key: 'material', header: 'Material', text: (r) => r.material, render: (r) => r.material || '—' },
  { key: 'assignedOn', header: 'Assigned on', text: (r) => r.assignedOn, render: (r) => r.assignedOn || '—' }, // the server's text (dd-MM-yyyy hh:mm:ss AM)
];

export default function OrderSerials({ prodNo }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    ordersApi
      .serials(prodNo)
      .then((r) => live && setRows(r.map((x, i) => ({ id: i, ...x }))))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [prodNo]);

  return (
    <DataTable
      tableId="production-order-serials"
      columns={COLUMNS}
      rows={rows ?? []}
      loading={rows === null && !error}
      error={error}
      empty="No serials generated for this order yet."
      exportName={`production-order-${prodNo}-serials`}
    />
  );
}
