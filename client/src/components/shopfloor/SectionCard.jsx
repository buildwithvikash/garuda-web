import { toneFor } from '@/lib/tones.js';
import { cn } from '@/lib/utils';

/**
 * A titled card for the shop-floor screens: a coloured header (icon tile, title, actions) over the content.
 * `tone` is a name from @/lib/tones.js (green, violet ...); without it the colour is picked from the title.
 * `flush` removes the body padding, for tables.
 */
export default function SectionCard({ icon: Icon, title, actions, tone, flush = false, children, className = '' }) {
  const t = toneFor(tone, typeof title === 'string' ? title : '');
  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm', className)}>
      <div className={cn('flex min-h-12 flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r to-transparent px-5 py-3', t.tint)}>
        <h2 className="flex items-center gap-3 text-[13px] font-semibold tracking-wide uppercase">
          {Icon && (
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', t.soft, t.text)}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
          )}
          {title}
        </h2>
        {actions}
      </div>
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}
