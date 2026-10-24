/** Centred message with an icon, for "nothing here" and "not available" states. */
export default function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-2 rounded-xl border bg-card px-6 py-14 text-center shadow-sm">
      {Icon && (
        <span className="grid size-12 place-items-center rounded-xl bg-muted">
          <Icon className="size-6 text-muted-foreground" />
        </span>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
