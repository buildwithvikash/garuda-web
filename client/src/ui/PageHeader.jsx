import { ChevronRight, Home } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMe } from '../layouts/AppLayout.jsx';
import { groupsOf, flatten } from '../layouts/nav.js';

/** Where the current page sits in the menu: its group, then the page (as in QMAS's breadcrumb). */
function useCrumbs() {
  const { pathname } = useLocation();
  const me = useMe();
  if (!me) return [];
  for (const g of groupsOf(me.menu)) {
    const item = flatten(g.children).find((i) => i.route === pathname);
    if (item) return [{ label: g.caption }, { label: item.caption }];
  }
  return [];
}

/**
 * Page header (QMAS): breadcrumb trail, icon chip, title, subtitle and actions. Sticky, with a frosted background so
 * content scrolls under it.
 */
export default function PageHeader({ icon: Icon, title, subtitle, children }) {
  const crumbs = useCrumbs();
  // Publish the header's height as --page-header-h, so parts of a page can stick just below it.
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => document.documentElement.style.setProperty('--page-header-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-slate-200/80">
      <div className="px-5 pt-2.5 pb-3">
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[11px] text-slate-400 mb-1.5 min-w-0">
            <Link to="/start" className="hover:text-blue-600 shrink-0" aria-label="Home"><Home className="w-3 h-3" /></Link>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="w-3 h-3 shrink-0 text-slate-300" />
                <span className="truncate">{c.label}</span>
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="p-2 rounded-lg bg-blue-50 ring-1 ring-blue-100 shrink-0">
                <Icon className="w-4 h-4 text-blue-700" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-900 leading-tight truncate">{title}</h1>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
