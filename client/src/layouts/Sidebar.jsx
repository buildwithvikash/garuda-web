// Sidebar.jsx — everything in one file: menu config, helpers, and the YouTube-style sidebar.
//
//   Desktop expanded : 256px full sidebar, collapsible sections, search
//   Desktop collapsed: 72px mini rail (icon + tiny label), click a group to expand it
//   Mobile           : slide-in drawer with overlay, Escape to close, body scroll locked
//
// Usage: <Sidebar menu={menu} expanded={expanded} onToggle={toggle} isMobile={isMobile} />
// Other files that used "./nav.js" can now import GROUPS, QUICK, flatten, groupsOf, screenOf from here.

import {
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Factory,
  Layers,
  List,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  RefreshCcw,
  ScanBarcode,
  Search,
  Settings2,
  UserCog,
  Wrench,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

/* ───────────────────────────── Config ───────────────────────────── */

// How server menu groups (menu.json moduleIds) are presented: order, icon, optional caption override.
export const GROUPS = {
  3000: { order: 1, icon: Factory },
  2000: { order: 2, icon: ClipboardCheck },
  2: { order: 3, icon: Package },
  3: { order: 4, icon: Wrench, caption: "Production Setup" },
  4: { order: 5, icon: Settings2 },
  1: { order: 6, icon: Building2 },
  5: { order: 7, icon: UserCog },
};

// Shop-floor screens shown as large tiles on the home page.
export const QUICK = [
  {
    route: "/production/wipcaptureform",
    icon: ScanBarcode,
    tone: "bg-primary",
    hint: "Scan at a station: start, complete, QC, FG label",
  },
  {
    route: "/production/productionassignmentform",
    icon: Printer,
    tone: "bg-emerald-600",
    hint: "Start a production order and print job cards",
  },
  {
    route: "/production/productionorderform",
    icon: ClipboardList,
    tone: "bg-violet-600",
    hint: "Create and manage production orders",
  },
  {
    route: "/quality/reworkconfirmationnew",
    icon: RefreshCcw,
    tone: "bg-orange-600",
    hint: "Confirm rework on rejected units",
  },
  {
    route: "/production/prodplanupload",
    icon: Layers,
    tone: "bg-cyan-600",
    hint: "Upload monthly label plans",
  },
  {
    route: "/quality/qualityinspectionform",
    icon: CheckCircle2,
    tone: "bg-destructive",
    hint: "Final inspection of held units",
  },
];

// Full class names so Tailwind can see them at build time.
// One neutral look for every group (shadcn sidebar tokens). The brand colour only marks the active group and page.
const GROUP_LOOK = {
  iconBg: "bg-muted",
  iconText: "text-muted-foreground",
  activeIconBg: "bg-primary",
  activeBg: "bg-sidebar-accent",
  activeText: "text-sidebar-accent-foreground",
  dot: "bg-primary",
  border: "border-l-primary",
};
const PALETTE = [GROUP_LOOK];

const HEADER_MODULE_ID = 10000; // hidden top-level group
const HIDDEN_ITEM_ID = 10001; // hidden leaf screen

/* ───────────────────────────── Menu helpers ───────────────────────────── */

/** Every screen of a menu tree with its group trail ("Production › WIP Capture"). */
export function flatten(nodes, trail = []) {
  return nodes.flatMap((n) => [
    ...(n.route && n.moduleId !== HIDDEN_ITEM_ID
      ? [{ ...n, trail: [...trail, n.caption].join(" › ") }]
      : []),
    ...flatten(n.children ?? [], [...trail, n.caption]),
  ]);
}

/** Top-level groups with display caption + icon, in presentation order. */
export function groupsOf(menu) {
  return menu
    .filter((n) => n.moduleId !== HEADER_MODULE_ID)
    .map((n) => {
      const cfg = GROUPS[n.moduleId];
      return {
        ...n,
        order: cfg?.order ?? 99,
        icon: cfg?.icon ?? List,
        caption: cfg?.caption ?? n.caption,
      };
    })
    .sort((a, b) => a.order - b.order);
}

/** Caption (and group) for a route, from the user's menu. */
export function screenOf(menu, route) {
  for (const g of groupsOf(menu)) {
    const item = flatten(g.children ?? []).find((i) => i.route === route);
    if (item) return { caption: item.caption, group: g };
  }
  return null;
}

/** Sections + O(1) route lookup, built once per menu. */
function buildSections(menu) {
  const routeToSection = new Map();
  const routes = [];
  const sections = groupsOf(menu).map((g, idx) => {
    const items = flatten(g.children ?? []);
    items.forEach((i) => {
      routeToSection.set(i.route, g.moduleId);
      routes.push(i.route);
    });
    return {
      id: g.moduleId,
      caption: g.caption,
      icon: g.icon,
      color: PALETTE[idx % PALETTE.length],
      items: items.map((i) => ({ ...i, lower: i.caption.toLowerCase() })),
    };
  });
  return { sections, routeToSection, routes };
}

/** Exact match first, otherwise the longest route that is a parent of the path (e.g. /orders/42). */
function matchRoute(pathname, routes) {
  if (routes.includes(pathname)) return pathname;
  let best = null;
  for (const r of routes) {
    if (pathname.startsWith(r + "/") && (!best || r.length > best.length))
      best = r;
  }
  return best;
}

/* ───────────────────────────── Pieces ───────────────────────────── */

const NavItem = memo(function NavItem({ item, active, color }) {
  return (
    <Link
      to={item.route}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-2.5 rounded-lg px-3 py-1.75 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
        active
          ? `${color.activeBg} ${color.activeText} font-semibold`
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground/80"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full transition-transform ${
          active
            ? `${color.dot} scale-125`
            : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50"
        }`}
      />
      <span className="truncate">{item.caption}</span>
    </Link>
  );
});

const Section = memo(function Section({
  section,
  isOpen,
  isActive,
  activeRoute,
  showLabels,
  onToggle,
  items,
}) {
  const { color, icon: Icon, id, caption } = section;
  const panelId = `nav-section-${id}`;

  const iconBox = (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${
        showLabels ? "h-7 w-7" : "h-8 w-8"
      } ${
        isActive
          ? `${color.activeIconBg} text-primary-foreground shadow-sm`
          : `${color.iconBg} ${color.iconText}`
      }`}
    >
      <Icon className="h-3.75 w-3.75" />
    </span>
  );

  return (
    <div>
      {showLabels ? (
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border-l-2 px-2 py-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
            isActive
              ? `${color.activeBg} ${color.activeText} ${color.border} font-semibold`
              : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          {iconBox}
          <span className="flex-1 truncate text-left">{caption}</span>
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        </button>
      ) : (
        // YouTube-style mini rail: icon with tiny label under it.
        <button
          type="button"
          onClick={() => onToggle(id)}
          title={caption}
          aria-label={caption}
          className={`relative flex w-full cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
            isActive ? color.activeBg : "hover:bg-muted/50"
          }`}
        >
          {iconBox}
          <span
            className={`w-full truncate text-center text-[9.5px] leading-tight ${
              isActive ? `${color.activeText} font-semibold` : "text-muted-foreground"
            }`}
          >
            {caption}
          </span>
        </button>
      )}

      {showLabels && isOpen && (
        <div
          id={panelId}
          className="ml-3.5 mt-0.5 border-l-2 border-border pb-1.5 pl-3"
        >
          {items.map((item) => (
            <NavItem
              key={item.moduleId ?? item.route}
              item={item}
              active={item.route === activeRoute}
              color={color}
            />
          ))}
        </div>
      )}
    </div>
  );
});

