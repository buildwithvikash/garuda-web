import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Columns3,
  Download,
  Eye,
  FileText,
  Filter,
  Inbox,
  Info,
  MoreVertical,
  Pencil,
  Search,
  Table2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.jsx";
import { Checkbox } from "@/components/ui/checkbox.jsx";
import { Input } from "@/components/ui/input.jsx";
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
import { alignOf, formatCell } from "@/components/shared/cellFormat.jsx";
import { downloadCsv } from "@/utils/csv.js";
import { loadPref, savePref } from "@/utils/prefs.js";
import { prettyHeader } from "@/lib/headers.js";

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

// column headers as people read them: lib/headers.js (plain JS, shared with the page scripts); still exported here
export { prettyHeader };
/** a column's header as shown: as written when the page gave it (exactHeader: a page's texts), else made readable */
const headerOf = (c) => (c.exactHeader ? String(c.header ?? "") : prettyHeader(c.header));

/** sortable form of a cell's text: numbers as numbers, dd-mm-yyyy [time] as yyyy-mm-dd time, else the text */
function sortKey(t) {
  const s = String(t ?? "").trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const d = /^(\d{2})-(\d{2})-(\d{4})(.*)$/.exec(s);
  if (d) {
    const tm = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(d[4]);
    let hh = tm ? Number(tm[1]) % 12 : 0;
    if (tm?.[4]?.toUpperCase() === "PM") hh += 12;
    if (tm && !tm[4]) hh = Number(tm[1]);
    return `${d[3]}-${d[2]}-${d[1]} ${String(hh).padStart(2, "0")}:${tm?.[2] ?? "00"}:${tm?.[3] ?? "00"}`;
  }
  return s.toLowerCase();
}
const compare = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true }));

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
        <Button variant="outline" className="h-9">
          <Columns3 />
          Columns
          {hidden.size ? (
            <span className="text-xs text-muted-foreground">
              {shown}/{choosable.length}
            </span>
          ) : null}
          <ChevronDown className="text-muted-foreground" />
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
            {headerOf(c)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The filter card: a page's own filter fields (`toolbar`) - small uppercase captions, tall inputs, a dark search
 *  button - without each page restyling its fields. */
const FILTER_CARD = cn(
  "space-y-3 rounded-2xl border bg-card p-4 text-card-foreground shadow-sm",
  "[&_label>span:first-child]:text-[11px] [&_label>span:first-child]:font-semibold [&_label>span:first-child]:tracking-wider [&_label>span:first-child]:uppercase",
  "[&_select]:h-10 [&_select]:min-w-56 [&_input]:h-10 [&_input]:min-w-56 [&_button]:h-10",
  "[&_button[type=submit]]:bg-slate-900 [&_button[type=submit]]:px-5 [&_button[type=submit]]:text-white [&_button[type=submit]:hover]:bg-slate-800 dark:[&_button[type=submit]]:bg-slate-100 dark:[&_button[type=submit]]:text-slate-900",
);
/** The Filter strip under the title bar: the page's search over all records (`leading`: column, condition, value). */
const FILTER_STRIP = cn(
  "border-b bg-muted/30 px-4 py-3",
  "[&_select]:h-9 [&_select]:min-w-52 [&_input]:h-9 [&_input]:min-w-52 [&_button]:h-9",
);

const alignClass = (a) =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

/**
 * The common list table: one card whose title bar shows `title`, the record count, a search over the loaded rows,
 * Filter (the page's own search over all records, `leading`), Export (CSV) and the column chooser; above it an
 * optional filter card (`toolbar`).
 *   columns: [{ key, header, hint? (ⓘ tooltip on the header), render?(row), text?(row) (for export), sortable?, className?, align?, hideable?, export? }]
 *   Headers read as words ("ORDERDATE" -> "Order Date"); a click sorts the loaded rows (`onSort` instead: the server
 *   sorts, with `sort` = { sort, order }). A list's own row number (RECNO) shows as "#".
 *   Rows: `onRowClick` (the row, its name column and the edit button open it), `onPreview(row)` (eye button),
 *   `rowMenu(row)` → [{ label, icon, onClick, danger }] (⋮ menu), `activeKey` (the row shown in a preview),
 *   `selectable` + `exportName` (tick rows and export them as CSV), `pagination` = { meta, onPage, onPageSize }:
 *   with onPage the list scrolls on without end (each page is added under the last when its end comes into view),
 *   without it numbered pages in the card.
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
  title = "Records",
}) {
  const [hidden, toggle] = useHiddenColumns(tableId);
  const [selected, setSelected] = useState(() => new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  // Infinite scroll: a list that pages (pagination.onPage) shows its pages one under another. Each page keeps the row
  // click it came with (the page's own data, e.g. its keys), and page 1 starts the list again (first open, a search).
  const infinite = !!pagination?.onPage;
  const pageNo = pagination?.meta?.page ?? 1;
  const acc = useRef({ rows: null, pages: [] });
  if (infinite && acc.current.rows !== rows) {
    const kept = pageNo === 1 ? [] : acc.current.pages.filter((p) => p.page < pageNo);
    acc.current = { rows, pages: [...kept, { page: pageNo, rows, click: onRowClick }] };
  }
  const shown = infinite
    ? acc.current.pages.flatMap((p) => p.rows.map((row) => ({ row, key: `${p.page}:${row[rowKey]}`, click: p.click })))
    : rows.map((row) => ({ row, key: row[rowKey], click: onRowClick }));
  const hasMore = infinite && pageNo < (pagination.meta?.totalPages ?? 1);
  // a marker under the last row: when it scrolls into view, ask for the next page
  const end = useRef(null);
  useEffect(() => {
    if (!hasMore || loading || !end.current) return;
    const o = new IntersectionObserver(([e]) => e.isIntersecting && pagination.onPage(pageNo + 1), { rootMargin: "200px" });
    o.observe(end.current);
    return () => o.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, pageNo, shown.length]);
  const cols = columns.filter((c, i) => i === 0 || !hidden.has(c.key));
  // a list's own row number (RECNO) is shown as "#", muted; the column after it is the record's name
  const indexCol = /^rec\s*no$/i.test(String(cols[0]?.header ?? ""));
  const strong = indexCol ? 1 : 0;
  const named = cols.filter((c, i) => !(i === 0 && indexCol) && c.header);
  // the search box: the rows already here, by any shown column's text
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const cellText = (c, row) => String((c.text ? c.text(row) : row[c.key]) ?? "");
  const found = needle ? shown.filter((x) => cols.some((c) => cellText(c, x.row).toLowerCase().includes(needle))) : shown;
  // a header click sorts the loaded rows: ascending, descending, then back to the list's own order
  const [order, setOrder] = useState(null); // { key, dir }
  const sortCol = order && cols.find((c) => c.key === order.key);
  const visible = sortCol
    ? [...found].sort((a, b) => compare(sortKey(cellText(sortCol, a.row)), sortKey(cellText(sortCol, b.row))) * (order.dir === "desc" ? -1 : 1))
    : found;
  const sortBy = (key) =>
    setOrder((o) => (o?.key !== key ? { key, dir: "asc" } : o.dir === "asc" ? { key, dir: "desc" } : null));
  // a column's alignment (its own, else quantities right) and a cell's content (plain text formatted: cellFormat.jsx)
  const align = (c) => c.align ?? alignOf(c.header);
  const content = (c, row) => {
    const v = c.render ? c.render(row) : row[c.key];
    return v == null || typeof v === "string" || typeof v === "number" ? formatCell(c.header, v) : v;
  };
  const firstLoad = loading && shown.length === 0;
  const hasActions = !!(onPreview || rowMenu || onRowClick);
  const pageKeys = shown.map((x) => x.key);
  const allOnPage =
    pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const chosen = shown.filter((x) => selected.has(x.key)).map((x) => x.row);
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
  const clickRow = (row, click) => (e) =>
    !e.target.closest("button, a, input, label") && click(row);
  const placeholder = named.length ? `Search by ${named.slice(0, 3).map((c) => headerOf(c).toLowerCase()).join(", ")}…` : "Search…";
  const cellLine = "border-r border-border/60 last:border-r-0";

  return (
    <div className="space-y-4">
      {toolbar && <div className={FILTER_CARD}>{toolbar}</div>}
    <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <span className="grid size-8 place-items-center rounded-lg border bg-muted/40">
          <Table2 className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="text-base font-semibold">{title}</span>
        <span className="tabular rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {(pagination?.meta?.total ?? shown.length).toLocaleString("en-IN")}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Search the loaded rows" className="h-9 w-72 pl-9 text-[13px]" />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Clear the search">
                <X className="size-4" />
              </button>
            )}
          </label>
          {leading && (
            <Button variant="outline" className={cn("h-9", filterOpen && "border-primary text-primary")} onClick={() => setFilterOpen((o) => !o)} aria-expanded={filterOpen}>
              <Filter />
              Filter
              <ChevronDown className={cn("text-muted-foreground transition-transform", filterOpen && "rotate-180")} />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 bg-emerald-600 text-white hover:bg-emerald-700" disabled={!shown.length}>
                <Download />
                Export
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={() => downloadCsv(exportName, cols, visible.map((x) => x.row))}>
                Rows shown ({visible.length.toLocaleString("en-IN")}) as CSV
              </DropdownMenuItem>
              {visible.length !== shown.length && (
                <DropdownMenuItem onSelect={() => downloadCsv(exportName, cols, shown.map((x) => x.row))}>
                  All loaded rows ({shown.length.toLocaleString("en-IN")}) as CSV
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {tableId && <ColumnPicker columns={columns} hidden={hidden} onToggle={toggle} />}
        </div>
      </div>
      {leading && filterOpen && <div className={FILTER_STRIP}>{leading}</div>}

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
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className={cn("w-10 pl-4", cellLine)}>
                  <Checkbox
                    aria-label="Select all on this page"
                    checked={allOnPage}
                    onCheckedChange={togglePage}
                  />
                </TableHead>
              )}
              {cols.map((c, ci) => {
                const isIndex = ci === 0 && indexCol;
                const header = isIndex ? "#" : headerOf(c);
                const server = c.sortable && onSort;
                const active = server ? sort?.sort === c.key : order?.key === c.key;
                const dir = server ? sort?.order : order?.dir;
                const SortIcon = active ? (dir === "desc" ? ArrowDown : ArrowUp) : ChevronsUpDown;
                const isDate = /date|(ed\s*on)$/i.test(String(c.header ?? ""));
                return (
                  <TableHead
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : undefined}
                    className={cn(
                      "h-11 text-[13px] font-semibold text-foreground",
                      isIndex && "w-12",
                      alignClass(align(c)),
                      cellLine,
                      c.headerClassName,
                    )}
                  >
                    {isIndex || !header ? (
                      header
                    ) : (
                      <button
                        type="button"
                        onClick={() => (server ? onSort(c.key) : sortBy(c.key))}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1.5 hover:text-primary",
                          align(c) === "right" && "flex-row-reverse",
                          active && "text-primary",
                        )}
                      >
                        {isDate && <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />}
                        {header}
                        <SortIcon className={cn("size-3.5", active ? "text-primary" : "text-muted-foreground/70")} />
                      </button>
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
                <TableHead scope="col" className="w-24 text-center text-[13px] font-semibold text-foreground">
                  Actions
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {firstLoad &&
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={`sk${i}`} className="hover:bg-transparent">
                  {selectable && <TableCell />}
                  {cols.map((c, j) => (
                    <TableCell key={c.key} className={cellLine}>
                      <Skeleton
                        className="h-3.5"
                        style={{ width: `${45 + ((i * 7 + j * 13) % 45)}%` }}
                      />
                    </TableCell>
                  ))}
                  {hasActions && <TableCell />}
                </TableRow>
              ))}
            {visible.map(({ row, key: k, click }) => {
              const on = activeKey !== undefined && activeKey === row[rowKey];
              const picked = selected.has(k);
              return (
                <TableRow
                  key={k}
                  data-state={on || picked ? "selected" : undefined}
                  onClick={click ? clickRow(row, click) : undefined}
                  onKeyDown={
                    click
                      ? (e) =>
                          e.key === "Enter" &&
                          e.target === e.currentTarget &&
                          click(row)
                      : undefined
                  }
                  tabIndex={click ? 0 : undefined}
                  className={cn(
                    "group",
                    click &&
                      "cursor-pointer focus-visible:bg-muted focus-visible:outline-none",
                  )}
                >
                  {selectable && (
                    <TableCell className={cn("relative pl-4", cellLine)}>
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
                        cellLine,
                        i === 0 && !selectable && "relative",
                        i === 0 && indexCol && "tabular w-12 text-muted-foreground",
                        align(c) === "right"
                          ? "tabular text-right"
                          : align(c) === "center"
                            ? "text-center"
                            : "",
                        c.className,
                      )}
                    >
                      {i === 0 && !selectable && on && (
                        <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
                      )}
                      {i === 0 && indexCol ? (
                        row[c.key]
                      ) : i === strong && click ? (
                        <span className="inline-flex items-center gap-2 font-semibold text-primary group-hover:underline">
                          <FileText className="size-4 shrink-0 text-primary/70" aria-hidden="true" />
                          {content(c, row)}
                        </span>
                      ) : i === strong ? (
                        <span className="font-semibold text-foreground">{content(c, row)}</span>
                      ) : (
                        content(c, row)
                      )}
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
                        {click && !onPreview && !rowMenu && (
                          <Button variant="outline" size="icon-sm" onClick={() => click(row)} title="Open" aria-label="Open" icon={Pencil} className="text-primary" />
                        )}
                        {rowMenu && <RowMenu items={rowMenu(row)} />}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!loading && visible.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={span} className="whitespace-normal">
                  <EmptyRows error={error} empty={needle && shown.length ? "No loaded rows match this search." : empty} action={emptyAction} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {infinite && shown.length > 0 && (
        <div ref={end} className="border-t py-3 text-center text-xs text-muted-foreground">
          {loading
            ? "Loading more…"
            : hasMore
              ? `${shown.length.toLocaleString("en-IN")} of ${pagination.meta?.total?.toLocaleString("en-IN") ?? "?"} — scroll for more`
              : `All ${shown.length.toLocaleString("en-IN")} records shown`}
        </div>
      )}
      {pagination && !infinite && <Pagination {...pagination} inCard />}
    </div>
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
