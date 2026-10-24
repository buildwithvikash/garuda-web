const TILES = {
  blue: 'bg-primary text-white',
  green: 'bg-emerald-600 text-white',
  violet: 'bg-violet-600 text-white',
};
/** A titled card with a coloured icon tile (the WIP screen's sections); tone 'violet' also tints the header bar. */
export default function SectionCard({ icon: Icon, title, tone = 'blue', actions, children, className = '' }) {
  return (
    <section className={`rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden ${className}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${tone === 'violet' ? 'bg-violet-500/10 border-b border-violet-500/30' : 'border-b border-border'}`}>
        <h2 className={`flex items-center gap-3 text-lg font-bold ${tone === 'green' ? 'text-emerald-700 dark:text-emerald-300' : tone === 'violet' ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'}`}>
          <span className={`grid h-9 w-9 place-items-center rounded-lg ${TILES[tone]}`}><Icon className="w-5 h-5" /></span>
          {title}
        </h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
