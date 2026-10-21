/**
 * Per-device view preferences (hidden columns, list filters, recent searches) in localStorage.
 * Conveniences only: storage may be unavailable or cleared, so every read has a fallback.
 */
const PREFIX = 'garuda:';

export function loadPref(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the preference is simply not remembered */
  }
}
