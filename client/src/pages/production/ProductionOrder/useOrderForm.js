// Production Order: the form's state and its server calls. The order is plain data ({ material, qty, ... }); the
// server answers what a choice changes (other fields, lists, which parts show) and keeps the screen's rules on save.
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ordersApi } from './ordersApi.js';

/** the choices the server reacts to (it refills other lists or fields) */
const DEPENDENT = ['material', 'orderType', 'salesOrder'];

/** the screen's alerts come with their commas encoded, as the original page wrote them */
const alertText = (m) => String(m ?? '').replaceAll('&#44', ',');

/** what can be checked before the round trip; the server checks again (and everything else) */
function check(order) {
  const errors = {};
  for (const f of ['department', 'status', 'qty']) if (String(order[f] ?? '').trim() === '') errors[f] = 'Required';
  if (!errors.qty && !/^-?\d+(\.\d+)?$/.test(String(order.qty).trim())) errors.qty = 'Enter a number';
  return errors;
}

/** a key for this form's create (crypto.randomUUID needs https or localhost; the plant may open the app over http) */
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** prodNo: a saved order to open (read-only: an order cannot be changed once created), or null for a new one */
export function useOrderForm(prodNo) {
  const [form, setForm] = useState(null); // { order, options, ui }
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null); // null | 'change' | 'save'
  const saved = useRef(''); // the order as loaded, to tell unsaved changes
  const latest = useRef(null); // the order as typed so far (an answer may arrive after more typing)
  const changeSeq = useRef(0); // only the newest change's answer is applied
  const createKey = useRef(newKey()); // the same for every attempt from this form: never two orders

  useEffect(() => {
    let live = true;
    (prodNo ? ordersApi.get(prodNo) : ordersApi.blank())
      .then((r) => {
        if (!live) return;
        saved.current = JSON.stringify(r.order);
        latest.current = r.order;
        setForm(r);
      })
      .catch((e) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [prodNo]);

  const setOrder = (order) => {
    latest.current = order;
    setForm((f) => ({ ...f, order }));
  };

  async function runChange(field, order) {
    const n = ++changeSeq.current;
    setBusy('change');
    try {
      const p = await ordersApi.change(field, order);
      if (n !== changeSeq.current) return; // a later choice was made meanwhile: its answer wins
      const next = { ...latest.current, ...p.order };
      latest.current = next;
      setForm((f) => ({ ...f, order: next, options: { ...f.options, ...p.options }, ui: { ...f.ui, ...p.ui } }));
      if (p.message) toast.error(alertText(p.message), { id: p.message });
    } catch (e) {
      if (n === changeSeq.current) toast.error(e.message, { id: e.message });
    } finally {
      if (n === changeSeq.current) setBusy(null);
    }
  }

  function setField(field, value) {
    const order = { ...latest.current, [field]: value };
    setOrder(order);
    setErrors(({ [field]: _, ...rest }) => rest);
    if (DEPENDENT.includes(field)) runChange(field, order);
  }

  /** Creates the order; resolves to the server's answer, or null when it was refused (the reasons are shown) */
  async function save() {
    if (prodNo || busy) return null; // a saved order is not changed; one save at a time, never while a choice is pending
    const order = latest.current;
    const found = check(order);
    if (Object.keys(found).length) {
      setErrors(found);
      return null;
    }
    setBusy('save');
    try {
      const r = await ordersApi.create(order, createKey.current);
      saved.current = JSON.stringify(order);
      return r;
    } catch (e) {
      if (e.errors) setErrors(e.errors);
      toast.error(alertText(e.alert ?? e.message), { id: e.message, duration: 6000 });
      return null;
    } finally {
      setBusy(null);
    }
  }

  const dirty = !!form && JSON.stringify(form.order) !== saved.current;
  return { form, loadError, errors, busy, dirty, setField, save };
}
