import { Card, CardContent } from '@/components/ui/card.jsx';

/** One headline number with a label and a note (dashboard summaries). */
export default function StatCard({ icon: Icon, label, value, note, tone = 'text-muted-foreground' }) {
  return (
    <Card className="py-0">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          {Icon && <Icon className={`size-4 ${tone}`} aria-hidden="true" />}
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  );
}
