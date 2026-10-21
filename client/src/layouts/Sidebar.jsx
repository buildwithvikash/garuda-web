import { ChevronRight, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { flatten, groupsOf } from './nav.js';

// Per-section colour palette, as in QMAS / WRL Tool Report (full class names for Tailwind).
const PALETTE = [
  { iconBg: 'bg-blue-100', iconText: 'text-blue-600', activeIconBg: 'bg-blue-600', activeBg: 'bg-blue-50', activeText: 'text-blue-700', dot: 'bg-blue-500', border: 'border-l-blue-500' },
  { iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', activeIconBg: 'bg-emerald-600', activeBg: 'bg-emerald-50', activeText: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-l-emerald-500' },
  { iconBg: 'bg-violet-100', iconText: 'text-violet-600', activeIconBg: 'bg-violet-600', activeBg: 'bg-violet-50', activeText: 'text-violet-700', dot: 'bg-violet-500', border: 'border-l-violet-500' },
  { iconBg: 'bg-orange-100', iconText: 'text-orange-600', activeIconBg: 'bg-orange-600', activeBg: 'bg-orange-50', activeText: 'text-orange-700', dot: 'bg-orange-500', border: 'border-l-orange-500' },
  { iconBg: 'bg-rose-100', iconText: 'text-rose-600', activeIconBg: 'bg-rose-600', activeBg: 'bg-rose-50', activeText: 'text-rose-700', dot: 'bg-rose-500', border: 'border-l-rose-500' },
  { iconBg: 'bg-cyan-100', iconText: 'text-cyan-600', activeIconBg: 'bg-cyan-600', activeBg: 'bg-cyan-50', activeText: 'text-cyan-700', dot: 'bg-cyan-500', border: 'border-l-cyan-500' },
];

const NavItem = ({ item, active, color }) => (
  <Link
    to={item.route}
    aria-current={active ? 'page' : undefined}
    className={`flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[12.5px] font-medium transition-all group ${
      active ? `${color.activeBg} ${color.activeText} font-semibold` : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
    }`}
  >
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${active ? `${color.dot} scale-125` : 'bg-slate-300 group-hover:bg-slate-400'}`} />
    <span className="truncate">{item.caption}</span>
  </Link>
);

/** QMAS sidebar: the user's menu groups, each with its own colour; collapses to an icon rail, a drawer on phones. */
export default function Sidebar({ menu, expanded, onToggle, isMobile }) {
  const location = useLocation();
  const [open, setOpen] = useState({});
  const showLabels = expanded || isMobile;
  const sections = useMemo(() => groupsOf(menu).map((g) => ({ ...g, items: flatten(g.children) })), [menu]);

  // Open the section that contains the current page.
  useEffect(() => {
    const active = sections.find((s) => s.items.some((i) => i.route === location.pathname));
    if (active) setOpen((o) => ({ ...o, [active.moduleId]: true }));
  }, [location.pathname, sections]);

  // On phones the sidebar is a drawer: close it after navigating.
  useEffect(() => {
    if (isMobile && expanded) onToggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleSection = (key) => {
    if (!showLabels) return onToggle();
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  };

  return (
    <>
      {isMobile && expanded && <div className="fixed inset-0 top-16 bg-slate-900/40 z-30 backdrop-blur-sm" onClick={onToggle} />}
      {isMobile && !expanded && (
        <button type="button" onClick={onToggle} aria-label="Open menu" className="fixed top-[72px] left-3 z-30 w-10 h-10 flex items-center justify-center bg-white text-slate-600 rounded-xl shadow-md border border-slate-200">
          <Menu className="w-4 h-4" />
        </button>
      )}

      <aside
        aria-label="Main navigation"
        className={`fixed top-16 left-0 h-[calc(100vh-64px)] z-40 flex flex-col bg-white border-r border-slate-100 shadow-sm transition-all duration-300 select-none ${
          isMobile ? (expanded ? 'w-72 translate-x-0 shadow-xl' : 'w-72 -translate-x-full') : expanded ? 'w-64' : 'w-[56px]'
        }`}
      >
        <div className={`flex items-center h-12 px-2.5 border-b border-slate-100 shrink-0 ${showLabels ? 'justify-between' : 'justify-center'}`}>
          {showLabels && <span className="text-xs font-medium text-slate-500 px-1">Navigation</span>}
          <button type="button" onClick={onToggle} aria-label={showLabels ? 'Collapse menu' : 'Expand menu'} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
            {showLabels ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-0.5">
          {sections.map((section, idx) => {
            const color = PALETTE[idx % PALETTE.length];
            const Icon = section.icon;
            const sectionActive = section.items.some((i) => i.route === location.pathname);
            const isOpen = !!open[section.moduleId];
            return (
              <div key={section.moduleId}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.moduleId)}
                  title={showLabels ? undefined : section.caption}
                  aria-expanded={isOpen}
                  className={`relative w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border-l-2 ${
                    sectionActive ? `${color.activeBg} ${color.activeText} ${color.border} font-semibold` : 'border-l-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${sectionActive ? `${color.activeIconBg} text-white shadow-sm` : `${color.iconBg} ${color.iconText}`}`}>
                    <Icon className="w-[15px] h-[15px]" />
                  </span>
                  {showLabels && (
                    <>
                      <span className="flex-1 text-left truncate text-[13px]">{section.caption}</span>
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    </>
                  )}
                  {!showLabels && sectionActive && <span className={`absolute right-1 top-1 w-1.5 h-1.5 rounded-full ${color.dot}`} />}
                </button>

                {showLabels && isOpen && (
                  <div className="mt-0.5 ml-[14px] pl-3 border-l-2 border-slate-100 pb-1.5">
                    {section.items.map((item) => (
                      <NavItem key={item.moduleId} item={item} active={item.route === location.pathname} color={color} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {showLabels && <p className="shrink-0 border-t border-slate-100 px-3 py-2 text-[10px] text-slate-300 text-center">Garuda · Western Refrigeration</p>}
      </aside>
    </>
  );
}
