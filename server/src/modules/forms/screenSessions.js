// Screens whose page state the server keeps (WIP Capture): the ported page code reads its ViewState (the scanned
// station, its process, the scan's result ...) and the page as shown (a button's "Clr", a panel's visibility) back on
// every event. For these screens they are kept here, one copy per browser tab, and never taken from a request, so a
// request cannot claim a station that was not scanned (docs/WIP-CAPTURE-PLAN.md, step 1).
//
// Kept in this process's memory (the server runs as one process) for a shift. A page load (/forms/spec) starts the
// tab afresh, as the original's did; after a server restart the tab's next event finds nothing and starts afresh too.

export const SERVER_STATE = new Set(['/production/wipcaptureform']);

const TTL = 12 * 60 * 60 * 1000; // a shift (owner, 31 Oct 2026)
const MAX = 5000; // tabs kept at most; the oldest go first
const store = new Map(); // `${user}|${path}|${tab}` -> { viewState, ui, at }

/** a tab's id as the browser sends it (random, kept in the tab's sessionStorage); null when it is not one */
export const tabOf = (v) => (typeof v === 'string' && /^[A-Za-z0-9-]{8,100}$/.test(v) ? v : null);
const keyOf = (user, path, tab) => `${user ?? ''}|${path}|${tab}`;

function prune(now) {
  for (const [k, s] of store) if (now - s.at > TTL) store.delete(k);
  while (store.size > MAX) store.delete(store.keys().next().value);
}

/** The page as the browser shows it after the first load, as the page code reads it back (the client's uiOf):
 *  Visible / Enabled / Text, and the items of a page-filled list or of a list the first load refilled. */
export const uiOf = (controls) =>
  Object.fromEntries(
    controls
      .filter((c) => c.id)
      .map((c) => [c.id, { visible: c.visible !== false, enabled: c.enabled !== false, text: c.text ?? '', ...((c.page || c.refilled) && c.options ? { options: c.options } : {}) }]),
  );

/** an event's answer laid over the kept page: its control changes (as the client's applyPatch) and its ViewState */
export function applyAnswer(state, r) {
  const ui = { ...state.ui };
  for (const [id, p] of Object.entries(r?.set ?? {})) {
    if (!p || typeof p !== 'object') continue;
    const next = { ...(ui[id] ?? { visible: true, enabled: true, text: '' }) };
    for (const k of ['visible', 'enabled', 'text']) if (k in p) next[k] = p[k];
    if (p.options) next.options = p.options;
    ui[id] = next;
  }
  return { viewState: r?.viewState ?? state.viewState, ui, at: Date.now() };
}

/** the tab starts afresh from the screen's first state ({ controls, viewState } as /forms/spec answers it) */
export function start(user, path, tab, first, now = Date.now()) {
  prune(now);
  const s = { viewState: first.viewState ?? {}, ui: uiOf(first.controls ?? []), at: now };
  store.set(keyOf(user, path, tab), s);
  return s;
}

/** the tab's kept state; null when there is none (never started, a shift old, or the server restarted) */
export function stateOf(user, path, tab, now = Date.now()) {
  const k = keyOf(user, path, tab);
  const s = store.get(k);
  if (!s) return null;
  if (now - s.at > TTL) {
    store.delete(k);
    return null;
  }
  return s;
}

/** keeps the tab's state after an event */
export function save(user, path, tab, state) {
  store.delete(keyOf(user, path, tab)); // re-inserted last: the oldest go first when the store is full
  store.set(keyOf(user, path, tab), state);
}

/** for tests: forget every tab */
export const _forgetAll = () => store.clear();
