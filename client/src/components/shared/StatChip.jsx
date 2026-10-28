import { toneFor } from '@/lib/tones.js';
import { cn } from '@/lib/utils';

/** A small coloured number with a label, for the right side of a page header: `<StatChip tone="blue" value={147} label="Total reports" />` */
export default function StatChip({ value, label, tone, className }) {
  const t = toneFor(tone);
  return (
    <div className={cn('rounded-lg border px-3.5 py-1.5 text-center', t.chip, className)}>
      <p className="text-lg leading-tight font-bold tabular-nums">{value}</p>
      <p className="text-[10px] font-semibold tracking-wider uppercase opacity-80">{label}</p>
    </div>
  );
}
