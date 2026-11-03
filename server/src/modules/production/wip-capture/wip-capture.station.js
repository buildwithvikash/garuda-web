// WIP Capture's station: what the server keeps for one opened screen (scanned station, its process, the scanned unit,
// the scan's result, QC lot, checklist) and what the screen is told about it. Nothing here comes back from the browser
// except what the operator typed, and only into a box the screen is showing open (docs/WIP-CAPTURE-PLAN.md).
//
// Kept in this process's memory (the server runs as one process) for a shift. Each opened screen has its own (two tabs,
// two stations); a refresh opens a new one, as the original's page load did; after a restart the next call finds nothing
// and the screen starts afresh.
import { randomUUID } from 'node:crypto';
import { netInt, netString } from '../../../shared/net.js';

const TTL = 12 * 60 * 60 * 1000; // a shift (owner, 31 Oct 2026)
const MAX = 1000; // stations kept at most; the least recently used go first
const store = new Map(); // id -> station

function prune(now) {
  for (const [id, s] of store) if (now - s.at > TTL) store.delete(id);
  while (store.size > MAX) store.delete(store.keys().next().value);
}

/** a new station from the screen's first state ({ controls, viewState }); its controls are its own copy */
export function start(user, first, now = Date.now()) {
  prune(now);
  const controls = new Map(structuredClone(first.controls ?? []).filter((c) => c.id).map((c) => [c.id, c]));
  const values = Object.fromEntries([...controls.values()].map((c) => [c.id, c.type === 'GridView' ? c.rows : c.value]));
  const s = { id: randomUUID(), user, controls, values, viewState: first.viewState ?? {}, at: now, turn: Promise.resolve() };
  store.set(s.id, s);
  return s;
}

/** the station, if it is this user's and not a shift old */
export function find(user, id, now = Date.now()) {
  const s = store.get(id);
  if (!s || s.user !== user) return null;
  if (now - s.at > TTL) {
    store.delete(id);
    return null;
  }
  s.at = now;
  store.delete(id); // re-inserted last: the least recently used go first when the store is full
  store.set(id, s);
  return s;
}

/** one call at a time on a station, in the order they came: a fast scanner never races the answer before it */
export function inTurn(s, fn) {
  const run = s.turn.then(fn);
  s.turn = run.catch(() => {});
  return run;
}

const shown = (s, id) => {
  if (!s.controls.has(id)) return false;
  for (let c = s.controls.get(id); c; c = s.controls.get(c.parent)) if (c.visible === false) return false;
  return true;
};
const open = (s, id) => {
  for (let c = s.controls.get(id); c; c = s.controls.get(c.parent)) if (c.enabled === false) return false;
  return true;
};
const textOf = (s, id) => s.controls.get(id)?.text ?? '';

/** what the screen names the boxes the operator fills */
export const FIELDS = {
  department: 'DDLDepartment',
  stationPrinter: 'DDLStationPrinter',
  station: 'TBWorkStation',
  serial: 'TBJobCoard',
  component: 'TBINItemCode',
  qty: 'TBInQty',
  uom: 'ddlINUom',
  status: 'DDLWIPQCStatus',
  nextAction: 'DDLNextAction',
  defectCategory: 'DDLDefectCate',
  defectCode: 'DDLDefectCodes',
  inspectedQty: 'TBQty',
  bee: 'TbBEENo',
  printer: 'DDLQCPrinter',
  fgSerial: 'TbFGSerialNo',
  assetTag: 'TbASsetTag',
  greenTag: 'TBGreenTag',
  remark: 'TBWQCRemark',
  guideFile: 'LBGuideFiles',
};

const QC = ['status', 'nextAction', 'defectCategory', 'defectCode', 'inspectedQty', 'bee', 'printer', 'fgSerial', 'assetTag', 'greenTag', 'remark'];
const locked = (button) => (s) => textOf(s, button) === 'Clr';
const notLocked = (button) => (s) => textOf(s, button) !== 'Clr';
const inInputs = (s) => shown(s, 'InputMaterialPanel');
const inQC = (s) => shown(s, 'QCPanel');

