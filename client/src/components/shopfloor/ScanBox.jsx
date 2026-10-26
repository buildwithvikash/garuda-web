import { CheckCircle2, ScanLine } from "lucide-react";
import { forwardRef } from "react";
import { Button } from "@/components/ui/button.jsx";
import { cn } from "@/lib/utils";

/** One scanner input: Enter (what a barcode scanner sends) runs the scan. No <form> of its own, so it also works
 *  inside a record form (nested forms are dropped by the browser; Enter would submit the record).
 *  size "md" suits a scan bar; "lg" is a bigger touch-screen version. Once scanned (`locked`) it shows a tick and a Change button. */
const ScanBox = forwardRef(function ScanBox(
  {
    label,
    value,
    onChange,
    onScan,
    locked,
    onClear,
    busy,
    placeholder,
    disabled,
    size = "lg",
  },
  ref,
) {
  const lg = size === "lg";
  const Icon = locked ? CheckCircle2 : ScanLine;
  const go = () => {
    if (locked) onClear?.();
    else if (String(value ?? "").trim() !== "") onScan();
  };
  return (
    <div className={cn('flex gap-2', !lg && 'max-w-xl')}>
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <Icon
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2",
            locked
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground",
            lg ? "left-4 size-6" : "left-3 size-5",
          )}
        />
        <input
          ref={ref}
          className={cn(
            "w-full rounded-lg border tabular tracking-wide outline-none transition-[color,box-shadow] placeholder:font-normal placeholder:text-muted-foreground",
            lg
              ? "h-16 border-2 pl-13 pr-4 text-2xl font-semibold"
              : "h-11 pl-10 pr-3 text-base font-medium",
            locked
              ? "border-emerald-500/40 bg-emerald-500/5 text-foreground"
              : "border-input bg-background focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
          value={value ?? ""}
          placeholder={placeholder}
          readOnly={locked}
          disabled={disabled}
          autoComplete="off"
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            go();
          }}
        />
      </label>
      <Button
        onClick={go}
        variant={locked ? "outline" : "default"}
        className={lg ? "h-16 px-6 text-base" : "h-11 min-w-20"}
        loading={busy}
        disabled={disabled}
      >
        {locked ? "Change" : lg ? "Scan" : "Go"}
      </Button>
    </div>
  );
});

export default ScanBox;
