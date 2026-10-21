// UserControl/ReportControl (+Time, +Adv): date range, department or custom filter, Refresh, column search, Excel.
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import ReportGrid, { download } from '../../components/report/ReportGrid.jsx';

export default function GenericReport({ path }) {
  const [spec, setSpec] = useState(null);
  const [f, setF] = useState({ from: '', to: '', department: '', filter: '' });
  const [search, setSearch] = useState({ column: '', op: '', value: '' });
  const [values, setValues] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSpec(null);
    setResult(null);
    setError('');
    api(`/reports/generic/spec?path=${encodeURIComponent(path)}`)
      .then((s) => {
        setSpec(s);
        setF({ from: s.defaults?.from ?? '', to: s.defaults?.to ?? '', department: s.defaultDepartment ?? '', filter: '' });
      })
      .catch((e) => setError(e.message));
  }, [path]);

  const body = (withSearch) => ({ path, ...f, ...(withSearch && search.column ? { search } : {}) });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const column = spec?.columns?.find((c) => c.name === search.column);

  async function run(withSearch = false) {
    setBusy(true);
    setError('');
    try {
      setResult(await api('/reports/generic/run', { method: 'POST', body: body(withSearch) }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // DDLColumns_SelectedIndexChanged: operators by type, distinct values for the value list.
  async function pickColumn(name) {
    const c = spec.columns.find((x) => x.name === name);
    setSearch({ column: name, op: c?.operators[0]?.[0] ?? '', value: '' });
    setValues([]);
    if (c) setValues(await api('/reports/generic/distinct', { method: 'POST', body: { ...body(false), column: name } }).catch(() => []));
  }

  if (error && !spec) return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!spec) return <div className="p-4 text-sm text-slate-500">Loading report…</div>;
  if (spec.broken) return <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><b>{spec.title}</b>: {spec.broken}</div>;

  const dateType = spec.variant === 'date' ? 'date' : 'datetime-local';
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">📚 {spec.title}</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        {spec.showDates && (
          <>
            <label className="min-w-44"><span className="label">From</span><input type={dateType} step="1" className="field" value={f.from} onChange={set('from')} /></label>
            <label className="min-w-44"><span className="label">To</span><input type={dateType} step="1" className="field" value={f.to} onChange={set('to')} /></label>
          </>
        )}
        {spec.departments && (
          <label className="min-w-52"><span className="label">Department</span>
            <select className="field" value={f.department} onChange={set('department')}>
              <option value="">Select A Value</option>
              {spec.departments.map((d) => <option key={d.value} value={d.value}>{d.text}</option>)}
            </select>
          </label>
        )}
        {spec.filterOptions && (
          <label className="min-w-52"><span className="label">Filter</span>
            <select className="field" value={f.filter} onChange={set('filter')}>
              <option value="">Select A Value</option>
              {spec.filterOptions.map((d) => <option key={d.value} value={d.value}>{d.text}</option>)}
            </select>
          </label>
        )}
        <button className="btn" onClick={() => run(false)} disabled={busy}>{busy ? 'Loading…' : 'Refresh'}</button>
        <button className="btn-ghost ring-1 ring-slate-200" onClick={() => download('/api/reports/generic/xlsx', body(true), `${spec.title}.xlsx`).catch((e) => setError(e.message))}>Export Excel</button>
      </div>

      {spec.columns?.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label className="min-w-48"><span className="label">Search column</span>
            <select className="field" value={search.column} onChange={(e) => pickColumn(e.target.value)}>
              <option value="" />
              {spec.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          {column && (
            <>
              <label className="min-w-36"><span className="label">Condition</span>
                <select className="field" value={search.op} onChange={(e) => setSearch((s) => ({ ...s, op: e.target.value, value: '' }))}>
                  {column.operators.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              <label className="min-w-52"><span className="label">Value</span>
                {search.op === 'like' ? (
                  <input className="field" value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))} />
                ) : (
                  <select className="field" value={search.value} onChange={(e) => setSearch((s) => ({ ...s, value: e.target.value }))}>
                    <option value="" />
                    {values.map((v, i) => <option key={i} value={v}>{v}</option>)}
                  </select>
                )}
              </label>
              <button className="btn" onClick={() => run(true)} disabled={busy || search.value === ''}>Search</button>
            </>
          )}
        </div>
      )}

      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {result?.total != null && <div className="text-sm font-semibold text-slate-700">Total {spec.totalField} : {result.total}</div>}
      {result && <ReportGrid grid={result} />}
    </div>
  );
}