/** what the operator can do: the page's handler it runs, the boxes it takes, when it applies (otherwise nothing happens:
 *  the screen offers it only then) */
export const ACTIONS = {
  department: { control: 'DDLDepartment', fields: ['department'] },
  station: { control: 'BtnWorkStationScan', fields: ['station'], when: notLocked('BtnWorkStationScan') },
  clearStation: { control: 'BtnWorkStationScan', when: locked('BtnWorkStationScan') },
  unit: { control: 'BtnWorderScan', fields: ['serial', 'stationPrinter'], when: notLocked('BtnWorderScan') },
  clearUnit: { control: 'BtnWorderScan', when: locked('BtnWorderScan') },
  component: { control: 'BtnINBarcode', fields: ['component'], when: inInputs },
  consume: { control: 'BtnInwardMaterial', fields: ['qty', 'uom'], when: inInputs },
  closeInputs: { control: 'BTNCloseInputMaterialPanel', when: inInputs },
  status: { control: 'DDLWIPQCStatus', fields: QC, when: inQC },
  defectCategory: { control: 'DDLDefectCate', fields: QC, when: inQC },
  addDefect: { control: 'btnAdd', fields: QC, when: inQC },
  removeDefect: { control: 'GVTransData:delete', fields: QC, when: inQC },
  openChecklist: { control: 'BtnUD', fields: QC, when: inQC },
  clearQC: { control: 'btnQCClear', when: inQC },
  saveQC: { control: 'btnQCSave', fields: QC, when: inQC },
  guide: { control: 'BtnGuide', when: locked('BtnWorkStationScan') },
  guideFile: { control: 'LBGuideFiles', fields: ['guideFile'], when: (s) => shown(s, 'RightTopPanel') },
  guideDocument: { control: 'BtnToggleGuide', when: (s) => shown(s, 'RightTopPanel') },
  closeGuide: { control: 'IMBGuideClose', when: (s) => shown(s, 'RightTopPanel') },
};

/** the boxes of an action as the operator filled them: only text, only boxes the screen shows open, only listed items
 *  (a generated tag, a locked status or a fixed department stays what the server has) */
export function takeFields(s, names = [], body = {}) {
  for (const name of names) {
    const id = FIELDS[name];
    const value = body[name];
    if (typeof value !== 'string' || value.length > 4000) continue;
    if (!shown(s, id) || !open(s, id)) continue;
    const options = s.controls.get(id).options;
    if (options?.length && !options.some((o) => String(o.value) === value)) continue;
    s.values[id] = value;
  }
}

/** the checklist's inputs as the operator filled them; its rows, position and tool are the server's */
export function takeChecklist(s, f) {
  const c = s.values.InspectionCheckList;
  if (!c?.f || !f || typeof f !== 'object') return;
  const text = (v, fallback) => (typeof v === 'string' ? v : fallback);
  c.f.TBValue.text = text(f.TBValue?.text, c.f.TBValue.text);
  c.f.TBBarcode.text = text(f.TBBarcode?.text, c.f.TBBarcode.text);
  for (const k of ['DDLUom', 'DDLList', 'DdlQCStatus']) c.f[k].value = text(f[k]?.value, c.f[k].value);
  for (const k of ['TBRemark', 'TBImage', 'Image']) c.f[k] = text(f[k], c.f[k]);
}

/** the page as the handlers read it back (Visible / Enabled / Text, the lists a load or an event filled) */
export const uiOf = (s) =>
  Object.fromEntries(
    [...s.controls.values()].map((c) => [c.id, { visible: c.visible !== false, enabled: c.enabled !== false, text: c.text ?? '', ...((c.page || c.refilled) && c.options ? { options: c.options } : {}) }]),
  );

/** the values as the handlers read them */
export const valuesOf = (s) => Object.fromEntries(Object.entries(s.values).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)]));

