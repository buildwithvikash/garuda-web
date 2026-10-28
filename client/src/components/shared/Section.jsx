import { Card, CardContent } from '@/components/ui/card.jsx';
import { toneFor } from '@/lib/tones.js';
import { cn } from '@/lib/utils';

/**
 * A card with a coloured header (icon tile, title, description, actions): the building block of page content.
 * Form sections, tables, charts and summaries all sit in a Section. Without a `tone` the colour is picked from the
 * title, so every section of a form gets its own colour with nothing to configure.
 *
 *   <Section icon={Package} title="Product" actions={<Button size="sm">Edit</Button>}>...</Section>
 *   <Section title="Records" tone="indigo" flush>{table}</Section>   // flush: no body padding, for tables
 */
export default function Section({ icon: Icon, title, description, actions, tone, flush = false, className = '', children }) {
  const t = toneFor(tone, typeof title === 'string' ? title : '');
  const hasHeader = title || actions;
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      {hasHeader && (
        <div className={cn('flex items-center justify-between gap-3 border-b bg-gradient-to-r to-transparent px-5 py-3', t.tint)}>
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', t.soft, t.text)}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-[13px] leading-none font-semibold tracking-wide uppercase">{title}</h2>
              {description && <p className="mt-1.5 text-xs text-muted-foreground normal-case">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <CardContent className={flush ? 'p-0' : 'p-5'}>{children}</CardContent>
    </Card>
  );
}
