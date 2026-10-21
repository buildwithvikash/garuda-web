// GridView (AutoGenerateColumns) replacement: all rows of the result, shown 200 per page for speed.
import { useEffect, useState } from 'react';

const PAGE = 200;

export default function ReportGrid({ grid, caption }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [grid]);
  if (!grid) return null;
  const pages = Math.max(1, Math.ceil(grid.rows.length / PAGE));
  const rows = grid.rows.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
        <span className="font-medium text-slate-700">{caption ?? 'Results'}</span>
        <span className="text-slate-500">{grid.rows.length.toLocaleString('en-IN')} rows</span>
      </div>
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {grid.columns.map((c, i) => (
                <th key={i} className="whitespace-nowrap px-3 py-2 font-semibold">{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={grid.columns.length || 1} className="px-3 py-6 text-center text-slate-400">No records found</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-brand-50/50">
                {r.map((v, j) => (
                  <td key={j} className="whitespace-pre-line px-3 py-1.5 tabular-nums text-slate-700">
                    {typeof v === 'boolean' ? <input type="checkbox" checked={v} disabled aria-label={v ? 'Yes' : 'No'} /> : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-2 text-sm">
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="text-slate-500">Page {page + 1} of {pages}</span>
          <button className="btn-ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

/** POST that downloads the returned file (Excel export). */
export async function download(url, body, fallbackName) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `Export failed (${res.status})`);
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
