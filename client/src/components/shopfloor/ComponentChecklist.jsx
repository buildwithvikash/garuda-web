import { CheckCircle2, Circle, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";

/** The stage's components (GVINMaterial rows): each with what is needed, what is fitted (consumed) and its serials */
export function componentsOf(rows = []) {
  const split = (v) =>
    String(v ?? "")
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean);
  return rows.map((r) => {
    const need = Number(r.Qty) || 0;
    const got = Number(r.ConsumedQty) || 0;
    return { ...r, need, got, ok: got >= need, serials: split(r.Barcodes), alts: split(r.AltMaterial) };
  });
}

/** fitted / all, for the counter beside the scan box */
export const fittedCount = (rows) => {
  const items = componentsOf(rows);
  return { fitted: items.filter((r) => r.ok).length, total: items.length };
};

/** The stage's components as compact rows (two columns on wide screens: 8 or 9 components stay short): each with its
 *  status, type, name (the alternatives accepted on a second line), quantity and, once fitted, its serial. The next
 *  one to scan is marked. */
export default function ComponentChecklist({ rows = [] }) {
  const items = componentsOf(rows);
  if (!items.length) return <p className="text-sm text-muted-foreground">No components to scan at this stage.</p>;
  const next = items.findIndex((r) => !r.ok); // the first one still to fit
  return (
    <ul className="grid gap-2 xl:grid-cols-2">
      {items.map((r, i) => {
        const isNext = i === next;
        return (
          <li
            key={r.RowID ?? i}
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-lg border border-l-4 px-3 py-2",
              r.ok && "border-emerald-200 border-l-emerald-500 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
              isNext && "border-primary/40 border-l-primary bg-primary/5",
              !r.ok && !isNext && "border-l-border bg-card",
            )}
          >
            {r.ok ? (
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Fitted" />
            ) : isNext ? (
              <ScanLine className="size-5 shrink-0 text-primary" aria-label="Scan next" />
            ) : (
              <Circle className="size-5 shrink-0 text-muted-foreground/40" aria-label="Waiting" />
            )}
            <span className="hidden w-24 shrink-0 truncate rounded bg-muted px-1.5 py-0.5 text-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:inline-block" title={r.Type}>
              {r.Type || "Part"}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm font-semibold", r.ok && "text-emerald-800 dark:text-emerald-200")} title={r.Material}>
                {r.Material}
              </p>
              {r.ok && r.serials.length > 0 ? (
                <p className="truncate font-mono text-xs text-emerald-800 dark:text-emerald-200" title={r.serials.join(", ")}>
                  {r.serials.join(", ")}
                </p>
              ) : r.alts.length > 0 ? (
                <p className="truncate text-xs text-muted-foreground" title={r.alts.join(", ")}>
                  or {r.alts.join(", ")}
                </p>
              ) : null}
            </div>
            {isNext && <span className="hidden shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground md:inline">Scan next</span>}
            <span className={cn("shrink-0 text-sm font-bold tabular", r.ok ? "text-emerald-700 dark:text-emerald-300" : "text-foreground/80")}>
              {r.got}/{r.need} {r.Unit}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
