// The form design every screen shares (first made for Production Order): numbered steps with a coloured title bar, and
// the fields the screen keeps read-only shown locked.
import { useId } from 'react';
import { Lock } from 'lucide-react';
import { Field } from '@/components/shared/FormField.jsx';
import { Input } from '@/components/ui/input.jsx';
import { cn } from '@/lib/utils';

/** a step's colours: its number, its title bar, its title */
const TONES = {
  blue: { n: 'bg-blue-600', bar: 'bg-blue-50/70 dark:bg-blue-950/20', title: 'text-blue-700 dark:text-blue-300' },
  emerald: { n: 'bg-emerald-600', bar: 'bg-emerald-50/70 dark:bg-emerald-950/20', title: 'text-emerald-700 dark:text-emerald-300' },
  violet: { n: 'bg-violet-600', bar: 'bg-violet-50/70 dark:bg-violet-950/20', title: 'text-violet-700 dark:text-violet-300' },
  amber: { n: 'bg-amber-600', bar: 'bg-amber-50/70 dark:bg-amber-950/20', title: 'text-amber-700 dark:text-amber-300' },
  orange: { n: 'bg-orange-500', bar: 'bg-orange-50/70 dark:bg-orange-950/20', title: 'text-orange-700 dark:text-orange-300' },
  rose: { n: 'bg-rose-600', bar: 'bg-rose-50/70 dark:bg-rose-950/20', title: 'text-rose-700 dark:text-rose-300' },
  slate: { n: 'bg-slate-600', bar: 'bg-muted/50', title: 'text-foreground' },
};
/** the colours steps take in turn when a layout does not name one */
export const TONE_CYCLE = ['blue', 'emerald', 'violet', 'amber'];

/** a step's width on wide screens, in tenths of the form (`width: 3` = 30 %; none = the whole row). Written out so
 *  Tailwind sees each class. */
export const STEP_SPAN = {
  1: 'lg:col-span-1', 2: 'lg:col-span-2', 3: 'lg:col-span-3', 4: 'lg:col-span-4', 5: 'lg:col-span-5',
  6: 'lg:col-span-6', 7: 'lg:col-span-7', 8: 'lg:col-span-8', 9: 'lg:col-span-9', 10: 'lg:col-span-10',
};

/** a step's `cols`: how many fields side by side on wide screens */
export const STEP_COLS = {
  1: 'grid gap-4',
  2: 'grid gap-x-5 gap-y-4 sm:grid-cols-2',
  3: 'grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4',
};

/** one numbered step: number, icon, title and subtitle, actions on the right, then its fields */
export function Step({ n, tone = 'slate', icon: Icon, title, subtitle, actions, children }) {
  const t = TONES[tone] ?? TONES.slate;
  return (
    <section className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      {/* a slim title bar: number, icon, then the title with its subtitle on the same line */}
      <div className={cn('flex flex-wrap items-center gap-2.5 border-b px-4 py-1.5', t.bar)}>
        <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white', t.n)}>{n}</span>
        {Icon && (
          <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-card">
            <Icon className={cn('size-4', t.title)} aria-hidden="true" />
          </span>
        )}
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className={cn('shrink-0 text-sm leading-tight font-semibold', t.title)}>{title}</h3>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-end gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** a field the screen keeps read-only (a record's code, an alias the system sets): shown locked */
export function LockedField({ c, label, value }) {
  const id = `f-${c.id}`;
  return (
    <Field label={label} id={id} className="min-w-0">
      <div className="relative">
        <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        {/* a new record's key is 0 until it is saved (the server gives it the next number) */}
        <Input id={id} readOnly value={c.id === 'PrimaryKey' && /^0?$/.test(String(value ?? '').trim()) ? '' : (value ?? '')} placeholder={c.id === 'PrimaryKey' ? 'Auto-generated' : undefined} className="bg-muted/60 pl-9 text-muted-foreground" />
      </div>
    </Field>
  );
}

/** a value the server sets and keeps (an order's number, today's date, the order's own unit), shown locked */
export function LockedValue({ label, value, placeholder, className }) {
  const id = useId();
  return (
    <Field label={label} id={id} className={cn('min-w-0', className)}>
      <div className="relative">
        <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input id={id} readOnly value={value ?? ''} placeholder={placeholder} className="bg-muted/60 pl-9 text-muted-foreground" />
      </div>
    </Field>
  );
}
