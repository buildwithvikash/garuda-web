const PILLS = {
  2: ['Completed', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-200'],
  1: ['In Process', 'bg-primary/5 text-primary ring-primary/25'],
  0: ['Pending', 'bg-muted text-muted-foreground ring-border'],
};
/** A route stage's status (0 waiting, 1 started, 2 completed) as a pill. */
export default function StatusPill({ status }) {
  const [text, cls] = PILLS[status] ?? PILLS[0];
  return <span className={`inline-flex min-w-24 justify-center rounded-full px-3 py-0.5 text-xs font-semibold ring-1 ${cls}`}>{text}</span>;
}
