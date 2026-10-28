// A date-time range filter, as on the WRL dashboards: start and end time, Query, and the quick ranges Yesterday / Today /
// MTD (month to date). Put it in a DataTable's `toolbar` (its filter card gives it the captions and the dark Query
// button). onApply({ start, end }): 'YYYY-MM-DDTHH:mm' each, or '' for no limit.
import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';

const pad = (n) => String(n).padStart(2, '0');
/** a Date as a date-time box holds it (local time) */
const boxValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayStart = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
};
const dayEnd = (d) => {
  const e = new Date(d);
  e.setHours(23, 59, 0, 0);
  return e;
};
const QUICK = {
  yesterday: () => [dayStart(-1), dayEnd(dayStart(-1))],
  today: () => [dayStart(), dayEnd(dayStart())],
  mtd: () => [new Date(dayStart().setDate(1)), dayEnd(dayStart())],
};
const QUICK_STYLE = {
  yesterday: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  today: 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  mtd: 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
};

export default function DateRangeFilter({ value = {}, onApply }) {
  const [start, setStart] = useState(value.start ?? '');
  const [end, setEnd] = useState(value.end ?? '');
  const apply = (s, e) => {
    setStart(s);
    setEnd(e);
    onApply({ start: s, end: e });
  };
  const quick = (k) => apply(...QUICK[k]().map(boxValue));
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ start, end });
      }}
    >
      <label className="flex flex-col gap-1">
        <span>Start time</span>
        <Input type="datetime-local" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} aria-label="Start time" />
      </label>
      <label className="flex flex-col gap-1">
        <span>End time</span>
        <Input type="datetime-local" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} aria-label="End time" />
      </label>
      <Button type="submit" icon={Search}>Query</Button>
      {(start || end) && (
        <Button type="button" variant="ghost" icon={X} onClick={() => apply('', '')}>
          Clear
        </Button>
      )}
      <span className="ml-1 self-center text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Quick</span>
      {[['yesterday', 'Yesterday'], ['today', 'Today'], ['mtd', 'MTD']].map(([k, label]) => (
        <Button key={k} type="button" variant="outline" className={QUICK_STYLE[k]} onClick={() => quick(k)}>
          {label}
        </Button>
      ))}
    </form>
  );
}
