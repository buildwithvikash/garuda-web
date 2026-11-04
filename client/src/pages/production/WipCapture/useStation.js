// WIP Capture: one station's screen. `view` is what the server last answered; `draft` is what the operator typed since.
// Calls go one at a time in the order they were made, each with the boxes as they were at that moment, so a fast
// scanner never races the answer before it. A scan box empties as soon as its scan is sent, ready for the next one; a box
// typed into while an answer is coming keeps what was typed.
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { wipApi } from './wipApi.js';

const QC = ['status', 'nextAction', 'defectCategory', 'defectCode', 'inspectedQty', 'bee', 'printer', 'fgSerial', 'assetTag', 'greenTag', 'remark'];
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** opened: POST /sessions's answer; onAnswer(answer, action): each call's answer, in order */
export function useStation(opened, onAnswer) {
  const [view, setView] = useState(opened.station);
  const [draft, setDraftState] = useState({});
  const drafts = useRef({});
  const [running, setRunning] = useState(0);
  const [checklist, setChecklist] = useState(null); // the checklist as the operator is filling it
  const [tick, setTick] = useState(0); // answers so far: the unit's route and cabinet are read again after each
  const queue = useRef(Promise.resolve());
  const answered = useRef(onAnswer);
  useEffect(() => {
    answered.current = onAnswer;
  });

  const setDraft = (next) => {
    drafts.current = next;
    setDraftState(next);
  };
  const value = (name) => draft[name] ?? view.fields[name]?.value ?? '';
  const type = (name, v) => setDraft({ ...drafts.current, [name]: v });

  function send(action, method, path, { names = [], body, headers, scanBox } = {}) {
    const sent = Object.fromEntries(names.filter((n) => n in drafts.current).map((n) => [n, drafts.current[n]]));
    if (scanBox && scanBox in sent) setDraft({ ...drafts.current, [scanBox]: '' });
    setRunning((n) => n + 1);
    const job = queue.current.then(async () => {
      let r;
      try {
        r = await wipApi.call(opened.id, method, path, { ...sent, ...body }, headers);
      } catch (e) {
        r = { alert: e.message };
      }
      // the server lost this station (it restarted, or a shift went by): start the page afresh
      if (r.restarted) {
        toast.error(r.alert, { id: r.alert, duration: 6000 });
        setTimeout(() => window.location.reload(), 2500);
        return r;
      }
      if (r.station) {
        const left = { ...drafts.current };
        for (const [n, v] of Object.entries(sent)) if (left[n] === (n === scanBox ? '' : v)) delete left[n];
        setDraft(left);
        setView(r.station);
        setChecklist(null);
        setTick((t) => t + 1);
      }
      answered.current?.(r, action);
      return r;
    });
    queue.current = job.finally(() => setRunning((n) => n - 1));
    return job;
  }

  const qc = (action, path, opts = {}) => send(action, 'POST', `qc/${path}`, { names: QC, ...opts });
  /** a list that answers at once: the choice typed, then its call */
  const choose = (name, v, call) => {
    type(name, v);
    return call();
  };

  return {
    id: opened.id,
    view,
    value,
    type,
    tick,
    busy: running > 0,
    checklist: checklist ?? view.checklist,
    setChecklist,
    department: (v) => choose('department', v, () => send('department', 'POST', 'department', { names: ['department'] })),
    scanStation: () => send('station', 'POST', 'station', { names: ['station'] }),
    clearStation: () => send('station', 'DELETE', 'station'),
    scanUnit: () => send('unit', 'POST', 'unit', { names: ['serial', 'stationPrinter'], scanBox: 'serial' }),
    clearUnit: () => send('unit', 'DELETE', 'unit'),
    scanComponent: () => send('component', 'POST', 'inputs/scan', { names: ['component'], scanBox: 'component' }),
    consume: () => send('consume', 'POST', 'inputs/consume', { names: ['qty', 'uom'] }),
    closeInputs: () => send('closeInputs', 'DELETE', 'inputs'),
    status: (v) => choose('status', v, () => qc('status', 'status')),
    defectCategory: (v) => choose('defectCategory', v, () => qc('defectCategory', 'defect-category')),
    addDefect: () => qc('addDefect', 'defects'),
    removeDefect: (key, index) => qc('removeDefect', 'defects/remove', { body: { arg: key, index } }),
    openChecklist: () => qc('openChecklist', 'checklist'),
    /** a checklist event (QC:save, QC:goto ...) with its inputs as they stand */
    checklistEvent: (name, state = checklist ?? view.checklist, arg, index) =>
      send('checklist', 'POST', `qc/checklist/${encodeURIComponent(name.replace(/^QC:/, ''))}`, { body: { f: state?.f, arg, index } }),
    clearQC: () => send('clearQC', 'POST', 'qc/clear'),
    saveQC: () => qc('saveQC', 'save', { headers: { 'Idempotency-Key': newKey() } }),
    openGuide: () => send('guide', 'POST', 'guide'),
    guideFile: (v) => choose('guideFile', v, () => send('guideFile', 'POST', 'guide/file', { names: ['guideFile'] })),
    guideDocument: () => send('guideDocument', 'POST', 'guide/document'),
    closeGuide: () => send('closeGuide', 'DELETE', 'guide'),
  };
}
