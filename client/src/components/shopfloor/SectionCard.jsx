/**
 * A titled card for the shop-floor screens: a plain header (small icon, title, actions) over the content.
 * `flush` removes the body padding, for tables. (Older callers may still pass `tone`; it is ignored.)
 */
export default function SectionCard({
  icon: Icon,
  title,
  actions,
  flush = false,
  children,
  className = "",
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm ${className}`}
    >
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {Icon && (
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
          {title}
        </h2>
        {actions}
      </div>
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}
