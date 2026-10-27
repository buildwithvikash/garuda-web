// Helpers used by several screens of quality (ported from the original pages' shared code).
import { setting, settingText } from '../../../settings/settings.service.js';
import { displayState } from '../../state.js';
import { udList, selfInspectionDetails } from '../../../quality/quality.service.js';
import { errorMsg } from '../_shared.js';
import { PAGE_EVENTS } from '../registry.js';

/** FooterControl.BtnSave_Click with the page's btnsaveHandler: save(values, helpers) -> { success, message, alert?, set?,
 *  viewState? }. Success: SuccessAlert and the form starts again (CallNewOnSave); otherwise ErrorAlert(Message). */
export function withFooter(file, save) {
  PAGE_EVENTS[file] ??= {};
  PAGE_EVENTS[file]['Footer:save'] = async (v, h) => {
    const r = await save(v, h);
    if (r.success) return { ...r, reset: true };
    // the page's own alert (if any), then the Footer's ErrorAlert(Message) - even an empty one
    const alerts = [...(r.alert !== undefined ? [r.alert] : []), errorMsg(r.message ?? '')];
    return { ...r, alert: alerts.find((a) => a !== '') ?? '', alerts };
  };
}

/** The page's own AU.Display(TopPanel, Get_DisplayData(...)) during an event: the record's values into the form's
 *  engine controls (lists refilled as Display does), as patches */
export async function displayPatch(spec, ctx, key) {
  const st = await displayState(spec, ctx, key);
  const set = {};
  for (const c of st.controls) {
    if (!c.id || c.page) continue;
    if (c.type === 'GridView') {
      if (c.table || c.childTable) set[c.id] = { rows: c.rows };
    } else if (c.type === 'Panel') {
      if (c.cond.trim() === '0') set[c.id] = { visible: true }; // AssignData shows the panels ClearForm hid
    } else if (c.table.trim() !== '') set[c.id] = c.type === 'DropDownList' ? { options: c.options, value: c.value } : { value: c.value };
  }
  return set;
}

/** NCMR's InitializeInspection(): the lot's details and checklist */
export async function ncmrInitialize(h, out, lot) {
  out.viewState.PendingQty = '0';
  if (lot === '') {
    Object.assign(out.set, { TBQty: { value: '' }, GridPanel: { visible: false }, OtherFields: { visible: false } });
    return;
  }
  Object.assign(out.set, { GridPanel: { visible: true }, OtherFields: { visible: true } });
  out.set.GVInspectionDetails = { rows: await selfInspectionDetails(lot) };
  out.set.QtyPanel = { visible: false };
  const ud = await udList(lot);
  out.viewState.UDDataTable = ud;
  out.set.BtnUD = { visible: ud.length > 0 };
}

export const ncmrClear = (out) => {
  Object.assign(out.set, { GridPanel: { visible: false }, ProcessGrid: { visible: false }, BtnUD: { visible: false }, OtherFields: { visible: false }, ConfirmationPanel: { visible: false }, TBBarcode: { value: '', enabled: true }, Go: { text: 'Go' } });
  Object.assign(out.viewState, { __Go: 'Go', __BarcodeEnabled: '1' });
};

// One page each for a rejected barcode's next action (2 repair, 3 finishing, 1 rework): scan, the inspection shown,
// the action confirmed. Repair and Rework save through their Footer, Finishing through TitleControl; Rework also asks
// for root cause / resolution (Settings.ReworkRootCause) and shows the job card's rework history.

export const settingOr = (name, fallback) => (settingText(name, null) === null ? fallback : setting(name));
