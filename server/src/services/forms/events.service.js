// Running a screen's own handlers (pages.service.js PAGE_EVENTS) from a domain service: one control's handler on
// the current values, its patch applied the way the browser applied it (options first, then index / value / rows),
// the ViewState carried along. Domain services replay the user's choices with it, so the server builds what gets
// saved (lists, grids, quantities left) instead of trusting what a browser sends.
import { PAGE_EVENTS, PAGE_LOAD, eventHelpers } from './pages.service.js';
import { newFormState } from './state.service.js';
import { netString } from '../../shared/utils/net.js';

/** A new form as the screen opens it: the engine's state, then the page's own first load (as /forms/spec does).
 *  { state, alert } */
export async function openForm(spec, ctx) {
  const state = await newFormState(spec, ctx);
  const loaded = await PAGE_LOAD[spec.file]?.(state.controls, ctx, (state.viewState ??= {}));
  return { state, alert: loaded?.alert ?? null };
}

/** a screen's form as the services carry it: control values, the dropdowns' items, its ViewState */
export const formOf = (state) => ({
  values: Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : c.value])),
  options: Object.fromEntries(state.controls.filter((c) => c.id && c.options).map((c) => [c.id, c.options])),
  visible: Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.visible !== false])),
  enabled: Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.enabled !== false])),
  viewState: { ...(state.viewState ?? {}) },
});

/** a handler's patch applied to a form (returns a new form) */
export function applyPatch(form, set = {}) {
  const f = { values: { ...form.values }, options: { ...form.options }, visible: { ...form.visible }, enabled: { ...form.enabled }, viewState: form.viewState };
  for (const [id, p] of Object.entries(set)) {
    if (p.options) f.options[id] = p.options;
    if ('index' in p) f.values[id] = netString((f.options[id] ?? [])[p.index]?.value);
    if ('value' in p) f.values[id] = netString(p.value);
    if (p.rows) f.values[id] = p.rows;
    if ('visible' in p) f.visible[id] = p.visible;
    if ('enabled' in p) f.enabled[id] = p.enabled;
  }
  return f;
}

/** Runs the handler of one control on the form: { form (after its patch and ViewState), result (as returned) } */
export async function runEvent(spec, ctx, control, form, extra = {}) {
  const handler = PAGE_EVENTS[spec.file]?.[control];
  if (!handler) throw new Error(`No handler for ${control}`);
  const ui = Object.fromEntries(Object.keys(form.values).map((id) => [id, { visible: form.visible[id] !== false, enabled: form.enabled[id] !== false, ...(form.options[id] ? { options: form.options[id] } : {}) }]));
  const h = { ...eventHelpers(spec, ctx, form.values, { viewState: form.viewState, ui, ...extra }), raw: form.values };
  const result = await handler(form.values, h);
  const next = applyPatch(form, result.set);
  next.viewState = result.viewState ?? form.viewState;
  return { form: next, result };
}
