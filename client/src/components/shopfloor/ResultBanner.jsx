import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";

const TONES = {
  ok: {
    box: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
    icon: CheckCircle2,
    iconCls: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    box: "border-destructive/30 bg-destructive/10 text-red-900 dark:text-red-100",
    icon: AlertTriangle,
    iconCls: "text-destructive",
  },
  info: {
    box: "border-primary/25 bg-primary/5 text-foreground",
    icon: Info,
    iconCls: "text-primary",
  },
  busy: {
    box: "border bg-muted/50 text-muted-foreground",
    icon: Loader2,
    iconCls: "text-muted-foreground",
  },
};

/** The last scan's outcome: a slim tinted message that is still easy to read from the line. */
export default function ResultBanner({ tone, title, text }) {
  const t = TONES[tone] ?? TONES.info;
  const Icon = t.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 animate-in fade-in-0 ${t.box}`}
    >
      <Icon
        className={`size-6 shrink-0 ${t.iconCls} ${tone === "busy" ? "animate-spin" : ""}`}
      />
      <div className="min-w-0">
        <p className="text-base leading-tight font-semibold">{title}</p>
        {text && (
          <p className="mt-0.5 text-sm break-words opacity-80">{text}</p>
        )}
      </div>
    </div>
  );
}
