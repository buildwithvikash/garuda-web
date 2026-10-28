import { ChevronRight, Home } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useMe } from '@/layouts/AppLayout.jsx';
import { flatten, groupsOf } from '@/layouts/Sidebar.jsx';

/** Where the current page sits in the menu: its group, then the page. */
function useCrumbs() {
  const { pathname } = useLocation();
  const me = useMe();
  if (!me) return [];
  for (const g of groupsOf(me.menu)) {
    const item = flatten(g.children ?? []).find((i) => i.route === pathname);
    if (item) return [{ label: g.caption }, { label: item.caption }];
  }
  return [];
}

/** The fixed top bar of a page: breadcrumb, icon, title, subtitle and actions. Use it through <Page>. */
export default function PageHeader({ icon: Icon, title, subtitle, children }) {
  const crumbs = useCrumbs();
  return (
    <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-6">
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-1.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <Link to="/start" className="shrink-0 hover:text-foreground" aria-label="Home">
            <Home className="size-3.5" />
          </Link>
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3 shrink-0 opacity-60" />
              <span className="truncate">{c.label}</span>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md shadow-primary/25">
              <Icon className="size-5" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg leading-tight font-semibold">{title}</h1>
            {subtitle && <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}