/* ───────────────────────────── Sidebar ───────────────────────────── */

export default function Sidebar({ menu, expanded, onToggle, isMobile }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState({});
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);

  const showLabels = expanded || isMobile;
  const searching = showLabels && query.trim().length > 0;

  // Built once per menu, not per render.
  const { sections, routeToSection, routes } = useMemo(
    () => buildSections(menu ?? []),
    [menu],
  );

  const activeRoute = useMemo(
    () => matchRoute(pathname, routes),
    [pathname, routes],
  );
  const activeSectionId = activeRoute
    ? routeToSection.get(activeRoute)
    : undefined;

  // Always call the latest onToggle without re-running effects.
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;

  // Open the section that contains the current page.
  useEffect(() => {
    if (activeSectionId !== undefined) {
      setOpen((o) =>
        o[activeSectionId] ? o : { ...o, [activeSectionId]: true },
      );
    }
  }, [activeSectionId]);

  // Phones: close the drawer after navigating (skip the first render).
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      if (isMobile && expanded) toggleRef.current();
    }
  }, [pathname, isMobile, expanded]);

  // Phones: Escape closes the drawer, and the page behind it stops scrolling.
  useEffect(() => {
    if (!(isMobile && expanded)) return;
    const onKey = (e) => e.key === "Escape" && toggleRef.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isMobile, expanded]);

  // Clear the search when the sidebar collapses.
  useEffect(() => {
    if (!showLabels) setQuery("");
  }, [showLabels]);

  // In the mini rail, clicking a group expands the sidebar and opens that group.
  const toggleSection = useCallback(
    (id) => {
      if (!showLabels) {
        setOpen((o) => ({ ...o, [id]: true }));
        toggleRef.current();
        return;
      }
      setOpen((o) => ({ ...o, [id]: !o[id] }));
    },
    [showLabels],
  );

  // Filtered view while searching (sections with no matches disappear).
  const visible = useMemo(() => {
    if (!searching)
      return sections.map((s) => ({ section: s, items: s.items }));
    const q = query.trim().toLowerCase();
    return sections
      .map((s) => ({
        section: s,
        items: s.items.filter((i) => i.lower.includes(q)),
      }))
      .filter((v) => v.items.length > 0);
  }, [sections, searching, query]);

  const asideWidth = isMobile
    ? expanded
      ? "w-72 translate-x-0 shadow-xl"
      : "w-72 -translate-x-full"
    : expanded
      ? "w-64"
      : "w-[72px]";

  return (
    <>
      {isMobile && expanded && (
        <div
          className="fixed inset-0 top-16 z-30 bg-foreground/40 backdrop-blur-sm"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}
      {isMobile && !expanded && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open menu"
          className="fixed left-3 top-18 z-30 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-md"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      <aside
        aria-label="Main navigation"
        inert={isMobile && !expanded ? "" : undefined}
        className={`fixed left-0 top-16 z-40 flex h-[calc(100vh-64px)] select-none flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-300 motion-reduce:transition-none ${asideWidth}`}
      >
        {/* Header */}
        <div
          className={`flex h-12 shrink-0 items-center border-b border-border px-2.5 ${
            showLabels ? "justify-between" : "justify-center"
          }`}
        >
          {showLabels && (
            <span className="px-1 text-xs font-medium text-muted-foreground">
              Navigation
            </span>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-label={showLabels ? "Collapse menu" : "Expand menu"}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-muted hover:text-foreground/80 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {showLabels ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Search (only useful once the menu is large) */}
        {showLabels && sections.length > 0 && (
          <div className="shrink-0 px-2 pt-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a screen"
                aria-label="Find a screen"
                className="w-full rounded-lg border border-border bg-muted/50 py-1.5 pl-8 pr-7 text-[12.5px] text-foreground/80 placeholder:text-muted-foreground/70 focus:border-primary/50 focus:bg-card focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground/80"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Sections */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 py-3 scrollbar-thin">
          {visible.map(({ section, items }) => (
            <Section
              key={section.id}
              section={section}
              items={items}
              isOpen={searching || !!open[section.id]}
              isActive={section.id === activeSectionId}
              activeRoute={activeRoute}
              showLabels={showLabels}
              onToggle={toggleSection}
            />
          ))}
          {searching && visible.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground/70">
              No screens match “{query.trim()}”.
            </p>
          )}
        </nav>

        {showLabels && (
          <p className="shrink-0 border-t border-border px-3 py-2 text-center text-[10px] text-muted-foreground/50">
            Garuda · Western Refrigeration
          </p>
        )}
      </aside>
    </>
  );
}
