import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Light / dark / system appearance. The choice is kept on this device (localStorage) and applied
 * as the `dark` class on <html>. index.html applies it before the first paint, so pages do not
 * flash white. The sign-in pages keep their own photo design and are always light.
 */
export const THEME_KEY = 'garuda.theme';
export const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const listeners = new Set();
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readChoice() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}
let choice = readChoice();
const notify = () => listeners.forEach((l) => l());

function subscribe(listener) {
  listeners.add(listener);
  const onMedia = () => listener();
  // Another tab changed the choice.
  const onStorage = (e) => {
    if (e.key === THEME_KEY) {
      choice = readChoice();
      notify();
    }
  };
  media?.addEventListener('change', onMedia);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener('change', onMedia);
    window.removeEventListener('storage', onStorage);
  };
}

const resolve = (c) => (c === 'system' ? (media?.matches ? 'dark' : 'light') : c);
const snapshot = () => `${choice}:${resolve(choice)}`;

/** [choice, setChoice, resolved ('light' | 'dark')] */
export function useTheme() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => 'system:light');
  const [current, resolved] = snap.split(':');
  const setChoice = useCallback((next) => {
    choice = next;
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage blocked: the choice lasts until the page is reloaded */
    }
    notify();
  }, []);
  return [current, setChoice, resolved];
}

/** Applies the theme to <html> while mounted (the signed-in app); removes it when left (sign-in pages). */
export function useApplyTheme() {
  const [, , resolved] = useTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0a111d' : '#1d4ed8');
    return () => root.classList.remove('dark');
  }, [resolved]);
}
