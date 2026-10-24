import { Card, CardContent } from '@/components/ui/card.jsx';
import { cn } from '@/lib/utils';

/**
 * A card with an optional header (icon, title, description, actions): the building block of page content.
 * Form sections, tables, charts and summaries all sit in a Section.
 *
 *   <Section icon={Package} title="Product" actions={<Button size="sm">Edit</Button>}>...</Section>
 *   <Section title="Records" flush>{table}</Section>   // no body padding, for tables
 */
export default function Section({ icon: Icon, title, description, actions, flush = false, className = '', children }) {
  const hasHeader = title || actions;
  return (
    <Card className={cn('gap-0 py-0', className)}>
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />}
            <div className="min-w-0">
              <h2 className="truncate text-sm leading-none font-semibold">{title}</h2>
              {description && <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <CardContent className={flush ? 'p-0' : 'p-5'}>{children}</CardContent>
    </Card>
  );
}
