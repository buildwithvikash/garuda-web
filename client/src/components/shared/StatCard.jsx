import { toneFor } from '@/lib/tones.js';
import { cn } from '@/lib/utils';

/**
 * One headline number: a coloured icon tile, a small label, the value, and a note. `tone` is a name from
 * @/lib/tones.js (blue, indigo, emerald, amber, rose, violet, cyan, slate).
 *
 *   <StatCard icon={Factory} tone="emerald" label="Produced" value={312} note="65% of plan" />
 */
export default function StatCard({ icon: Icon, label, value, note, tone, className }) {
  const t = toneFor(tone && !tone.startsWith('text-') ? tone : undefined);
  return (
    <div className={cn('relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm', className)}>
      <span aria-hidden="true" className={cn('pointer-events-none absolute -top-9 -right-9 size-28 rounded-full', t.soft)} />
      <div className="relative flex items-center gap-4">
        {Icon && (
          <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-lg', t.solid, t.glow)}>
            <Icon className="size-6" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">{label}</p>
          <p className="text-3xl leading-tight font-bold tabular-nums">{value}</p>
          {note && <p className="truncate text-xs text-muted-foreground">{note}</p>}
        </div>
      </div>
    </div>
  );
}
