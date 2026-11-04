// Rework Confirmation: the screen's state and server calls: scan the unit, see it, confirm.
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { reworkApi } from './reworkApi.js';

const EMPTY = { box: '', unit: null, qty: '', rootCause: '', actionTaken: '', remark: '', status: '12', newAction: '0' };
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const refuse = (message) => toast.error(message, { id: message, duration: 6000 });

export function useRework({ options, department, opened }) {
  const [state, setState] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [checklist, setChecklist] = useState(null); // the panel's state while it is open
  const rows = useRef(null); // the checklist as it was left
  const key = useRef(newKey());

  const patch = (p) => setState((s) => ({ ...s, ...p }));
  const run = async (step) => {
    setBusy(true);
    try {
      await step();
    } finally {
      setBusy(false);
    }
  };

  const load = (serial) =>
    run(async () => {
      try {
        const unit = await reworkApi.unit(serial);
        rows.current = unit.checklist;
        patch({ box: unit.serial, unit, qty: unit.qty });
      } catch (e) {
        refuse(e.message);
        patch({ box: '' });
      }
    });
  const scan = () => load(state.box.trim());
  const clear = () => (setChecklist(null), setState(EMPTY));

  useEffect(() => {
    if (opened) load(opened);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const openChecklist = () =>
    run(async () => {
      try {
        setChecklist(await reworkApi.openChecklist(options.checklist, rows.current));
      } catch (e) {
        refuse(e.message);
      }
    });
  const checklistEvent = (name, next = checklist, arg, index) =>
    run(async () => {
      if (name === 'QC:close') {
        rows.current = next.rows;
        return setChecklist(null);
      }
      try {
        const r = await reworkApi.checklistEvent(name.replace(/^QC:/, ''), next, arg, index);
        setChecklist(r.state);
        if (r.alert) refuse(r.alert);
      } catch (e) {
        refuse(e.message);
      }
      return undefined;
    });

  const save = () =>
    run(async () => {
      try {
        const r = await reworkApi.confirm(
          { serial: state.unit?.serial ?? '', qty: state.qty, rootCause: state.rootCause, actionTaken: state.actionTaken, remark: state.remark, status: state.status, newAction: state.newAction, department },
          key.current,
        );
        key.current = newKey();
        toast.success(r.message);
        clear();
      } catch (e) {
        refuse(e.message); // nothing was confirmed: the screen stays as it is, to correct and save again
      }
    });

  return { ...state, busy, checklist, setChecklist, change: (field, value) => patch({ [field]: value ?? '' }), setStatus: (v) => patch({ status: v, newAction: '0' }), scan, clear, openChecklist, checklistEvent, save };
}
