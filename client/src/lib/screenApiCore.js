// The translation between what a page works with (the screen engine's control IDs and patches) and a screen's REST
// API (field names: record / options / ui). Pure functions: the parity scripts run every --api case through these
// same functions (server/scripts/parity/api.js), so what the page sends and applies is what parity checked.
//   maps: { fields: { field: controlId }, names: { controlId: apiName }, events: { event: controlId }, grids: Set(controlId) }

/** the page's control values -> the API's record (fields only; other controls carry no value) */
export function toRecord(values, maps) {
  return Object.fromEntries(Object.entries(maps.fields).filter(([, id]) => id in values).map(([f, id]) => [f, values[id] ?? '']));
}

/** the event name the API knows a control's handler by */
export function eventOf(control, maps) {
  return Object.entries(maps.events).find(([, id]) => id === control)?.[0];
}

const controlOf = (maps) => {
  const byName = Object.fromEntries(Object.entries(maps.names).map(([id, n]) => [n, id]));
  return (n) => maps.fields[n] ?? byName[n] ?? n;
};

/** an API answer ({ record, options, ui, alert, ... }) -> the engine's { set: { controlId: patch }, alert, ... } */
export function toPatch(answer, maps) {
  const id = controlOf(maps);
  const set = {};
  const at = (n) => (set[id(n)] ??= {});
  for (const [f, x] of Object.entries(answer.record ?? {})) Object.assign(at(f), maps.grids.has(id(f)) && Array.isArray(x) ? { rows: x } : { value: x });
  for (const [f, o] of Object.entries(answer.options ?? {})) at(f).options = o;
  for (const [n, u] of Object.entries(answer.ui ?? {})) Object.assign(at(n), u);
  const { record: _r, options: _o, ui: _u, alert, ...rest } = answer;
  return { ...rest, set, ...(alert != null && { alert }) };
}

/** a saved record (GET /:key, /:key/copy) laid over the screen's layout: the form state the engine sends for it.
 *  The answer's ui covers every control (visible / enabled / read-only / text / refilled), so nothing of the
 *  layout's own state (its first-load code) is left behind. */
export function overlay(layout, answer, maps) {
  const controls = layout.controls.map((c0) => {
    if (!c0.id) return c0;
    const c = { ...c0 };
    const n = maps.names[c.id];
    const u = answer.ui?.[n];
    if (u) {
      c.visible = u.visible;
      c.enabled = u.enabled;
      if ('readOnly' in c0 || u.readOnly) c.readOnly = u.readOnly;
      if ('text' in u) c.text = u.text;
      if (u.refilled) c.refilled = true;
      else delete c.refilled;
    }
    if (n in (answer.record ?? {})) {
      if (maps.grids.has(c.id)) c.rows = answer.record[n];
      else c.value = answer.record[n];
    }
    if (answer.options?.[n]) c.options = answer.options[n];
    return c;
  });
  return { title: layout.title, controls, viewState: answer.viewState ?? {}, recordStatus: answer.status ?? null, statusMessage: answer.statusMessage ?? null };
}

/** the API's list page -> the engine's ({ columns: [{ name }], count }) */
export const listShape = (r) => ({ columns: r.columns.map((name) => ({ name })), rows: r.rows, keys: r.keys, count: r.total, page: r.page, pageSize: r.pageSize });

/** the maps from GET /layout (grids: the layout's GridView controls) */
export const mapsOf = (layout) => ({ ...layout.api, grids: new Set(layout.controls.filter((c) => c.type === 'GridView').map((c) => c.id)) });
