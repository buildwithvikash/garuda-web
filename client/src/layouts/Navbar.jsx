import { Factory, KeyRound, LogOut, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { THEMES, useTheme } from '../app/theme.js';
import logo from '../assets/logo.png';
import CommandPalette from './CommandPalette.jsx';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

/** Opens the palette on Ctrl/⌘ + K, or "/" when not typing in a field (as in QMAS). */
function useCommandPaletteHotkey(open) {
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        open();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
}

/** QMAS top bar: WRL green strip, logo and app name, screen search, theme switch, account menu. */
export default function Navbar({ me }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => setSearching(true), []);
  useCommandPaletteHotkey(openSearch);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const u = me.user;
  const where = [u.lineName, u.department && `Dept ${u.department}`].filter(Boolean).join(' · ') || 'No line selected';

  const signOut = async () => {
    setMenuOpen(false);
    await api('/auth/logout', { method: 'POST' });
    toast.success('Signed out');
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 bg-white h-16 flex items-center gap-3 px-4 border-b border-slate-200/80">
      <span className="bg-wrl absolute top-0 inset-x-0 h-[3px]" aria-hidden="true" />
      <Link to="/start" className="flex items-center gap-3 min-w-0">
        <img src={logo} alt="Western Refrigeration" className="h-10 w-auto" />
        <div className="hidden xl:block leading-tight">
          <div className="text-lg font-bold text-blue-800 tracking-wide">GARUDA</div>
          <div className="text-[11px] text-slate-400">Shop Floor Execution · Production to FG Label</div>
        </div>
      </Link>

      <button
        type="button"
        onClick={openSearch}
        className="hidden md:flex items-center gap-2.5 ml-6 w-full max-w-md px-3.5 py-2 rounded-lg border border-slate-200 bg-canvas text-sm text-slate-500 hover:bg-white hover:border-blue-300 transition-colors cursor-pointer"
      >
        <Search className="w-4 h-4" />
        <span className="flex-1 text-left">Go to a screen…</span>
        <kbd className="font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-slate-500">{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      <div className="ml-auto flex items-center">
        <button type="button" onClick={openSearch} aria-label="Search" className="md:hidden p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
          <Search className="w-5 h-5 text-slate-600" />
        </button>
        {u.lineName && (
          <span title={`Production line: ${u.lineName}`} className="mr-1 hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200">
            <Factory className="h-3.5 w-3.5" />
            {u.lineName}
          </span>
        )}
        <ThemeButton />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50 cursor-pointer"
          >
            <span className="w-10 h-10 bg-blue-800 rounded-full flex items-center justify-center text-sm font-semibold text-white">{initials(u.userName || u.userId)}</span>
            <span className="hidden lg:block text-left">
              <span className="block text-sm font-semibold text-slate-800">{u.userName || u.userId}</span>
              <span className="block text-xs text-slate-400">{where}</span>
            </span>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="animate-fadeIn absolute right-0 mt-2 w-72 z-50 card shadow-xl p-2">
                <div className="px-3 py-2 border-b border-slate-100 mb-1">
                  <div className="text-sm font-semibold text-slate-800">{u.userName || u.userId}</div>
                  <div className="text-xs text-slate-400">{u.userId}</div>
                  <div className="mt-1 text-xs text-slate-600">{where}</div>
                </div>
                <ThemeChoice />
                <Link role="menuitem" to="/authorization/changepasswordform" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                  <KeyRound className="w-4 h-4 text-slate-400" /> Change password
                </Link>
                <button role="menuitem" type="button" onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 cursor-pointer">
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {searching && <CommandPalette me={me} onClose={() => setSearching(false)} />}
    </header>
  );
}

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };

/** Quick switch between light and dark. */
function ThemeButton() {
  const [, setChoice, resolved] = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  const Icon = resolved === 'dark' ? Sun : Moon;
  return (
    <button type="button" onClick={() => setChoice(next)} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} className="p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
      <Icon className="w-5 h-5 text-slate-600" />
    </button>
  );
}

/** Light / Dark / System in the account menu. */
function ThemeChoice() {
  const [choice, setChoice] = useTheme();
  return (
    <div className="px-3 py-2">
      <p className="mb-1.5 text-[11px] font-medium text-slate-500">Appearance</p>
      <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
        {THEMES.map((t) => {
          const Icon = THEME_ICON[t.value];
          const on = choice === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChoice(t.value)}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${on ? 'bg-white text-blue-700 ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
