// Production Assignment: the screen's state and server calls. Every choice the server reacts to comes back as the
// whole screen (its lists, what is left to assign, the routing and BOM lines); Print sends the choices once.
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { assignmentsApi } from './assignmentsApi.js';

/** the choices the server reacts to (it refills the lists after them) */
const DEPENDENT = ['department', 'order', 'routing', 'process', 'station'];

/** the screen's messages come with their commas encoded, as the original page wrote them */
const alertText = (m) => String(m ?? '').replaceAll('&#44', ',').trim();

/** a key for one print (crypto.randomUUID needs https or localhost; the plant may open the app over http) */
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** what can be checked before the round trip (the server checks all of it again, and more) */
function check(a) {
  const errors = {};
  for (const [f, m] of [['department', 'Select a department'], ['order', 'Select an order'], ['routing', 'Select a routing'], ['process', 'Select a process'], ['station', 'Select a station'], ['printer', 'Select a printer']])
    if (!a[f]) errors[f] = m;
  const qty = Number(a.qty);
  if (String(a.qty ?? '').trim() === '' || !Number.isFinite(qty) || qty <= 0) errors.qty = 'Enter a positive quantity';
  return errors;
}

export function useAssignment() {
  const [screen, setScreen] = useState(null); // { assignment, options, ui, details, left }
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null); // null | 'change' | 'print'
  const latest = useRef(null); // the choices as made so far (an answer may arrive after more input)
  const changeSeq = useRef(0); // only the newest change's answer is applied
  const printKey = useRef(newKey()); // the same for every attempt of one print; a new one after it succeeds

  useEffect(() => {
    let live = true;
    assignmentsApi
      .blank()
      .then((r) => {
        if (!live) return;
        latest.current = r.assignment;
        setScreen(r);
        if (r.message) toast.error(alertText(r.message), { id: r.message, duration: 6000 });
      })
      .catch((e) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, []);

  /** the server's screen, with what the user typed or picked while it was answering kept on top */
  function apply(r, sent) {
    const typed = Object.fromEntries(Object.entries(latest.current).filter(([f, v]) => v !== sent[f] && !DEPENDENT.includes(f)));
    const assignment = { ...r.assignment, ...typed };
    latest.current = assignment;
    setScreen({ assignment, options: r.options, ui: r.ui, details: r.details, left: r.left });
    // a field the server filled in is no longer missing
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([f]) => !assignment[f])));
  }

  async function runChange(field, sent) {
    const n = ++changeSeq.current;
    setBusy('change');
    try {
      const r = await assignmentsApi.change(field, sent);
      if (n !== changeSeq.current) return; // a later choice was made meanwhile: its answer wins
      apply(r, sent);
      if (r.message) toast.error(alertText(r.message), { id: r.message });
    } catch (e) {
      if (n === changeSeq.current) toast.error(alertText(e.message), { id: e.message });
    } finally {
      if (n === changeSeq.current) setBusy(null);
    }
  }

  function setField(field, value) {
    const assignment = { ...latest.current, [field]: value };
    latest.current = assignment;
    setScreen((s) => ({ ...s, assignment }));
    setErrors(({ [field]: _, ...rest }) => rest);
    if (DEPENDENT.includes(field)) runChange(field, assignment);
  }

  /** prints the job cards; true when they were printed */
  async function print() {
    if (busy) return false; // one print at a time, never while a choice is still being answered
    const sent = latest.current;
    const found = check(sent);
    if (Object.keys(found).length) {
      setErrors(found);
      return false;
    }
    setBusy('print');
    try {
      const r = await assignmentsApi.print(sent, printKey.current);
      printKey.current = newKey(); // printed: the next print is a new one
      apply(r, sent);
      toast.success(alertText(r.message) || 'Job cards printed.');
      for (const a of r.alerts ?? []) toast(alertText(a), { icon: '⚠️', duration: 6000 });
      return true;
    } catch (e) {
      toast.error(alertText(e.message), { id: e.message, duration: 6000 });
      // a print can stop part way (the printer went offline after some pieces): the pieces already done stay, so what
      // is left at the stage is read again before anyone prints the rest
      if (sent.process) {
        try {
          apply(await assignmentsApi.change('process', sent), sent);
        } catch {
          /* the error above is what the user needs to see */
        }
      }
      return false;
    } finally {
      setBusy(null);
    }
  }

  // an order and a quantity ready and not printed yet: closing the tab asks first (after a print the quantity is cleared)
  const unsaved = !!screen?.assignment?.order && String(screen.assignment.qty ?? '') !== '' && busy !== 'print';
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  return { screen, loadError, errors, busy, setField, print };
}
