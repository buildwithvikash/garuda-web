// PDI - Final Inspection (View/Quality/QualityInspectionForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { netString, netInt, netDouble, netNum, netBool, exceptionAlert } from '../../../../shared/net.js';
import { qcOpen, cell as qcCell } from '../../qc.js';
import { STATUS, udList, udListMaterial, selfInspectionDetails, inspectionUom, isSerialLot, inspectionType, validateBarcodeInspectionQC, viewComponents, qualitySave } from '../../../quality/quality.service.js';
import { NRE, alertMsg, errorMsg, gridDelete, guard, qiStatusChanged, select, selectedText, withQC } from '../_shared.js';
import { PAGE_EVENTS, PAGE_INIT, PAGE_LOAD, PAGE_SAVE } from '../registry.js';

// TitleControl: no View / Update, so a saved inspection is never displayed again. ViewState keeps PendingQty and the
// checklist (UDDataTable); OtherFields' visibility (read by Save) is kept as __OtherFields.

export const FINAL_QI = 'View/Quality/QualityInspectionForm.aspx';

PAGE_LOAD[FINAL_QI] = (controls, ctx) => {
  // DDLDepartment.SelectedValue = the session's department (not listed: Page_Load's try/catch swallows it)
  const d = controls.find((c) => c.id === 'DDLDepartment');
  if (d.options.some((o) => o.value === netString(ctx.department))) d.value = netString(ctx.department);
};

Object.assign(PAGE_INIT, {
  [FINAL_QI]: async (controls, vs) => Object.assign(vs, { PendingQty: '0' }),
});

/** InitializeInspection(): the lot's details, UOM, quantity rules and checklist */
async function qiInitialize(v, h, out, lot, qty) {
  out.viewState.PendingQty = '0';
  if (lot === '') {
    Object.assign(out.set, { TBQty: { value: '' }, GridPanel: { visible: false }, OtherFields: { visible: false } });
    out.viewState.__OtherFields = '';
    return;
  }
  Object.assign(out.set, { GridPanel: { visible: true }, OtherFields: { visible: true } });
  out.viewState.__OtherFields = '1';
  out.set.GVInspectionDetails = { rows: await selfInspectionDetails(lot) };
  await select(h, out, 'DDLUom', await inspectionUom(lot));
  out.viewState.PendingQty = qty;
  Object.assign(out.set, { BarcodePanel: { visible: true } });
  out.set.TBQty = { ...out.set.TBQty, enabled: true };
  if (await isSerialLot(lot)) {
    await select(h, out, 'DDLUom', await inspectionUom(lot));
    out.set.TBQty = { ...out.set.TBQty, enabled: false };
  }
  out.set.QtyPanel = netDouble(qty) === 1 ? { visible: false } : { visible: true, enabled: false };
  const ud = await udList(lot);
  out.viewState.UDDataTable = ud;
  out.set.BtnUD = { visible: ud.length > 0 };
  if (ud.length) out.set.DDLStatus = { value: String(STATUS.Rejected) };
  await inspectionType(lot);
  await qiStatusChanged(v, h, out);
}

