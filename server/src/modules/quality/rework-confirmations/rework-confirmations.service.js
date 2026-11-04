// Rework Confirmation (original View/Quality/ReworkConfirmationNew.aspx): a unit rejected to rework is scanned, its
// inspection shown, the rework confirmed. The browser sends the serial and what the operator entered; the inspection, its
// barcode and quantity come from the server's own lookup. The status and next action are checked but not stored, as the
// original (docs/PARITY-REPORT.md).
import { query } from '../../../db/pool.js';
import { AppError } from '../../../shared/AppError.js';
import { netDouble, netInt, netString } from '../../../shared/net.js';
import { listPage } from '../../forms/lists.js';
import { qcInitial, qcOpen, QC_EVENTS } from '../../forms/qc.js';
import { FORMS } from '../../forms/specs.js';
import { saveNewRRFConfirmation } from '../../production/wip.service.js';
import { reworkHistory, selfInspectionDetails, udData, validateBarcodeRRF, viewComponents } from '../quality.service.js';
import { setting, settingText } from '../../settings/settings.service.js';

export const SCREEN = '/quality/reworkconfirmationnew';

const APPROVED = '12';
const REWORK = 1;
const settingOr = (name, fallback) => (settingText(name, null) === null ? fallback : setting(name));
const choices = (rows) => rows.map((r) => ({ value: netString(r.v), label: netString(r.t) }));

export const STATUSES = [{ value: '12', label: 'Approved' }, { value: '13', label: 'Rejected' }];
export const NEW_ACTIONS = [{ value: '1', label: 'Re-Work' }, { value: '5', label: 'RTV' }, { value: '4', label: 'Scrap' }];
const NEXT_ACTION = { 1: 'Re-Work', 2: 'Repair', 3: 'Finishing', 4: 'Scrap' };

/** what the screen chooses from; the session's department, else the only one */
export async function options(ctx) {
  const [departments, rootCauses, actions] = await Promise.all([
    query("Select DeptCode v, CONCAT(Name, ' - ', Alias) t from Department where BusinessUnit=@bu", { bu: ctx.businessUnit }).then(choices),
    query('Select ID v, Type t From RootCause where status=1').then(choices),
    query('Select ID v, Type t From ReworkResolution where status=1').then(choices),
  ]);
  const own = netString(ctx.department);
  return {
    departments,
    department: departments.length === 1 ? departments[0].value : departments.some((d) => d.value === own) ? own : '',
    rootCauses,
    actions,
    showRootCause: settingOr('ReworkRootCause', 0) === 1,
    statuses: STATUSES,
    newActions: NEW_ACTIONS,
    checklist: await qcInitial(),
  };
}

/** a list row's unit, to scan it from the list */
export async function serialOf(id) {
  const [row] = await query('select mb.Serial from InspectionTrans i inner join MaterialBarcode mb on i.SampleBarcode=mb.BarcodeNo where i.ID=@id', { id });
  if (!row) throw AppError.notFound('Inspection');
  return netString(row.Serial);
}

/** the rejected unit's inspection, as the screen shows it */
export async function unit(serial) {
  const r = await validateBarcodeRRF(serial, REWORK);
  const [barcodeNo, unitSerial] = r.rtn.split('~');
  const [i] = await query('select t.Qty, t.Status, t.NextAction, t.InspectionLotNo, u.Name Uom from InspectionTrans t left join UnitOfMeasure u on t.Uom=u.UomCode where t.ID=@id', { id: r.id });
  const lot = netString(i?.InspectionLotNo);
  const [details, defects, history, components, checklist] = await Promise.all([
    lot === '' ? [] : selfInspectionDetails(lot),
    query('select d.Alias code, d.Name name, i.Defect defect from InspectionDefect i left join DefectCodeMaster d on i.Defect=d.Code where i.ID=@id', { id: r.id }),
    reworkHistory(unitSerial),
    viewComponents(unitSerial),
    lot === '' ? [] : udData(r.id, lot),
  ]);
  return {
    serial: unitSerial,
    barcodeNo,
    qty: lot === '' ? '' : Number(i?.Qty ?? 0).toFixed(3), // as the form showed it (decimal(18,3))
    uom: netString(i?.Uom),
    status: netString(STATUSES.find((s) => s.value === netString(i?.Status))?.label),
    nextAction: netString(NEXT_ACTION[netInt(i?.NextAction)]),
    hasInspection: lot !== '',
    details,
    defects: defects.map((d) => ({ defect: netString(d.defect), code: netString(d.code), name: netString(d.name) })),
    process: components.process,
    selfInspection: components.self,
    history,
    checklist,
  };
}

/** the checklist opened on its rows (the ones the screen kept, or the unit's) */
export async function openChecklist(state, rows) {
  const s = structuredClone(state);
  await qcOpen(s, structuredClone(rows));
  return s;
}

/** one of the checklist's buttons: the panel's state back, and what it has to say */
export async function checklistEvent(name, state, arg, index) {
  const fn = Object.hasOwn(QC_EVENTS, name) ? QC_EVENTS[name] : null;
  if (!fn) throw AppError.notFound('Checklist action');
  const s = structuredClone(state);
  s.bound = false;
  const r = await fn(s, arg, index);
  return { state: s, ...(r.alert ? { alert: r.alert } : {}) };
}

/** { serial, qty, rootCause, actionTaken, remark, status, newAction, department }: the checks in the original's order */
export async function confirm(b, ctx) {
  const r = await validateBarcodeRRF(b.serial, REWORK).catch(() => {
    throw AppError.badRequest('Please scan Right Barcode');
  });
  const [i] = await query('select Qty from InspectionTrans where ID=@id', { id: r.id });
  const [barcodeNo] = r.rtn.split('~');
  const inspected = netDouble(i?.Qty);
  const qty = netDouble(b.qty);
  if (qty === 0 || qty > inspected) throw AppError.badRequest('Wrong Qty');
  if (b.actionTaken === '0' || b.remark === '') throw AppError.badRequest('Please Enter Rework Action or Remarks');
  if (b.status === '0') throw AppError.badRequest('Please Select A Status');
  if (b.status !== APPROVED && b.newAction === '0') throw AppError.badRequest('Please Select Action');
  await saveNewRRFConfirmation(
    { id: r.id, barcode: barcodeNo, qty, aqty: inspected, rootCause: String(netInt(b.rootCause)), actionTaken: String(netInt(b.actionTaken)), remark: b.remark, selfApproval: settingOr('ReworkSelfApproval', 1) },
    { ...ctx, department: b.department },
  );
  return { message: 'Record Created Successfully', serial: b.serial };
}

// the list: the units waiting for rework in a department (no search on it, as the original: its Tag names no table)
const spec = (department, ctx) => ({
  ...FORMS[SCREEN],
  view: {
    ...FORMS[SCREEN].view,
    tag: `|ID| where mb.Department =${netInt(department ?? ctx.department)}|Select ID, mb.BarcodeNo,m.Alias[ItemCode],m.Name[Item],mb.CurrentQty,u.Alias[Unit]  from InspectionTrans i inner join MaterialBarcode mb on i.SampleBarcode=mb.BarcodeNo   inner join Material m on mb.Material=m.MatCode inner join UnitOfMeasure u on m.BaseUom=u.UomCode and  i.NextAction=1 and isnull(i.ERPStatus,0)=1`,
  },
});
export const list = (ctx, department, page, search) => listPage(spec(department, ctx), ctx, page, search);

