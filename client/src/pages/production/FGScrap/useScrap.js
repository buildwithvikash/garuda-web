// FG Scrap: the screen's state and server calls: scan the unit, give the category and remark, save.
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { scrapsApi } from './scrapsApi.js';

const EMPTY = { unit: '', unitLocked: false, components: [], category: '', remark: '' };

/** a key for one scrap (crypto.randomUUID needs https or localhost; the plant may open the app over http) */
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const refuse = (message) => toast.error(message, { id: message, duration: 6000 });

export function useScrap() {
  const [state, setState] = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey()); // the same for every attempt of one scrap; a new one after it succeeds

  useEffect(() => {
    let live = true;
    scrapsApi.categories().then((c) => live && setCategories(c)).catch((e) => live && refuse(e.message));
    return () => {
      live = false;
    };
  }, []);

  const patch = (p) => setState((s) => ({ ...s, ...p }));
  const run = async (step) => {
    setBusy(true);
    try {
      await step();
    } finally {
      setBusy(false);
    }
  };

  const scanUnit = () =>
    run(async () => {
      const serial = state.unit.trim();
      if (serial === '') return;
      try {
        const r = await scrapsApi.unit(serial);
        patch({ unit: r.serial, unitLocked: true, components: r.components });
      } catch (e) {
        refuse(e.message);
        patch({ unit: '' });
      }
    });
  const clearUnit = () => (setErrors({}), setState(EMPTY));

  const save = () => {
    const problems = {};
    if (!state.category) problems.category = 'Choose a scrap category';
    if (state.remark.trim() === '') problems.remark = 'Please Enter Remark';
    setErrors(problems);
    if (Object.keys(problems).length) return undefined;
    return run(async () => {
      try {
        const r = await scrapsApi.scrap({ unit: state.unit, category: state.category, remark: state.remark.trim() }, key.current);
        key.current = newKey();
        toast.success(`${r.message}: ${r.serial}`);
        setState(EMPTY);
      } catch (e) {
        refuse(e.message); // nothing was scrapped: the screen stays as it is, to correct and save again
      }
    });
  };

  return { ...state, categories, errors, busy, change: (field, value) => patch({ [field]: value }), scanUnit, clearUnit, save };
}