Object.assign(PAGE_EVENTS, {
  [FINAL_QI]: {
    // DDLDepartment_SelectedIndexChanged rewrites the list's Tag; this page has no list (ViewButton = false)
    DDLDepartment: async () => ({}),
    DDLNextAction: async () => ({}),
    DDLStatus: async (v, h) => {
      const out = { set: {} };
      return guard(out, () => qiStatusChanged(v, h, out));
    },
    // Go_Click: the scanned barcode's inspection lot, its details, history and checklist (errors: ErrorAlert, scan cleared)
    Go: async (v, h) => {
      const out = { set: { PrimaryKey: { value: '' } }, viewState: { ...h.vs } };
      let lot = v.TBInspectionLot;
      try {
        const r = await validateBarcodeInspectionQC(v.TBBarcode.trim(), async (x) => {
          lot = x;
          out.set.TBInspectionLot = { value: x };
        }, (d) => select(h, out, 'DDLDepartment', d));
        const qty = netNum(r.qty);
        const [barcodeNo, serial] = r.rtn.split('~');
        Object.assign(out.set, { TBQty: { value: qty }, TBBarcode: { value: serial }, TbBar: { value: barcodeNo } });
        await qiInitialize(v, h, out, lot, qty);
        const hist = await viewComponents(serial);
        Object.assign(out.set, { GVProcess: { rows: hist.process, visible: hist.process.length > 0 }, GVSelfInspection: { rows: hist.self, visible: hist.self.length > 0 } });
        out.set.DDLStatus = { index: 0 };
        out.set.DDLNextAction = { index: 0 };
        const ud = await udListMaterial(barcodeNo);
        out.viewState.UDDataTable = ud;
        out.set.BtnUD = { visible: ud.length > 0 };
      } catch (e) {
        out.alert = errorMsg(e.message);
        out.set.TBBarcode = { value: '' };
      }
      return out;
    },
    // BtnUD_Click (no try/catch): the checklist popup
    BtnUD: async (v, h) => {
      if (v.TBInspectionLot === '') return {};
      const s = structuredClone(v.QC);
      await qcOpen(s, Array.isArray(h.vs.UDDataTable) ? structuredClone(h.vs.UDDataTable) : (() => { throw NRE(); })());
      return { set: { QC: { visible: true, value: s } } };
    },
    // btnAdd_Click: a defect code into the grid
    btnAdd: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLDefectCodes === '') return void (out.alert = alertMsg('Kindly select a Defect Code'));
        const t = await h.table('GVTransData');
        if (t.rows.some((r) => t.get(r, 'Defect') === v.DDLDefectCodes)) return void (out.alert = errorMsg('Already Added'));
        const text = await selectedText(h, 'DDLDefectCodes', v.DDLDefectCodes);
        const parts = text.split('-');
        const row = t.newRow();
        t.set(row, 'ID', netInt(v.PrimaryKey));
        t.set(row, 'Defect', netInt(v.DDLDefectCodes));
        t.set(row, 'Alias', parts[0]);
        if (parts.length < 2) throw new Error('Index was outside the bounds of the array.');
        t.set(row, 'Name', parts[1]);
        out.set.GVTransData = { rows: [...t.rows, row] };
      });
    },
    'GVTransData:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVTransData = { rows: await gridDelete(h, 'GVTransData', h.arg) };
      });
    },
  },
});

// QCUDDataTable(dt): the results kept; any failed item makes the inspection Rejected, else Approved
withQC(FINAL_QI, async (rows, v, h) => ({
  viewState: { ...h.vs, UDDataTable: rows },
  set: { DDLStatus: { value: String(rows.some((r) => !netBool(qcCell(r, 'qcstatus'))) ? STATUS.Rejected : STATUS.Approved) } },
}));

Object.assign(PAGE_SAVE, {
  // BTNSave_Click: quantity / fields / status / action checks, then AVQuality.Save; the form starts again
  [FINAL_QI]: async (v, h) => {
    try {
      if (netDouble(h.vs.PendingQty) < netDouble(v.TBQty)) return { ok: false, message: errorMsg('Entered Quantiry is more than Pending Quantity ') };
      if (h.vs.__OtherFields !== '1') return { ok: false, message: errorMsg('Please collect all fields data to proceed for saving') };
      if (v.DDLStatus === '0') return { ok: false, message: errorMsg('Please Select A Status') };
      if (v.DDLStatus !== '12' && v.DDLNextAction === '0') return { ok: false, message: errorMsg('Please Select Action') };
      const key = await qualitySave(h.spec, h.raw ?? v, h.ctx, h.vs.UDDataTable, v.TBBarcode);
      return { ok: true, key, message: 'Record Created Successfully' };
    } catch (e) {
      return { ok: false, message: exceptionAlert(e.message) };
    }
  },
});
