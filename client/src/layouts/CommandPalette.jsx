import { ArrowRight, Clock, CornerDownLeft, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { loadPref, savePref } from '@/utils/prefs.js';
import { flatten } from './Sidebar.jsx';

const RECENT_KEY = 'recent-screens';

/**
 * Go to any screen from anywhere (QMAS's search palette): recent screens first, then matches by name or group.
 * Arrow keys move, Enter opens, Esc closes.
 */
export default function CommandPalette({ me, onClose }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const all = useMemo(() => (me.search?.length ? me.search : flatten(me.menu)), [me]);
  const recent = useMemo(() => loadPref(RECENT_KEY, []).filter((r) => all.some((a) => a.route === r.route)), [all]);

  useEffect(() => input.current?.focus(), []);

  const sections = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const pages = all
      .map((i) => ({ id: i.route, title: i.caption, subtitle: i.trail?.split(' › ').slice(0, -1).join(' › '), link: i.route }))
      .filter((p) => words.every((w) => `${p.title} ${p.subtitle}`.toLowerCase().includes(w)))
      .slice(0, words.length ? 12 : 8);
    const out = [];
    if (!words.length && recent.length) out.push({ key: 'recent', label: 'Recent', items: recent.map((r) => ({ id: r.route, title: r.title, subtitle: r.subtitle, link: r.route })) });
    if (pages.length) out.push({ key: 'page', label: words.length ? 'Screens' : 'Go to', items: pages });
    return out;
  }, [q, all, recent]);

  const flat = sections.flatMap((s) => s.items.map((it) => ({ ...it, group: s.key })));
  const current = Math.min(active, Math.max(flat.length - 1, 0));

  const open = (it) => {
    savePref(RECENT_KEY, [{ route: it.link, title: it.title, subtitle: it.subtitle }, ...loadPref(RECENT_KEY, []).filter((r) => r.route !== it.link)].slice(0, 6));
    onClose();
    navigate(it.link);
  };

  const keys = useRef(null);
  keys.current = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, flat.length - 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
    else if (e.key === 'Enter' && flat[current]) (e.preventDefault(), open(flat[current]));
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && document.activeElement !== input.current) input.current?.focus();
  };
  useEffect(() => {
    const onKey = (e) => keys.current(e);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  let index = -1;
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Go to a screen" className="animate-in fade-in-0 zoom-in-95 w-full max-w-xl rounded-xl border bg-card text-card-foreground shadow-sm shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground/70" />
          <input
            ref={input}
            value={q}
            onChange={(e) => (setQ(e.target.value), setActive(0))}
            placeholder="Type a screen name, e.g. WIP Capture, Routing, Defect…"
            aria-label="Search screens"
            aria-activedescendant={flat[current] ? `cp-${current}` : undefined}
            className="flex-1 py-4 text-[15px] bg-transparent outline-none focus-visible:outline-none placeholder:text-muted-foreground"
          />
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md text-muted-foreground/70 hover:bg-muted cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div ref={listRef} role="listbox" className="max-h-[55vh] overflow-auto p-2">
          {sections.map((s) => (
            <div key={s.key} className="mb-1">
              <div className="text-xs font-medium text-muted-foreground px-2.5 pt-2 pb-1">{s.label}</div>
              {s.items.map((it) => {
                index += 1;
                const i = index;
                const Icon = s.key === 'recent' ? Clock : ArrowRight;
                const on = i === current;
                return (
                  <button
                    key={`${s.key}-${it.id}`}
                    id={`cp-${i}`}
                    type="button"
                    role="option"
                    aria-selected={on}
                    data-active={on}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => open(it)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left cursor-pointer ${on ? 'bg-primary/5' : ''}`}
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${on ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm truncate ${on ? 'text-primary font-semibold' : 'text-foreground font-medium'}`}>{it.title}</span>
                      {it.subtitle && <span className="block text-xs text-muted-foreground truncate">{it.subtitle}</span>}
                    </span>
                    {on && <CornerDownLeft className="w-3.5 h-3.5 text-primary/70 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No screen matches “{q}”.</p>}
        </div>
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[11px] text-muted-foreground/70">
          <span><kbd className="font-sans px-1.5 py-0.5 rounded border border-border bg-muted/50">↑</kbd> <kbd className="font-sans px-1.5 py-0.5 rounded border border-border bg-muted/50">↓</kbd> move</span>
          <span><kbd className="font-sans px-1.5 py-0.5 rounded border border-border bg-muted/50">Enter</kbd> open</span>
          <span><kbd className="font-sans px-1.5 py-0.5 rounded border border-border bg-muted/50">Esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
