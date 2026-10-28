// How a list cell shows its text (DataTable): status words as coloured badges, kinds / types as quiet badges, dates and
// times quietly, quantities right-aligned, blanks as a faint dash. Only plain text is formatted; a column whose own
// render returns an element keeps it. The text itself is never changed (search, export and the filter use it as is),
// except that a date-only value's "12:00:00 AM" is not shown.
import { Badge } from '@/components/ui/badge.jsx';

// columns, by their header
const STATUS = /status$/i; // STATUS, QCSTATUS, Status ...
const KIND = /^(type|plan\s*type|lgroup|stage|uom\s*type|defect\s*category|category)$/i;
const QTY = /qty|quantity|^(count|print\s*lbl|start\s*serial|end\s*serial)$/i;
const MONO = /^(ip|ip\s*address)$/i;

// status words (and the status codes the screens save: 1 active, 0 de-active, 200 cancelled)
const TONE = {
  active: 'success', approved: 'success', completed: 'success', complete: 'success', ok: 'success', pass: 'success', passed: 'success', '1': 'success',
  'de-active': 'neutral', deactive: 'neutral', inactive: 'neutral', closed: 'neutral', '0': 'neutral',
  hold: 'warning', pending: 'warning', open: 'warning', rework: 'warning', 'in process': 'warning',
  cancelled: 'danger', canceled: 'danger', rejected: 'danger', fail: 'danger', failed: 'danger', ng: 'danger', scrap: 'danger', '200': 'danger',
};
const YES_NO = { yes: 'success', true: 'success', no: 'neutral', false: 'neutral' };
const DATE = /^(\d{2}-\d{2}-\d{4}) (\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)? ?(?:AM|PM)?)$/i; // as the lists send them
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

/** a column's alignment when it does not set one: quantities right */
export const alignOf = (header) => (QTY.test(String(header ?? '').trim()) ? 'right' : undefined);

/** the cell's content for a column header and its plain value */
export function formatCell(header, value) {
  const h = String(header ?? '').trim();
  const t = String(value ?? '').trim();
  if (t === '' || t === '—') return <span className="text-muted-foreground/50">—</span>;
  const low = t.toLowerCase();
  if (STATUS.test(h))
    return (
      <Badge variant={TONE[low] ?? 'info'} dot>
        {t}
      </Badge>
    );
  if (YES_NO[low]) return <Badge variant={YES_NO[low]}>{t}</Badge>;
  if (KIND.test(h) && !NUMBER.test(t)) return <Badge variant="neutral">{t}</Badge>;
  const d = DATE.exec(t);
  if (d)
    return (
      <span className="tabular whitespace-nowrap">
        {d[1]}
        {!/^12:00(:00)? ?AM$/i.test(d[2]) && <span className="ml-1.5 text-muted-foreground">{d[2]}</span>}
      </span>
    );
  if (TIME.test(t) || NUMBER.test(t)) return <span className="tabular">{t}</span>;
  if (MONO.test(h)) return <span className="font-mono text-xs">{t}</span>;
  return t;
}
