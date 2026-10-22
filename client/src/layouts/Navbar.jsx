import {
  Factory,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Sun,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { THEMES, useTheme } from "../app/theme.js";
import logo from "../assets/logo.png";

const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("") || "?";

const THEME_ICON = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/** Professional GARUDA shop-floor application navbar. */
export default function Navbar({ me }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const u = me.user;
  const displayName = u.userName || u.userId;

  const where =
    [u.lineName, u.department && `Dept ${u.department}`]
      .filter(Boolean)
      .join(" · ") || "No line selected";

  const signOut = async () => {
    setMenuOpen(false);

    try {
      await api("/auth/logout", { method: "POST" });
      toast.success("Signed out");
      navigate("/login", { replace: true });
    } catch {
      toast.error("Unable to sign out. Please try again.");
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
      {/* Brand accent */}
      <div className="absolute inset-x-0 top-0 h-1 bg-wrl" aria-hidden="true" />

      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Application branding */}
        <Link
          to="/start"
          aria-label="GARUDA home"
          className="flex min-w-0 shrink-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <img
            src={logo}
            alt="Western Refrigeration"
            className="h-9 w-auto object-contain sm:h-10"
          />

          <span
            aria-hidden="true"
            className="hidden h-9 border-l border-slate-200 sm:block"
          />

          <span className="hidden min-w-0 xl:block">
            <span className="block text-lg font-extrabold leading-5 tracking-wide text-blue-900">
              GARUDA
            </span>

            <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-slate-500">
              SHOP FLOOR EXECUTION
            </span>
          </span>
        </Link>

        {/* Production line, theme and account controls */}
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          {/* Current production line */}
          {u.lineName && (
            <div
              title={`Production line: ${u.lineName}`}
              className="mr-1 hidden max-w-48 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800 sm:flex"
            >
              <Factory aria-hidden="true" className="h-4 w-4 shrink-0" />

              <span className="truncate text-xs font-semibold">
                {u.lineName}
              </span>
            </div>
          )}

          <span
            aria-hidden="true"
            className="mx-1 hidden h-8 border-l border-slate-200 sm:block"
          />

          {/* Light and dark theme toggle */}
          <ThemeButton />

          {/* User account dropdown */}
          <div className="relative ml-1">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Account menu for ${displayName}`}
              className="flex items-center gap-2 rounded-xl p-1.5 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:gap-3 sm:px-2 cursor-pointer"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-900 text-sm font-bold text-white ring-2 ring-blue-100">
                {initials(displayName)}
              </span>

              <span className="hidden min-w-0 text-left lg:block">
                <span className="block max-w-40 truncate text-sm font-semibold text-slate-800">
                  {displayName}
                </span>
              </span>

              <ChevronDown
                aria-hidden="true"
                className={`hidden h-4 w-4 text-slate-400 transition-transform duration-200 lg:block ${
                  menuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {menuOpen && (
              <>
                {/* Close menu when clicking outside */}
                <button
                  type="button"
                  aria-label="Close account menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />

                <div
                  role="menu"
                  aria-label="Account options"
                  className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xl cursor-pointer"
                >
                  {/* Account details */}
                  <div className="border-b border-slate-100 px-3 py-3">
                    <div className="truncate text-sm font-semibold text-slate-800">
                      {displayName}
                    </div>

                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {u.userId}
                    </div>
                  </div>

                  {/* Appearance preferences */}
                  <ThemeChoice />

                  <div className="my-1 border-t border-slate-100" />

                  {/* Change password */}
                  <Link
                    role="menuitem"
                    to="/authorization/changepasswordform"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <KeyRound
                      aria-hidden="true"
                      className="h-4 w-4 text-slate-500"
                    />
                    Change password
                  </Link>

                  {/* Sign out */}
                  <button
                    role="menuitem"
                    type="button"
                    onClick={signOut}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-rose-600 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 cursor-pointer"
                  >
                    <LogOut aria-hidden="true" className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/** Quick switch between light and dark themes. */
function ThemeButton() {
  const [, setChoice, resolved] = useTheme();

  const next = resolved === "dark" ? "light" : "dark";
  const Icon = resolved === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => setChoice(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="rounded-xl p-2.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
    >
      <Icon aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}

/** Light, dark and system theme choices. */
function ThemeChoice() {
  const [choice, setChoice] = useTheme();

  return (
    <div className="px-2 py-3">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Appearance
      </p>

      <div
        role="radiogroup"
        aria-label="Appearance"
        className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1"
      >
        {THEMES.map((theme) => {
          const Icon = THEME_ICON[theme.value];
          const selected = choice === theme.value;

          return (
            <button
              key={theme.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(theme.value)}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer ${
                selected
                  ? "bg-white text-blue-800 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
              }`}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />

              {theme.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
