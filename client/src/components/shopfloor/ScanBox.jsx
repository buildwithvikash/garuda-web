import { ScanLine } from 'lucide-react';
import { forwardRef } from 'react';
import { Button } from '@/components/ui/button.jsx';

/** One big scanner input: Enter (what a barcode scanner sends) runs the scan. No <form> of its own, so it also works
 *  inside a record form (nested forms are dropped by the browser; Enter would submit the record). */
const ScanBox = forwardRef(function ScanBox({ label, value, onChange, onScan, locked, onClear, busy, placeholder, disabled, size = 'lg' }, ref) {
  const lg = size === 'lg';
  const go = () => {
    if (locked) onClear?.();
    else if (String(value ?? '').trim() !== '') onScan();
  };
  return (
    <div className="flex gap-2">
      <label className="relative flex-1 min-w-0">
        <span className="sr-only">{label}</span>
        <ScanLine className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground/70 ${lg ? 'left-4 w-6 h-6' : 'left-3 w-5 h-5'}`} />
        <input
          ref={ref}
          className={`w-full ${lg ? 'h-16 pl-13 pr-4 text-2xl border-2' : 'h-12 pl-11 pr-3 text-base border'} font-semibold tracking-wide tabular rounded-xl outline-none transition-colors ${locked ? 'border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-input bg-card text-foreground focus:border-ring focus:ring-4 focus:ring-ring/15'}`}
          value={value ?? ''}
          placeholder={placeholder}
          readOnly={locked}
          disabled={disabled}
          autoComplete="off"
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            go();
          }}
        />
      </label>
      <Button size="lg" onClick={go} variant={locked ? 'outline' : 'default'} className={lg ? 'h-16! px-6! text-base!' : 'h-12! min-w-24'} loading={busy} disabled={disabled}>
        {locked ? 'Change' : lg ? 'Scan' : 'Go'}
      </Button>
    </div>
  );
});

export default ScanBox;
