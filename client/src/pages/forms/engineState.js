// What the client keeps of an engine form and sends back with each server event.

/** control id -> value (GridViews: their rows) */
export const valuesOf = (state) => Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : c.value]));

/** The page as shown, which server page code reads back: Visible / Enabled / Text, plus the items of a page-filled
 *  list or of any list an event or the first load refilled (the server only knows the items the form was built with). */
export const uiOf = (controls) =>
  Object.fromEntries(
    controls
      .filter((c) => c.id)
      .map((c) => [c.id, { visible: c.visible !== false, enabled: c.enabled !== false, text: c.text ?? '', ...((c.page || c.refilled) && c.options ? { options: c.options } : {}) }]),
  );

/** Applies a server patch { id: { options?, index?, value?, rows?, visible?, text?, enabled?, maxLength?, guide? } }:
 *  options first, then SelectedIndex / SelectedValue. Returns the new controls and values. */
export function applyPatch(controls, values, patch = {}) {
  const ctl = controls.map((c) => {
    const p = patch[c.id];
    if (!p) return c;
    const next = { ...c };
    if (p.options) Object.assign(next, { options: p.options, refilled: true });
    for (const k of ['visible', 'text', 'enabled', 'maxLength']) if (k in p) next[k] = p[k];
    if (p.guide) next.guide = p.guide;
    return next;
  });
  const vals = { ...values };
  for (const c of ctl) if (c.type === 'FileUpload') vals[c.id] = null; // a postback clears a file input, as the browser did
  for (const [k, p] of Object.entries(patch)) {
    if ('index' in p) vals[k] = ctl.find((c) => c.id === k)?.options?.[p.index]?.value ?? '';
    if ('value' in p) vals[k] = p.value;
    if (p.rows) vals[k] = p.rows;
  }
  return { controls: ctl, values: vals };
}

/** Panel.Visible / Panel.Enabled = false hide / disable everything inside the panel. */
export function panelState(controls) {
  const byId = new Map(controls.filter((c) => c.id).map((c) => [c.id, c]));
  const up = (c, key) => {
    for (let p = c.parent; p; p = byId.get(p)?.parent) if (byId.get(p)?.[key] === false) return false;
    return true;
  };
  return { shown: (c) => up(c, 'visible'), live: (c) => (up(c, 'enabled') ? c : { ...c, enabled: false }) };
}
