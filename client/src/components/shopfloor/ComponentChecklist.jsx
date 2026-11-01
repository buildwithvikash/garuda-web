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

/** The stage's components as cards: fitted ones green with their serial, the next one to scan marked, the rest waiting.
 *  Each shows its type, its name, the alternatives accepted for it and the quantity. */
export default function ComponentChecklist({ rows = [] }) {
  const items = componentsOf(rows);
  if (!items.length) return <p className="text-sm text-muted-foreground">No components to scan at this stage.</p>;
  const next = items.findIndex((r) => !r.ok); // the first one still to fit
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((r, i) => {
        const isNext = i === next;
        return (
          <li
            key={r.RowID ?? i}
            className={cn(
              "flex min-w-0 flex-col gap-2 rounded-xl border p-3.5 transition-colors",
              r.ok && "border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/20",
              isNext && "border-primary bg-primary/5 ring-2 ring-primary/20",
              !r.ok && !isNext && "bg-card",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {r.Type || "Component"}
              </span>
              <span className={cn("shrink-0 text-sm font-bold tabular", r.ok ? "text-emerald-700 dark:text-emerald-300" : "text-foreground/80")}>
                {r.got} / {r.need} {r.Unit}
              </span>
            </div>
            <div className="flex items-start gap-2">
              {r.ok ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Fitted" />
              ) : isNext ? (
                <ScanLine className="mt-0.5 size-5 shrink-0 text-primary" aria-label="Scan next" />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/40" aria-label="Waiting" />
              )}
              <p className={cn("min-w-0 text-[15px] leading-snug font-semibold break-words", r.ok && "text-emerald-800 dark:text-emerald-200")}>{r.Material}</p>
            </div>
            {r.alts.length > 0 && (
              <p className="line-clamp-2 text-xs text-muted-foreground" title={r.alts.join(", ")}>
                Also accepted: {r.alts.join(", ")}
              </p>
            )}
            <div className="mt-auto pt-1">
              {r.serials.length > 0 ? (
                <p className="font-mono text-xs break-all text-emerald-800 dark:text-emerald-200">{r.serials.join(", ")}</p>
              ) : isNext ? (
                <span className="inline-flex rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">Scan next</span>
              ) : (
                <span className="text-xs text-muted-foreground">Waiting</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
