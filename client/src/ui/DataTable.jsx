import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, Download, Eye, Inbox, Info, LayoutGrid, List, MoreVertical, X } from 'lucide-react';
import PopMenu from './PopMenu.jsx';
import { useState } from 'react';
import { loadPref, savePref } from '../utils/prefs.js';
import { downloadCsv, textOf } from '../utils/csv.js';

/** Columns the viewer has hidden for a table, remembered on this device. */
function useHiddenColumns(tableId) {
  const [hidden, setHidden] = useState(() => new Set(tableId ? loadPref(`cols:${tableId}`, []) : []));
  const toggle = (key) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (tableId) savePref(`cols:${tableId}`, [...next]);
      return next;
    });
  return [hidden, toggle];
}

/** List or card view for a table, remembered on this device; list unless the viewer chose cards. */
function useView(tableId) {
  const [view, setView] = useState(() => (tableId ? loadPref(`view:${tableId}`, 'list') : 'list'));
  const choose = (v) => {
    setView(v);
    if (tableId) savePref(`view:${tableId}`, v);
  };
  return [view, choose];
}

function ViewSwitch({ view, onChange }) {
  const btn = (v, Icon, label) => (
    <button type="button" aria-pressed={view === v} onClick={() => onChange(v)} title={`${label} view`}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium cursor-pointer ${view === v ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
      <Icon className="h-4 w-4" /><span className="hidden lg:inline">{label}</span>
    </button>
  );
  return (
    <div role="group" aria-label="View" className="hidden md:inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {btn('list', List, 'List')}{btn('cards', LayoutGrid, 'Cards')}
    </div>
  );
}

/** A small menu that opens below its button (in a portal, so the table does not clip it). */
const toolBtn = 'inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer';

function ColumnPicker({ columns, hidden, onToggle }) {
  const choosable = columns.slice(1).filter((c) => c.header && c.hideable !== false);
  if (!choosable.length) return null;
  const shown = choosable.length - [...hidden].filter((k) => choosable.some((c) => c.key === k)).length;
  return (
    <PopMenu button={({ open, toggle }) => (
      <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" className={toolBtn}>
        <Columns3 className="w-4 h-4" />Columns{hidden.size ? <span className="text-xs text-slate-400">{shown}/{choosable.length}</span> : null}
      </button>
    )}>
      {choosable.map((c) => (
        <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" className="accent-blue-600" checked={!hidden.has(c.key)} onChange={() => onToggle(c.key)} />
          {c.header}
        </label>
      ))}
    </PopMenu>
  );
}

/**
 * The common list table: one card with the filter bar, the table and the page controls.
 *   columns: [{ key, header, hint? (ⓘ tooltip on the header), render?(row), text?(row) (for export), sortable?, className?, align?, hideable?, export? }]
 *   Filter bar: `leading` (search fields), `toolbar` (filter chips) and the column chooser (`tableId`).
 *   Rows: `onRowClick`, `onPreview(row)` (eye button), `rowMenu(row)` → [{ label, icon, onClick, danger }]
 *   (⋮ menu), `activeKey` (the row shown in a preview), `selectable` + `exportName` (tick rows and
 *   export them as CSV), `pagination` = { meta, onPage, onPageSize } (numbered pages in the card).
 * `tabs` = [{ key, label, count?, active, onClick }] shows a tab strip above the rows.
 * Tables with a `tableId` can also be shown as cards (List / Cards switch, list by default,
 * remembered per table). On narrow screens each row is always a card.
 */
export default function DataTable({
  columns, rows = [], loading, error, sort, onSort, rowKey = 'id', empty = 'No records found.', emptyAction, onRowClick, tableId, toolbar, leading,
  onPreview, rowMenu, activeKey, selectable = false, exportName = 'export', pagination, tabs,
}) {
  const [hidden, toggle] = useHiddenColumns(tableId);
  const [view, setView] = useView(tableId);
  const cards = view === 'cards';
  const [selected, setSelected] = useState(() => new Set());
  const cols = columns.filter((c, i) => i === 0 || !hidden.has(c.key));
  const firstLoad = loading && rows.length === 0;
  const showToolbar = leading || toolbar || tableId;
  const hasActions = !!(onPreview || rowMenu);
  const pageKeys = rows.map((r) => r[rowKey]);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const chosen = rows.filter((r) => selected.has(r[rowKey]));
  const span = cols.length + (selectable ? 1 : 0) + (hasActions ? 1 : 0);
  const toggleRow = (k) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const togglePage = () => setSelected((s) => { const n = new Set(s); pageKeys.forEach((k) => (allOnPage ? n.delete(k) : n.add(k))); return n; });

  return (
    <div className="card overflow-hidden">
      {showToolbar && (
        <div className="px-3 py-3 border-b border-slate-100 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            {leading}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              
              {tableId && <ColumnPicker columns={columns} hidden={hidden} onToggle={toggle} />}
              {tableId && <ViewSwitch view={view} onChange={setView} />}
            </div>
          </div>
          {toolbar}
        </div>
      )}

      {tabs?.length > 0 && (
        <div role="tablist" className="flex overflow-x-auto border-b border-slate-200 px-2">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={!!t.active} onClick={t.onClick}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium cursor-pointer transition-colors ${t.active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
              {t.label}{t.count !== undefined && t.count !== null && <span className="ml-1 tabular">({t.count})</span>}
            </button>
          ))}
        </div>
      )}

      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-100 text-sm">
          <span className="font-semibold text-blue-900">{selected.size} selected</span>
          {chosen.length < selected.size && <span className="text-xs text-blue-700">({chosen.length} on this page)</span>}
          <button type="button" onClick={() => downloadCsv(exportName, cols, chosen)} disabled={!chosen.length}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-blue-200 text-blue-800 font-medium hover:bg-blue-100 cursor-pointer disabled:opacity-50">
            <Download className="w-4 h-4" />Export to Excel (CSV)
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto inline-flex items-center gap-1 text-xs text-blue-800 hover:underline cursor-pointer"><X className="w-3.5 h-3.5" />Clear</button>
        </div>
      )}

      {/* Table: tablets in landscape and desktops */}
      <div className={`relative overflow-x-auto ${loading && !firstLoad ? 'opacity-70' : ''} transition-opacity hidden ${cards ? '' : 'md:block'}`}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              {selectable && (
                <th className="w-10 pl-4 border-b border-slate-200">
                  <input type="checkbox" aria-label="Select all on this page" className="w-4 h-4 accent-blue-600 cursor-pointer align-middle" checked={allOnPage} onChange={togglePage} />
                </th>
              )}
              {cols.map((c) => {
                const active = sort?.sort === c.key;
                const Icon = active ? (sort.order === 'desc' ? ArrowDown : ArrowUp) : ChevronsUpDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.order === 'desc' ? 'descending' : 'ascending') : undefined}
                    className={`px-3 py-3 text-xs font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'} ${c.headerClassName ?? ''}`}
                  >
                    {c.sortable && onSort ? (
                      <button type="button" onClick={() => onSort(c.key)} className={`inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer ${active ? 'text-blue-700' : ''}`}>
                        {c.header}
                        <Icon className={`w-3.5 h-3.5 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                      </button>
                    ) : (
                      c.header
                    )}
                    {c.hint && <span title={c.hint} className="ml-1 inline-flex align-middle text-slate-400 cursor-help"><Info className="h-3.5 w-3.5" aria-label={c.hint} /></span>}
                  </th>
                );
              })}
              {hasActions && <th scope="col" className="px-3 py-3 text-xs font-semibold text-slate-700 border-b border-slate-200 text-center w-28">Action</th>}
              {!hasActions && onRowClick && <th aria-hidden="true" className="w-8 border-b border-slate-200" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {firstLoad && Array.from({ length: 6 }, (_, i) => (
              <tr key={`sk${i}`}>
                {selectable && <td />}
                {cols.map((c, j) => <td key={c.key} className="px-3 py-4"><div className="skeleton h-3.5" style={{ width: `${45 + ((i * 7 + j * 13) % 45)}%` }} /></td>)}
                {(hasActions || onRowClick) && <td />}
              </tr>
            ))}
            {rows.map((row) => {
              const k = row[rowKey];
              const on = activeKey !== undefined && activeKey === k;
              const picked = selected.has(k);
              return (
                <tr
                  key={k}
                  onClick={onRowClick ? (e) => !e.target.closest('button, a, input, label') && onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => e.key === 'Enter' && e.target === e.currentTarget && onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={`group transition-colors ${on ? 'bg-blue-50/80' : picked ? 'bg-blue-50/40' : ''} ${onRowClick ? 'cursor-pointer hover:bg-slate-50 focus:bg-blue-50 focus:outline-none' : 'hover:bg-slate-50/60'}`}
                >
                  {selectable && (
                    <td className="pl-4 relative">
                      {on && <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" aria-hidden="true" />}
                      <input type="checkbox" aria-label="Select row" className="w-4 h-4 accent-blue-600 cursor-pointer align-middle" checked={picked} onChange={() => toggleRow(k)} />
                    </td>
                  )}
                  {cols.map((c, i) => (
                    <td key={c.key} className={`px-3 py-3 text-slate-800 align-middle ${i === 0 && !selectable ? 'relative' : ''} ${c.align === 'right' ? 'text-right tabular' : c.align === 'center' ? 'text-center' : ''} ${c.className ?? ''}`}>
                      {i === 0 && !selectable && (on || onRowClick) && <span className={`absolute left-0 top-0 bottom-0 w-1 bg-blue-600 transition-opacity ${on ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`} aria-hidden="true" />}
                      {c.render ? c.render(row) : (row[c.key] ?? '—')}
                    </td>
                  ))}
                  {hasActions && (
                    <td className="px-3 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        {onPreview && (
                          <button type="button" onClick={() => onPreview(row)} title="Preview" aria-label="Preview"
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${on ? 'border-blue-300 bg-blue-100 text-blue-700' : 'border-slate-200 text-slate-500 hover:text-blue-700 hover:border-blue-300'}`}>
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        {rowMenu && <RowMenu items={rowMenu(row)} />}
                      </div>
                    </td>
                  )}
                  {!hasActions && onRowClick && (
                    <td className="pr-3 text-right">
                      <ChevronRight className="w-4 h-4 text-slate-300 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus:opacity-100 transition-all" />
                    </td>
                  )}
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={span + (!hasActions && onRowClick ? 1 : 0)}>
                  <EmptyState error={error} empty={empty} action={emptyAction} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Cards: always on phones and portrait tablets; on wider screens when the card view is chosen. */}
      <div className={cards
        ? `grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${loading && !firstLoad ? 'opacity-70' : ''} transition-opacity`
        : 'md:hidden divide-y divide-slate-100'}>
        {firstLoad && Array.from({ length: cards ? 8 : 4 }, (_, i) => (
          <div key={i} className={`p-4 space-y-2 ${cards ? 'rounded-xl border border-slate-200' : ''}`}><div className="skeleton h-4 w-1/2" /><div className="skeleton h-3 w-3/4" /><div className="skeleton h-3 w-2/3" /></div>
        ))}
        {rows.map((row) => {
          const [head, ...rest] = cols;
          const k = row[rowKey];
          const on = activeKey !== undefined && activeKey === k;
          const picked = selected.has(k);
          return (
            <div key={k} onClick={onRowClick ? (e) => !e.target.closest('button, a, input, label') && onRowClick(row) : undefined}
              className={`p-4 ${onRowClick ? 'cursor-pointer active:bg-slate-50' : ''} ${cards ? `rounded-xl border bg-white transition-colors ${on ? 'border-blue-400 ring-2 ring-blue-100' : picked ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 hover:border-blue-300 hover:shadow-sm'}` : ''}`}>
              <div className="flex items-start gap-2">
                {selectable && cards && (
                  <input type="checkbox" aria-label="Select" className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer" checked={picked} onChange={() => toggleRow(k)} />
                )}
                <div className="flex-1 min-w-0">{head.render ? head.render(row) : row[head.key]}</div>
                {onPreview && <button type="button" onClick={() => onPreview(row)} aria-label="Preview" className={`p-1.5 rounded-lg border cursor-pointer ${on ? 'border-blue-300 bg-blue-100 text-blue-700' : 'border-slate-200 text-slate-500 hover:text-blue-700'}`}><Eye className="w-4 h-4" /></button>}
                {rowMenu && <RowMenu items={rowMenu(row)} />}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                {/* Fields with nothing in them are left out, so a card shows what the row has. */}
                {rest.filter((c) => !c.header || !c.text || textOf(c, row) !== '').map((c) => (
                  <div key={c.key} className={`min-w-0 ${c.header ? '' : 'col-span-2'}`}>
                    {c.header && <dt className="eyebrow">{c.header}</dt>}
                    <dd className="text-sm text-slate-700 min-w-0 break-words [&_*]:whitespace-normal">{c.render ? c.render(row) : (row[c.key] ?? '—')}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
        {!loading && rows.length === 0 && <div className={cards ? 'col-span-full' : ''}><EmptyState error={error} empty={empty} action={emptyAction} /></div>}
      </div>

      {pagination && <Pagination {...pagination} inCard />}
    </div>
  );
}

function RowMenu({ items }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <PopMenu width="w-52" button={({ open, toggle }) => (
      <button type="button" onClick={toggle} aria-expanded={open} aria-label="More actions" title="More actions"
        className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 flex items-center justify-center cursor-pointer">
        <MoreVertical className="w-4 h-4" />
      </button>
    )}>
      {list.map((it, i) => (it === 'sep' ? <div key={`sep${i}`} className="my-1 border-t border-slate-100" /> : (
        <button key={it.label} type="button" role="menuitem" data-close onClick={it.onClick}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left cursor-pointer ${it.danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'}`}>
          {it.icon && <it.icon className="w-4 h-4 text-slate-400" />}{it.label}
        </button>
      )))}
    </PopMenu>
  );
}

function EmptyState({ error, empty, action }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 px-4 text-center">
      <span className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center"><Inbox className="w-6 h-6 text-slate-400" /></span>
      <p className="text-sm font-medium text-slate-600">{error ? 'Could not load the list' : empty}</p>
      {error && <p className="text-xs text-slate-400">{error.data?.message ?? 'Check the connection and try again.'}</p>}
      {!error && action}
    </div>
  );
}

/** Page numbers around the current one: 1 … 4 5 [6] 7 8 … 20. */
function pageList(page, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => set.add(p));
  if (page >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => set.add(p));
  const pages = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i && p - pages[i - 1] > 1 ? ['…', p] : [p]));
}

/** "Showing 1–25 of 312", rows per page and numbered pages. */
export function Pagination({ meta, onPage, onPageSize, pageSizes = [10, 25, 50, 100], inCard = false }) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  const nav = 'w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 ${inCard ? 'px-4 py-3 border-t border-slate-100' : 'mt-3'}`}>
      <div className="flex items-center gap-4">
        <span className="tabular">Showing <b className="text-slate-900">{from}–{to}</b> of <b className="text-slate-900">{meta.total.toLocaleString('en-IN')}</b></span>
        {onPageSize && (
          <label className="flex items-center gap-2">
            Rows
            <select value={meta.pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-9 pl-3 pr-8 border border-slate-200 rounded-lg bg-white cursor-pointer">
              {pageSizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>
      <nav className="flex items-center gap-1.5" aria-label="Pages">
        <button type="button" className={nav} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
        {pageList(meta.page, meta.totalPages).map((p, i) => (p === '…'
          ? <span key={`e${i}`} className="w-6 text-center text-slate-400">…</span>
          : (
            <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === meta.page ? 'page' : undefined}
              className={`min-w-9 h-9 px-2 rounded-lg text-sm font-medium tabular cursor-pointer ${p === meta.page ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{p}</button>
          )))}
        <button type="button" className={nav} disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
      </nav>
    </div>
  );
}
