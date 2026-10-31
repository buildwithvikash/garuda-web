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

/** the quantity's problem, if any: a whole number of pieces above zero, at most what is left at the process (each
 *  piece is one job card; the server checks it again) */
export function qtyProblem(qty, left) {
  const t = String(qty ?? '').trim();
  if (t === '') return 'Enter how many to start';
  if (!/^\d+$/.test(t)) return 'Enter a whole number of pieces';
  const n = Number(t);
  if (n <= 0) return 'Enter a quantity above zero';
  const max = Number(left);
  if (String(left ?? '').trim() !== '' && Number.isFinite(max) && n > max) return max > 0 ? `Only ${max} left to start at this process` : 'Nothing is left to start at this process';
  return null;
}

/** what can be checked before the round trip (the server checks all of it again, and more) */
function check(a, left) {
  const errors = {};
  for (const [f, m] of [['department', 'Select a department'], ['order', 'Select an order'], ['routing', 'Select a routing'], ['process', 'Select a process'], ['station', 'Select a station'], ['printer', 'Select a printer']])
    if (!a[f]) errors[f] = m;
  const q = qtyProblem(a.qty, a.process ? left : '');
  if (q) errors.qty = q;
  return errors;
}

export function useAssignment() {
  const [screen, setScreen] = useState(null); // { assignment, options, ui, details, left, started }
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null); // null | 'change' | 'print'
  const [lastPrint, setLastPrint] = useState(null); // { order, started, total, unit }: what the last print left the order at
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
    setScreen({ assignment, options: r.options, ui: r.ui, details: r.details, left: r.left, started: r.started });
    // a field the server filled in is no longer missing; the quantity is checked again against what is left now
    const q = String(assignment.qty ?? '').trim() === '' ? null : qtyProblem(assignment.qty, assignment.process ? r.left : '');
    setErrors((e) => ({ ...Object.fromEntries(Object.entries(e).filter(([f]) => !assignment[f] && f !== 'qty')), ...(q ? { qty: q } : {}) }));
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
    // the quantity is checked as it is typed (against what is left at the chosen process)
    if (field === 'qty') {
      const q = String(value ?? '').trim() === '' ? null : qtyProblem(value, assignment.process ? screen?.left : '');
      if (q) setErrors((e) => ({ ...e, qty: q }));
    }
    if (DEPENDENT.includes(field)) runChange(field, assignment);
  }

  /** prints the job cards; true when they were printed */
  async function print() {
    if (busy) return false; // one print at a time, never while a choice is still being answered
    const sent = latest.current;
    const found = check(sent, screen?.left);
    if (Object.keys(found).length) {
      setErrors(found);
      return false;
    }
    setBusy('print');
    try {
      const r = await assignmentsApi.print(sent, printKey.current);
      printKey.current = newKey(); // printed: the next print is a new one
      apply(r, sent);
      // the order is printed in full (it left the list): a clean screen for the next one, the department and printer kept
      if (!r.assignment.order) {
        const fresh = await assignmentsApi.change('department', { department: sent.department, printer: sent.printer }).catch(() => null);
        if (fresh) {
          latest.current = fresh.assignment;
          setScreen({ assignment: fresh.assignment, options: fresh.options, ui: fresh.ui, details: fresh.details, left: fresh.left, started: fresh.started });
        }
      }
      // what the order stands at now (the screen may have cleared it once nothing is left)
      if (r.printed) setLastPrint({ order: r.printed.order, orderName: (screen.options.order ?? []).find((o) => o.value === r.printed.order)?.text ?? r.printed.order, started: r.printed.started, total: sent.totalQty });
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

  return { screen, loadError, errors, busy, lastPrint, setField, print };
}
