import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Columns3,
  Download,
  Eye,
  Inbox,
  Info,
  MoreVertical,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.jsx";
import { Checkbox } from "@/components/ui/checkbox.jsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.jsx";
import { NativeSelect } from "@/components/ui/native-select.jsx";
import { Skeleton } from "@/components/ui/skeleton.jsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.jsx";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/utils/csv.js";
import { loadPref, savePref } from "@/utils/prefs.js";

/** Columns the viewer has hidden for a table, remembered on this device. */
function useHiddenColumns(tableId) {
  const [hidden, setHidden] = useState(
    () => new Set(tableId ? loadPref(`cols:${tableId}`, []) : []),
  );
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

function ColumnPicker({ columns, hidden, onToggle }) {
  const choosable = columns
    .slice(1)
    .filter((c) => c.header && c.hideable !== false);
  if (!choosable.length) return null;
  const shown =
    choosable.length -
    [...hidden].filter((k) => choosable.some((c) => c.key === k)).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Columns3 />
          Columns
          {hidden.size ? (
            <span className="text-xs text-muted-foreground">
              {shown}/{choosable.length}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56">
        {choosable.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.key}
            checked={!hidden.has(c.key)}
            onCheckedChange={() => onToggle(c.key)}
            onSelect={(e) => e.preventDefault()}
          >
            {c.header}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const alignClass = (a) =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

/**
 * The common list table: one card with the filter bar, the table and the page controls.
 *   columns: [{ key, header, hint? (ⓘ tooltip on the header), render?(row), text?(row) (for export), sortable?, className?, align?, hideable?, export? }]
 *   Filter bar: `leading` (search fields), `toolbar` (filter chips) and the column chooser (`tableId`).
 *   Rows: `onRowClick`, `onPreview(row)` (eye button), `rowMenu(row)` → [{ label, icon, onClick, danger }]
 *   (⋮ menu), `activeKey` (the row shown in a preview), `selectable` + `exportName` (tick rows and
 *   export them as CSV), `pagination` = { meta, onPage, onPageSize } (numbered pages in the card).
 * `tabs` = [{ key, label, count?, active, onClick }] shows a tab strip above the rows.
 */
export default function DataTable({
  columns,
  rows = [],
  loading,
  error,
  sort,
  onSort,
  rowKey = "id",
  empty = "No records found.",
  emptyAction,
  onRowClick,
  tableId,
  toolbar,
  leading,
  onPreview,
  rowMenu,
  activeKey,
  selectable = false,
  exportName = "export",
  pagination,
  tabs,
}) {
  const [hidden, toggle] = useHiddenColumns(tableId);
  const [selected, setSelected] = useState(() => new Set());
  const cols = columns.filter((c, i) => i === 0 || !hidden.has(c.key));
  const firstLoad = loading && rows.length === 0;
  const showToolbar = leading || toolbar || tableId;
  const hasActions = !!(onPreview || rowMenu);
  const pageKeys = rows.map((r) => r[rowKey]);
  const allOnPage =
    pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const chosen = rows.filter((r) => selected.has(r[rowKey]));
  const span = cols.length + (selectable ? 1 : 0) + (hasActions ? 1 : 0);
  const toggleRow = (k) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const togglePage = () =>
    setSelected((s) => {
      const n = new Set(s);
      pageKeys.forEach((k) => (allOnPage ? n.delete(k) : n.add(k)));
      return n;
    });
  const clickRow = (row) => (e) =>
    !e.target.closest("button, a, input, label") && onRowClick(row);

  return (
    <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      {showToolbar && (
        <div className="space-y-2 border-b p-3">
          <div className="flex flex-wrap items-end gap-2">
            {leading}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {tableId && (
                <ColumnPicker
                  columns={columns}
                  hidden={hidden}
                  onToggle={toggle}
                />
              )}
            </div>
          </div>
          {toolbar}
        </div>
      )}

      {tabs?.length > 0 && (
        <div role="tablist" className="flex overflow-x-auto border-b px-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={!!t.active}
              onClick={t.onClick}
              className={cn(
                "-mb-px cursor-pointer border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                t.active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count !== undefined && t.count !== null && (
                <span className="tabular ml-1">({t.count})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-primary/5 px-4 py-2 text-sm">
          <span className="font-semibold">{selected.size} selected</span>
          {chosen.length < selected.size && (
            <span className="text-xs text-muted-foreground">
              ({chosen.length} on this page)
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={() => downloadCsv(exportName, cols, chosen)}
            disabled={!chosen.length}
          >
            Export to Excel (CSV)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* The table (scrolls sideways on narrow screens) */}
      <div
        className={cn(
          "transition-opacity",
          loading && !firstLoad && "opacity-70",
        )}
      >
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    aria-label="Select all on this page"
                    checked={allOnPage}
                    onCheckedChange={togglePage}
                  />
                </TableHead>
              )}
              {cols.map((c) => {
                const active = sort?.sort === c.key;
                const SortIcon = active
                  ? sort.order === "desc"
                    ? ArrowDown
                    : ArrowUp
                  : ChevronsUpDown;
                return (
                  <TableHead
                    key={c.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sort.order === "desc"
                          ? "descending"
                          : "ascending"
                        : undefined
                    }
                    className={cn(
                      "text-xs font-semibold",
                      alignClass(c.align),
                      c.headerClassName,
                    )}
                  >
                    {c.sortable && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 hover:text-foreground",
                          active && "text-primary",
                        )}
                      >
                        {c.header}
                        <SortIcon
                          className={cn(
                            "size-3.5",
                            active ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                      </button>
                    ) : (
                      c.header
                    )}
                    {c.hint && (
                      <span
                        title={c.hint}
                        className="ml-1 inline-flex cursor-help align-middle text-muted-foreground"
                      >
                        <Info className="size-3.5" aria-label={c.hint} />
                      </span>
                    )}
                  </TableHead>
                );
              })}
              {hasActions && (
                <TableHead
                  scope="col"
                  className="w-28 text-center text-xs font-semibold"
                >
                  Action
                </TableHead>
              )}
              {!hasActions && onRowClick && (
                <TableHead aria-hidden="true" className="w-8" />
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {firstLoad &&
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={`sk${i}`} className="hover:bg-transparent">
                  {selectable && <TableCell />}
                  {cols.map((c, j) => (
                    <TableCell key={c.key}>
                      <Skeleton
                        className="h-3.5"
                        style={{ width: `${45 + ((i * 7 + j * 13) % 45)}%` }}
                      />
                    </TableCell>
                  ))}
                  {(hasActions || onRowClick) && <TableCell />}
                </TableRow>
              ))}
            {rows.map((row) => {
              const k = row[rowKey];
              const on = activeKey !== undefined && activeKey === k;
              const picked = selected.has(k);
              return (
                <TableRow
                  key={k}
                  data-state={on || picked ? "selected" : undefined}
                  onClick={onRowClick ? clickRow(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) =>
                          e.key === "Enter" &&
                          e.target === e.currentTarget &&
                          onRowClick(row)
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    "group",
                    onRowClick &&
                      "cursor-pointer focus-visible:bg-muted focus-visible:outline-none",
                  )}
                >
                  {selectable && (
                    <TableCell className="relative pl-4">
                      {on && (
                        <span
                          className="absolute inset-y-0 left-0 w-1 bg-primary"
                          aria-hidden="true"
                        />
                      )}
                      <Checkbox
                        aria-label="Select row"
                        checked={picked}
                        onCheckedChange={() => toggleRow(k)}
                      />
                    </TableCell>
                  )}
                  {cols.map((c, i) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        i === 0 && !selectable && "relative",
                        c.align === "right"
                          ? "tabular text-right"
                          : c.align === "center"
                            ? "text-center"
                            : "",
                        c.className,
                      )}
                    >
                      {i === 0 && !selectable && (on || onRowClick) && (
                        <span
                          className={cn(
                            "absolute inset-y-0 left-0 w-1 bg-primary transition-opacity",
                            on
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-60",
                          )}
                          aria-hidden="true"
                        />
                      )}
                      {c.render ? c.render(row) : (row[c.key] ?? "—")}
                    </TableCell>
                  ))}
                  {hasActions && (
                    <TableCell>
                      <div className="flex items-center justify-center gap-1.5">
                        {onPreview && (
                          <Button
                            variant={on ? "secondary" : "outline"}
                            size="icon-sm"
                            onClick={() => onPreview(row)}
                            title="Preview"
                            aria-label="Preview"
                            icon={Eye}
                          />
                        )}
                        {rowMenu && <RowMenu items={rowMenu(row)} />}
                      </div>
                    </TableCell>
                  )}
                  {!hasActions && onRowClick && (
                    <TableCell className="pr-3 text-right">
                      <ChevronRight className="inline size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 group-focus:opacity-100" />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!loading && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={span + (!hasActions && onRowClick ? 1 : 0)}
                  className="whitespace-normal"
                >
                  <EmptyRows error={error} empty={empty} action={emptyAction} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && <Pagination {...pagination} inCard />}
    </div>
  );
}

function RowMenu({ items }) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="More actions"
          title="More actions"
          icon={MoreVertical}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {list.map((it, i) =>
          it === "sep" ? (
            <DropdownMenuSeparator key={`sep${i}`} />
          ) : (
            <DropdownMenuItem
              key={it.label}
              variant={it.danger ? "destructive" : "default"}
              onSelect={it.onClick}
            >
              {it.icon && <it.icon />}
              {it.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyRows({ error, empty, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-muted">
        <Inbox className="size-6 text-muted-foreground" />
      </span>
      <p className="text-sm font-medium text-foreground/80">
        {error ? "Could not load the list" : empty}
      </p>
      {error && (
        <p className="text-xs text-muted-foreground">
          {error.data?.message ?? "Check the connection and try again."}
        </p>
      )}
      {!error && action}
    </div>
  );
}

/** Page numbers around the current one: 1 … 4 5 [6] 7 8 … 20. */
function pageList(page, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => set.add(p));
  if (page >= total - 2)
    [total - 3, total - 2, total - 1].forEach((p) => set.add(p));
  const pages = [...set]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i && p - pages[i - 1] > 1 ? ["…", p] : [p]));
}

/** "Showing 1–25 of 312", rows per page and numbered pages. */
export function Pagination({
  meta,
  onPage,
  onPageSize,
  pageSizes = [10, 20, 50, 100],
  inCard = false,
}) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground",
        inCard ? "border-t px-4 py-3" : "mt-3",
      )}
    >
      <div className="flex items-center gap-4">
        <span className="tabular">
          Showing{" "}
          <b className="text-foreground">
            {from}–{to}
          </b>{" "}
          of{" "}
          <b className="text-foreground">
            {meta.total.toLocaleString("en-IN")}
          </b>
        </span>
        {onPageSize && (
          <label className="flex items-center gap-2">
            Rows
            <NativeSelect
              value={meta.pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="h-8 w-auto"
            >
              {pageSizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
      </div>
      <nav className="flex items-center gap-1" aria-label="Pages">
        <Button
          variant="outline"
          size="icon-sm"
          icon={ChevronLeft}
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          aria-label="Previous page"
        />
        {pageList(meta.page, meta.totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="w-6 text-center">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === meta.page ? "default" : "outline"}
              size="sm"
              className="tabular min-w-8 px-2"
              onClick={() => onPage(p)}
              aria-current={p === meta.page ? "page" : undefined}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon-sm"
          icon={ChevronRight}
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
          aria-label="Next page"
        />
      </nav>
    </div>
  );
}
