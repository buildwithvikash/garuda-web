// View/Reports/WRLReports pages with their own filters: date-time range, department -> station, stage, area, serial.
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import ReportGrid, { download } from '../../components/report/ReportGrid.jsx';

export default function WrlReport({ slug }) {
  const [spec, setSpec] = useState(null);
  const [f, setF] = useState({ from: '', to: '', department: '', station: '', stage: '', area: '', serial: '' });
  const [stations, setStations] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSpec(null);
    setResult(null);
    setError('');
    api(`/reports/wrl/${slug}/spec`)
      .then((s) => {
        setSpec(s);
        setF((x) => ({ ...x, from: s.defaults.from, to: s.defaults.to, area: s.areas?.[0]?.value ?? '' }));
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const has = (k) => spec?.filters.includes(k);

  async function pickDepartment(e) {
    const department = e.target.value;
    setF((x) => ({ ...x, department, station: '' }));
    setStations(await api(`/reports/wrl/${slug}/stations?department=${encodeURIComponent(department)}`).catch(() => []));
  }

  async function run() {
    setBusy(true);
    setError('');
    try {
      setResult(await api(`/reports/wrl/${slug}/run`, { method: 'POST', body: f }));
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  if (error && !spec) return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!spec) return <div className="p-4 text-sm text-slate-500">Loading report…</div>;

  const Select = ({ label, k, items, onChange }) => (
    <label className="min-w-52"><span className="label">{label}</span>
      <select className="field" value={f[k]} onChange={onChange ?? set(k)}>
        <option value="">Select A Value</option>
        {items.map((d) => <option key={d.value} value={d.value}>{d.text}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">{spec.title}</h1>
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        {has('range') && (
          <>
            <label className="min-w-48"><span className="label">From</span><input type="datetime-local" step="1" className="field" value={f.from} onChange={set('from')} /></label>
            <label className="min-w-48"><span className="label">To</span><input type="datetime-local" step="1" className="field" value={f.to} onChange={set('to')} /></label>
          </>
        )}
        {has('department') && <Select label="Department" k="department" items={spec.departments} onChange={pickDepartment} />}
        {has('station') && <Select label="Station" k="station" items={stations} />}
        {has('stage') && <Select label="Stage" k="stage" items={spec.stages} />}
        {has('area') && (
          <label className="min-w-52"><span className="label">Area</span>
            <select className="field" value={f.area} onChange={set('area')}>
              {spec.areas.map((d) => <option key={d.value} value={d.value}>{d.text}</option>)}
            </select>
          </label>
        )}
        {has('serial') && (
          <label className="min-w-64"><span className="label">Serial No.</span><input className="field" value={f.serial} onChange={set('serial')} autoFocus /></label>
        )}
        <button className="btn" disabled={busy}>{busy ? 'Loading…' : has('serial') ? 'Search' : 'Refresh'}</button>
        <button type="button" className="btn-ghost ring-1 ring-slate-200" onClick={() => download(`/api/reports/wrl/${slug}/xlsx`, f, `${spec.title}.xlsx`).catch((e) => setError(e.message))}>Export Excel</button>
      </form>

      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {result?.model != null && (
        <div className="rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200"><span className="label inline">Model </span><b>{result.model}</b></div>
      )}
      {result?.tables.map((t, i) => (
        <ReportGrid key={i} grid={t} caption={result.tables.length > 1 ? (i === 0 ? 'Details' : 'Summary') : undefined} />
      ))}
    </div>
  );
}