/** a handler's answer laid over the station (options first, then the item, value or rows it picks) */
export function applyAnswer(s, r) {
  for (const [id, p] of Object.entries(r?.set ?? {})) {
    if (!p || typeof p !== 'object') continue;
    const c = s.controls.get(id);
    if (c) {
      if (p.options) Object.assign(c, { options: p.options, refilled: true });
      for (const k of ['visible', 'text', 'enabled']) if (k in p) c[k] = p[k];
      if (p.guide) c.guide = p.guide;
    }
    if ('index' in p) s.values[id] = c?.options?.[p.index]?.value ?? '';
    if ('value' in p) s.values[id] = p.value;
    if (p.rows) s.values[id] = p.rows;
  }
  if (r?.viewState) s.viewState = r.viewState;
}

/** what a scan's result code means */
const RESULT = { 10: 'inputs', 11: 'started', 21: 'completed', 30: 'qc', 40: 'fg', 50: 'recorded' };

/** the scanned unit while it stays at the station ('' once the box is cleared for the next one) */
export const unitOf = (s) => (textOf(s, 'BtnWorderScan') === 'Clr' || shown(s, 'QCPanel') ? netString(s.values.TBJobCoard).trim() : '');

/** the screen: everything it draws, by what it means */
export function viewOf(s) {
  const field = (id) => {
    if (!shown(s, id)) return null;
    const { type, options, inputType, step, maxLength, required, readOnly } = s.controls.get(id);
    return { value: netString(s.values[id]), enabled: open(s, id), type, options: options ?? (type === 'DropDownList' ? [] : undefined), inputType, step, maxLength, required, readOnly };
  };
  const grid = (id) => ({ columns: s.controls.get(id).columns ?? [], keyName: s.controls.get(id).keyName, rows: s.values[id] ?? [] });
  const material = s.values.GVWQCMaterial?.[0];
  const files = s.controls.get('LBGuideFiles')?.options ?? [];
  const document = s.controls.get('GuideFileDisplayPanel')?.guide ?? null;
  return {
    line: textOf(s, 'lblLine'),
    fields: Object.fromEntries(Object.entries(FIELDS).map(([name, id]) => [name, field(id)])),
    station: { shown: shown(s, 'WorkStationPanel'), locked: textOf(s, 'BtnWorkStationScan') === 'Clr' },
    unit: { shown: shown(s, 'JobCardPanel'), locked: textOf(s, 'BtnWorderScan') === 'Clr', serial: unitOf(s), model: netString(s.values.tbFG).split('|')[0] },
    lastScanned: netString(s.viewState.LastScanned),
    result: RESULT[netInt(s.viewState.I)] ?? null,
    rework: shown(s, 'BtnRework'),
    components: shown(s, 'PnlComponents') ? (s.values.GVComponents ?? []) : [],
    inputs: shown(s, 'InputMaterialPanel') ? { canScan: shown(s, 'ScanINbarcodePanel'), askQty: shown(s, 'InQtyPanel'), rows: s.values.GVINMaterial ?? [] } : null,
    inspection: shown(s, 'QCPanel')
      ? {
          fg: netInt(s.viewState.I) === 40,
          open: shown(s, 'OtherFields'),
          material: material ? { description: netString(material.Description) } : null,
          canChecklist: shown(s, 'BtnUD'),
          defects: shown(s, 'PanelDefects') ? { ...grid('GVTransData'), canAdd: shown(s, 'btnAdd') } : null,
          canClear: shown(s, 'btnQCClear'),
          canSave: shown(s, 'btnQCSave'),
        }
      : null,
    checklist: shown(s, 'InspectionCheckList') ? (s.values.InspectionCheckList ?? null) : null,
    defectHistory: shown(s, 'DefectHistoryPanel') ? grid('GVDefectHistory') : null,
    guide: shown(s, 'RightTopPanel')
      ? {
          files,
          file: netString(s.values.LBGuideFiles),
          canShowDocument: !shown(s, 'RightTop') && !!document,
          instructions: shown(s, 'RightBottom') && s.values.GVInstruction?.length ? grid('GVInstruction') : null,
          document: shown(s, 'GuideFileDisplayPanel') ? document : null,
        }
      : null,
  };
}

/** for tests: forget every station */
export const _forgetAll = () => store.clear();
