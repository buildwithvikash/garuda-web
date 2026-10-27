// FID - Self Inspection (View/CEAT/CEATINSelfInspectionForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { query } from '../../../../db/pool.js';
import { netString, netInt, netDouble, netNum, netBool, exceptionAlert } from '../../../../shared/net.js';
import { cell as qcCell } from '../../qc.js';
import { STATUS, selfInspectionDetails, inspectionUom, isSerialLot, inspectionType, viewComponents, ceatSelfInspectionSave, udListBarcode, validateBarcodeSelfInspection, scadaCuringOk } from '../../../quality/quality.service.js';
import { alertMsg, errorMsg, gridDelete, guard, parseString, qiStatusChanged, select, selectedText, withQC } from '../_shared.js';
import { FINAL_QI } from '../quality/quality-inspection-form.js';
import { PAGE_EVENTS, PAGE_INIT, PAGE_LOAD, PAGE_SAVE } from '../registry.js';

// As QualityInspectionForm: no View / Update, so a saved inspection is never displayed again. ViewState: PendingQty,
// UDDataTable (the checklist), SCADAFLG (1: the curing defect was added for the tyre). The curing check reads CEAT's
// SCADACuringDetails, which WRL does not have: there Go ends with that SQL error (what it filled before stays).

const CEAT_SELF = 'View/CEAT/CEATINSelfInspectionForm.aspx';

PAGE_LOAD[CEAT_SELF] = PAGE_LOAD[FINAL_QI];

Object.assign(PAGE_INIT, {
  [CEAT_SELF]: async (controls, vs) => Object.assign(vs, { PendingQty: '0' }),
});

/** InitializeInspection(): the lot's details and UOM, a serial material's single piece, the status rule */
async function ceatInitialize(v, h, out, lot, qty) {
  out.viewState.PendingQty = '0';
  if (parseString(lot) === '') return void Object.assign(out.set, { TBQty: { value: '' }, GridPanel: { visible: false }, OtherFields: { visible: false } });
  Object.assign(out.set, { GridPanel: { visible: true }, OtherFields: { visible: true } });
  out.set.GVInspectionDetails = { rows: await selfInspectionDetails(lot) };
  await select(h, out, 'DDLUom', await inspectionUom(lot));
  out.viewState.PendingQty = qty;
  out.set.TBQty = { ...out.set.TBQty, enabled: true };
  out.set.BarcodePanel = { visible: false };
  let shown = qty;
  if (await isSerialLot(lot)) {
    out.set.BarcodePanel = { visible: true };
    await select(h, out, 'DDLUom', await inspectionUom(lot));
    out.set.TBQty = { value: '1', enabled: false };
    out.viewState.PendingQty = '1';
    shown = '1';
  }
  out.set.QtyPanel = { visible: shown !== '1' };
  await inspectionType(lot);
  await qiStatusChanged(v, h, out);
}

