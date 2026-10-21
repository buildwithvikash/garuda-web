// Home (QMAS style): a welcome band with the line and date, the shop-floor screens as tiles, then every other screen.
import { CalendarDays, ChevronRight, Factory, Inbox } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../layouts/AppLayout.jsx';
import { QUICK, flatten, groupsOf } from '../layouts/nav.js';

const partOfDay = () => {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
};

export default function Start() {
  const me = useMe();
  const u = me.user;
  const screens = useMemo(() => flatten(me.menu), [me]);
  const byRoute = useMemo(() => new Map(screens.map((s) => [s.route, s])), [screens]);
  const tiles = QUICK.filter((q) => byRoute.has(q.route)).map((q) => ({ ...q, caption: byRoute.get(q.route).caption }));
  const quickRoutes = new Set(tiles.map((t) => t.route));
  const groups = groupsOf(me.menu)
    .map((g) => ({ ...g, items: flatten(g.children).filter((i) => !quickRoutes.has(i.route)) }))
    .filter((g) => g.items.length);
  const now = new Date();
  const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'long' }).format(now);
  const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const name = (u.userName || u.userId).split(' ')[0];

  return (
    <div className="p-3 sm:p-4 space-y-3">
      <section className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-sky-50 to-blue-100/70 px-4 py-3 sm:px-5" aria-label="Welcome">
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-lg shadow-blue-600/20">
            <Factory className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-slate-900">Good {partOfDay()}, {name}</h1>
            <p className="text-xs text-slate-600">{u.lineName ? `Working on ${u.lineName}${u.department ? ` · Department ${u.department}` : ''}.` : 'Choose a screen to start.'}</p>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-white/80 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700"><CalendarDays className="h-4 w-4" /></span>
            <span><span className="block text-[11px] text-slate-500">{weekday}</span><span className="block text-sm font-bold text-slate-900">{date}</span></span>
          </div>
        </div>
      </section>

      {tiles.length > 0 && (
        <section aria-labelledby="quick">
          <h2 id="quick" className="section-title mb-2 px-1">Shop floor</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tiles.map((t) => (
              <Link key={t.route} to={t.route} className="card card-hover group flex items-center gap-4 p-4">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${t.tone} text-white shadow-lg shadow-black/10`}>
                  <t.icon className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-slate-900">{t.caption}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{t.hint}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {groups.length === 0 && tiles.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-14 px-4 text-center">
          <span className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center"><Inbox className="w-6 h-6 text-slate-400" /></span>
          <p className="text-sm font-medium text-slate-600">No screens are assigned to your role.</p>
          <p className="text-xs text-slate-400">Ask an administrator to give your role access in User Role.</p>
        </div>
      ) : (
        <section aria-labelledby="all">
          <h2 id="all" className="section-title mb-2 px-1">All screens</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <div key={g.moduleId} className="card p-4">
                <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-slate-800">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-700"><g.icon className="h-[15px] w-[15px]" /></span>
                  {g.caption}
                </h3>
                <ul>
                  {g.items.map((i) => (
                    <li key={i.moduleId}>
                      <Link to={i.route} className="flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] text-slate-600 hover:bg-blue-50 hover:text-blue-700">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                        <span className="truncate">{i.caption}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
