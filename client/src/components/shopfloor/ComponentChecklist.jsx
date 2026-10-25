import { CheckCircle2, Circle } from "lucide-react";

/** The stage's components (GVINMaterial rows) as a checklist: fitted when the consumed quantity reaches the required. */
export default function ComponentChecklist({ rows = [] }) {
  const items = rows.map((r) => ({
    ...r,
    need: Number(r.Qty) || 0,
    got: Number(r.ConsumedQty) || 0,
  }));
  const fitted = items.filter((r) => r.got >= r.need).length;
  if (!items.length)
    return (
      <p className="text-sm text-muted-foreground">
        No components to scan at this stage.
      </p>
    );
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">
        <span className="tabular">
          {fitted} of {items.length}
        </span>{" "}
        fitted{fitted === items.length && " — all done"}
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((r, i) => {
          const ok = r.got >= r.need;
          const serials = String(r.Barcodes ?? "")
            .split("|")
            .map((x) => x.trim())
            .filter(Boolean);
          const alts = String(r.AltMaterial ?? "")
            .split("|")
            .map((x) => x.trim())
            .filter(Boolean);
          return (
            <li
              key={r.RowID ?? i}
              className={`flex items-start gap-3 px-3 py-2.5 ${ok ? "bg-emerald-500/5" : ""}`}
            >
              {ok ? (
                <CheckCircle2 className="mt-0.5 w-5 h-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
              ) : (
                <Circle className="mt-0.5 w-5 h-5 shrink-0 text-muted-foreground/50" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${ok ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}`}
                >
                  {r.Material}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[r.MatCode, r.Type].filter(Boolean).join(" · ")}
                  {alts.length > 0 && ` · or ${alts.join(", ")}`}
                </p>
                {serials.length > 0 && (
                  <p className="mt-0.5 text-xs tabular text-muted-foreground break-all">
                    {serials.join(", ")}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 text-sm font-bold tabular ${ok ? "text-emerald-700 dark:text-emerald-300" : "text-foreground/80"}`}
              >
                {r.got} / {r.need} {r.Unit}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
