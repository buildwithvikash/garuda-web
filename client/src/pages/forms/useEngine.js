// The live state of an engine screen and its postback: a control with code-behind (AutoPostBack, a page button, a
// grid command) sends the form and the page's ViewState to /forms/event; the returned patch is applied here. Shared by
// the generic RecordForm and the dedicated shop-floor screens, so both run the same server handlers.
import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../api.js';
import { applyPatch, panelState, uiOf, valuesOf } from './engineState.js';

export default function useEngine({ path, state, events, onDone, onListFilter, onResult, initialError }) {
  const [controls, setControls] = useState(state.controls);
  const [values, setValues] = useState(() => valuesOf(state));
  const [viewState, setViewState] = useState(state.viewState ?? {});
  const [buttonPatch, setButtonPatch] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? state.statusMessage ?? '');

  const report = (r) => {
    if (r.alert) setError(r.alert);
    else {
      setError('');
      if (r.success) toast.success(r.message && r.message !== '✔' ? r.message : 'Done');
    }
  };

  async function fire(control, next = values, arg, base = controls, index) {
    setBusy(true);
    try {
      const r = await api('/forms/event', { method: 'POST', body: { path, control, values: next, viewState, arg, index, ui: uiOf(base) } });
      const p = applyPatch(base, next, r.set);
      setControls(p.controls);
      setValues(p.values);
      setViewState(r.viewState ?? viewState);
      if (r.redirect) return void window.location.assign(r.redirect);
      if (r.list) onListFilter?.(r.list);
      if (r.buttons) setButtonPatch((b) => ({ ...b, ...r.buttons }));
      // FooterControl's Save succeeded: the form starts again
      if (r.reset && onDone) return void onDone(r.alert ? { ok: false, text: r.alert } : { ok: true, text: r.message || 'Saved' });
      onResult ? onResult(r, control) : report(r);
      return r;
    } catch (e) {
      setError(e.message);
      onResult?.({ alert: e.message }, control);
    } finally {
      setBusy(false);
    }
  }
  function change(id, v) {
    const next = { ...values, [id]: v };
    setValues(next);
    if (events.includes(id)) fire(id, next);
  }
  // ComboBox: the picked row becomes the list's only item, then its handler (if the page wired one) runs
  const pick = (id) => (item) => {
    const ctl = controls.map((c) => (c.id === id ? { ...c, options: [item] } : c));
    const next = { ...values, [id]: item.value };
    setControls(ctl);
    setValues(next);
    if (events.includes(id)) fire(id, next, undefined, ctl);
  };

  const { shown, live } = panelState(controls);
  const byId = new Map(controls.filter((c) => c.id).map((c) => [c.id, c]));
  /** the control as the page shows it (disabled when a panel above it is) */
  const ctl = (id) => (byId.has(id) ? live(byId.get(id)) : null);
  /** visible, with every panel above it */
  const vis = (id) => {
    const c = byId.get(id);
    return !!c && c.visible !== false && shown(c);
  };

  return { controls, setControls, values, setValues, viewState, buttonPatch, busy, setBusy, error, setError, report, fire, change, pick, shown, live, ctl, vis };
}
