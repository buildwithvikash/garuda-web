// Layout.Master: login check, user header, role-filtered menu, menu search (DdlModules).
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const MeContext = createContext(null);
export const useMe = () => useContext(MeContext);

function flatten(nodes, trail = []) {
  return nodes.flatMap((n) => [
    ...(n.route && n.moduleId !== 10001 ? [{ ...n, trail: [...trail, n.caption].join(' › ') }] : []),
    ...flatten(n.children, [...trail, n.caption]),
  ]);
}

function MenuGroup({ node, depth = 0 }) {
  const { pathname } = useLocation();
  const active = useMemo(() => flatten([node]).some((n) => n.route === pathname), [node, pathname]);
  const [open, setOpen] = useState(active);
  if (node.moduleId === 10000) return null; // Logout group: shown in the header instead

  if (!node.children.length) {
    if (!node.route) return null;
    return (
      <NavLink
        to={node.route}
        className={({ isActive }) =>
          `block truncate rounded-md px-3 py-1.5 text-sm transition ${isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`
        }
        style={{ paddingLeft: 12 + depth * 12 }}
        title={node.caption}
      >
        {node.caption}
      </NavLink>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-200 hover:bg-white/10"
        style={{ paddingLeft: 12 + depth * 12 }}
      >
        {node.icon && depth === 0 && <img src={`/${node.icon}`} alt="" className="h-4 w-4 opacity-80 invert" />}
        <span className="flex-1 truncate">{node.caption}</span>
        <span className={`text-xs transition ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {node.children.map((c) => (
            <MenuGroup key={c.moduleId} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname, search: query } = useLocation();
  // Shop-floor TVs open dashboards with ?UCode=...: no menu or header, the dashboard fills the screen.
  const kiosk = pathname.startsWith('/dashboards/') && new URLSearchParams(query).has('UCode');

  useEffect(() => {
    if (!kiosk) api('/auth/me').then(setMe);
  }, [kiosk]);
  useEffect(() => setMenuOpen(false), [pathname]);

  const items = me?.search ?? [];
  const matches = search.trim() ? items.filter((i) => i.caption.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 12) : [];

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    navigate('/login', { replace: true });
  }

  if (kiosk)
    return (
      <main className="min-h-screen bg-slate-950 p-4 sm:p-6">
        <Outlet />
      </main>
    );
  if (!me) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;

  return (
    <MeContext.Provider value={me}>
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-72 shrink-0 overflow-y-auto bg-slate-900 p-3 transition-transform lg:static lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="mb-4 flex items-center gap-2 px-2 pt-1">
            <img src="/Assets/Images/Logo.png" alt="" className="h-8 rounded bg-white p-0.5" />
            <span className="font-semibold text-white">Garuda</span>
          </div>
          <nav className="space-y-0.5" aria-label="Main menu">
            {me.menu.map((n) => (
              <MenuGroup key={n.moduleId} node={n} />
            ))}
          </nav>
        </aside>
        {menuOpen && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} />}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
            <button className="btn-ghost lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">☰</button>
            <div className="relative w-full max-w-md">
              <input
                className="field"
                placeholder="Search the Menus"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search the menus"
              />
              {matches.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 max-h-80 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200">
                  {matches.map((m) => (
                    <li key={m.moduleId}>
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => { setSearch(''); navigate(m.route); }}
                      >
                        <span className="font-medium">{m.caption}</span>
                        <span className="block truncate text-xs text-slate-400">{m.trail}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right text-xs leading-tight sm:block">
                <div className="font-medium text-slate-800">{me.user.userName || me.user.userId}</div>
                <div className="text-slate-500">{[me.user.lineName, me.user.department].filter(Boolean).join(' · ')}</div>
              </div>
              <img src={me.user.photo ?? '/Assets/Images/UserImage.jpg'} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-slate-100" />
              <button className="btn-ghost" onClick={logout}>Logout</button>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </MeContext.Provider>
  );
}