Object.assign(PAGE_EVENTS, {
  [CEAT_SELF]: {
    DDLDepartment: async () => ({}), // rewrites the record list's Tag; this page shows no list
    DDLNextAction: async () => ({}),
    DDLStatus: PAGE_EVENTS[FINAL_QI].DDLStatus,
    BtnUD: PAGE_EVENTS[FINAL_QI].BtnUD,
    // Go_Click: the scanned barcode's lot, details, history and job-card checklist; a tyre whose curing was out gets
    // NCMR with the curing defect (errors: ErrorAlert, scan cleared)
    Go: async (v, h) => {
      const out = { set: { PrimaryKey: { value: '' } }, viewState: { ...h.vs } };
      let lot = v.TBInspectionLot;
      try {
        const r = await validateBarcodeSelfInspection(v.TBBarcode, async (x) => {
          lot = x;
          out.set.TBInspectionLot = { value: x };
        }, (d) => select(h, out, 'DDLDepartment', d));
        const qty = netNum(r.qty);
        out.set.TBQty = { value: qty };
        out.set.DDLStatus = { enabled: true };
        out.viewState.SCADAFLG = '0';
        const parts = r.rtn.split('~');
        if (parts.length < 2) throw new Error('Index was outside the bounds of the array.');
        const [barcodeNo, serial] = parts;
        Object.assign(out.set, { TBBarcode: { value: serial }, TbBar: { value: barcodeNo } });
        await ceatInitialize(v, h, out, lot, qty);
        const hist = await viewComponents(serial);
        Object.assign(out.set, { GVProcess: { rows: hist.process }, ProcessGrid: { visible: hist.process.length > 0 } });
        out.set.DDLStatus = { ...out.set.DDLStatus, index: 0 };
        delete out.set.DDLStatus.value;
        out.set.DDLNextAction = { index: 0 };
        const ud = await udListBarcode(barcodeNo);
        out.viewState.UDDataTable = ud;
        out.set.BtnUD = { visible: ud.length > 0 };
        if (!(await scadaCuringOk(serial))) {
          await select(h, out, 'DDLStatus', '15'); // Status.NCMR
          out.set.DDLStatus.enabled = false;
          out.set.DefectPanel = { visible: true };
          const t = await h.table('GVTransData');
          const def = await query('select Code,Alias,Name,Category  from DefectCodeMaster where Code =1260003');
          const rows = [...t.rows];
          if (def.length) {
            out.viewState.SCADAFLG = '1';
            const row = t.newRow();
            for (const [k, x] of Object.entries({ ID: 0, Defect: netInt(def[0].Code), Category: netInt(def[0].Category), Alias: netString(def[0].Alias), Name: netString(def[0].Name) })) t.set(row, k, x);
            rows.push(row);
          }
          out.set.GVTransData = { rows };
        }
      } catch (e) {
        out.alert = errorMsg(e.message);
        out.set.TBBarcode = { value: '' };
      }
      return out;
    },
    // btnAdd_Click: a defect (with its category, except for business unit 12202) into the grid
    btnAdd: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (netString(h.ctx.businessUnit) !== '12202' && v.DDLDefectCat === '') return void (out.alert = alertMsg('Kindly select a Defect Category'));
        if (v.DDLDefectCodes === '') return void (out.alert = alertMsg('Kindly select a Defect Code'));
        const t = await h.table('GVTransData');
        if (t.rows.some((r) => t.get(r, 'Defect') === v.DDLDefectCodes)) return void (out.alert = errorMsg('Already Added'));
        const row = t.newRow();
        t.set(row, 'ID', netInt(v.PrimaryKey));
        t.set(row, 'Defect', netInt(v.DDLDefectCodes));
        await selectedText(h, 'DDLDefectCat', v.DDLDefectCat); // SelectedItem (none: null reference)
        t.set(row, 'Category', netInt(v.DDLDefectCat));
        const parts = (await selectedText(h, 'DDLDefectCodes', v.DDLDefectCodes)).split('-');
        t.set(row, 'Alias', parts[0]);
        if (parts.length < 2) throw new Error('Index was outside the bounds of the array.');
        t.set(row, 'Name', parts[1]);
        out.set.GVTransData = { rows: [...t.rows, row] };
      });
    },
    // GVTransData_RowDeleting: the curing defect added by Go stays
    'GVTransData:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (netInt(h.vs.SCADAFLG) === 1) {
          if (!/^\s*[+-]?\d+\s*$/.test(h.arg)) throw new Error('Input string was not in a correct format.');
          if (Number(h.arg) === 548) return;
        }
        out.set.GVTransData = { rows: await gridDelete(h, 'GVTransData', h.arg) };
      });
    },
  },
});

withQC(CEAT_SELF, async (rows, v, h) => ({
  viewState: { ...h.vs, UDDataTable: rows },
  set: { DDLStatus: { value: String(rows.some((r) => !netBool(qcCell(r, 'qcstatus'))) ? STATUS.Rejected : STATUS.Approved) } },
}));

// BTNSave_Click: quantity / fields / status / action / defects checks, then AVQuality.CEATSaveSelfInspection
PAGE_SAVE[CEAT_SELF] = async (v, h) => {
  try {
    if (netDouble(h.vs.PendingQty) < netDouble(v.TBQty)) return { ok: false, message: errorMsg('Entered Quantiry is more than Pending Quantity ') };
    if (!h.shown('OtherFields')) return { ok: false, message: errorMsg('Please collect all fields data to proceed for saving') };
    if (v.DDLStatus === '0') return { ok: false, message: errorMsg('Please Select A Status') };
    if (v.DDLStatus !== '12') {
      if (v.DDLNextAction === '0') return { ok: false, message: errorMsg('Please Select Action') };
      if (!(Array.isArray(v.GVTransData) && v.GVTransData.length)) return { ok: false, message: errorMsg('Please Add Defects') };
    }
    const key = await ceatSelfInspectionSave(h.spec, h.raw ?? v, h.ctx, h.vs.UDDataTable, v.TbBar);
    return { ok: true, key, message: 'Record Created Successfully' };
  } catch (e) {
    return { ok: false, message: exceptionAlert(e.message) };
  }
};
