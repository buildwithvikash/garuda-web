// Production Order: the serials generated for a saved order (its job cards' stage labels, printed by Production
// Assignment), shown below the order.
import { useEffect, useState } from 'react';
import DataTable from '@/components/shared/DataTable.jsx';
import { ordersApi } from './ordersApi.js';


const COLUMNS = [
  { key: 'serial', header: 'Serial number', exactHeader: true, text: (r) => r.serial, render: (r) => <span className="font-mono">{r.serial}</span> },
  { key: 'jobCard', header: 'Job card', exactHeader: true, text: (r) => r.jobCard, render: (r) => r.jobCard || '—' },
  { key: 'process', header: 'Process', exactHeader: true, text: (r) => r.process, render: (r) => r.process || '—' },
  { key: 'station', header: 'Station', exactHeader: true, text: (r) => r.station, render: (r) => r.station || '—' },
  { key: 'material', header: 'Material', exactHeader: true, text: (r) => r.material, render: (r) => r.material || '—' },
  { key: 'printedOn', header: 'Printed on', exactHeader: true, text: (r) => r.printedOn, render: (r) => r.printedOn || '—' }, // the server's text (dd-MM-yyyy hh:mm:ss AM)
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
      empty="No job cards printed for this order yet."
      exportName={`production-order-${prodNo}-serials`}
    />
  );
}
