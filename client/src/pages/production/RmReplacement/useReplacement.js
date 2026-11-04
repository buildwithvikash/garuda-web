// RM Replacement: the screen's state and server calls. Three steps: the unit, the component to replace, the new one.
// Scans run one at a time, in order, so a fast scanner never overtakes the answer it depends on.
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { replacementsApi } from './replacementsApi.js';

const EMPTY = { unit: '', unitLocked: false, components: [], existing: '', existingLocked: false, replacement: '' };

const FORMAT_REFUSED = /serial format of this material/;

/** a key for one replacement (crypto.randomUUID needs https or localhost; the plant may open the app over http) */
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** why a component of the list cannot be chosen, if so (the server checks it again at the replacement) */
export function choiceProblem(components, serial) {
  const c = components.find((x) => x.serial.trim() === serial);
  if (!c) return 'Serial No not found';
  return c.replaceable ? null : 'Only raw material can be replaced';
}

const refuse = (message) => toast.error(message, { id: message, duration: 6000 });

export function useReplacement() {
  const [state, setState] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const latest = useRef(EMPTY); // the screen as it is now, for a scan waiting its turn
  const queue = useRef(Promise.resolve());
  const key = useRef(newKey()); // the same for every attempt of one replacement; a new one after it succeeds

  const patch = (p) => {
    latest.current = { ...latest.current, ...p };
    setState(latest.current);
  };
  /** one scan after another; errors are shown here */
  const inTurn = (step) => {
    queue.current = queue.current.then(async () => {
      setBusy(true);
      try {
        await step();
      } finally {
        setBusy(false);
      }
    });
    return queue.current;
  };

  const scanUnit = () =>
    inTurn(async () => {
      const serial = latest.current.unit.trim();
      if (serial === '' || latest.current.unitLocked) return;
      try {
        const r = await replacementsApi.unit(serial);
        patch({ unit: r.serial, unitLocked: true, components: r.components });
      } catch (e) {
        refuse(e.message);
        patch({ ...EMPTY });
      }
    });
  const clearUnit = () => inTurn(async () => patch({ ...EMPTY }));

  /** a scanned serial, or a row picked from the list */
  const chooseExisting = (picked) =>
    inTurn(async () => {
      const s = latest.current;
      if (!s.unitLocked || s.existingLocked) return;
      const serial = String(picked ?? s.existing).trim();
      if (serial === '') return;
      const problem = choiceProblem(s.components, serial);
      if (problem) return void refuse(problem);
      patch({ existing: serial, existingLocked: true, replacement: '' });
    });
  const clearExisting = () => inTurn(async () => patch({ existing: '', existingLocked: false, replacement: '' }));

  const replace = () =>
    inTurn(async () => {
      const { unit, existing, existingLocked, replacement } = latest.current;
      if (!existingLocked || replacement.trim() === '') return;
      try {
        const r = await replacementsApi.replace({ unit, existing, replacement: replacement.trim() }, key.current);
        key.current = newKey();
        toast.success(`${r.message}: ${existing} to ${replacement.trim()}`);
        patch({ components: r.components, existing: '', existingLocked: false, replacement: '' });
      } catch (e) {
        refuse(e.message);
        // a new serial of the wrong format stays in its box to be seen; any other refused one is scanned again
        if (!FORMAT_REFUSED.test(e.message)) patch({ replacement: '' });
      }
    });

  return { ...state, busy, change: (field, value) => patch({ [field]: value }), scanUnit, clearUnit, chooseExisting, clearExisting, replace };
}
