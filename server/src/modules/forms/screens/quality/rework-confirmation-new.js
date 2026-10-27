// Rework Confirmation (View/Quality/ReworkConfirmationNew.aspx): the original page's code-behind, ported (registered in registry.js).
import { netString, netInt, netDouble } from '../../../../shared/net.js';
import { qcOpen } from '../../qc.js';
import { saveNewRRFConfirmation } from '../../../production/wip.service.js';
import { udList, udData, selfInspectionDetails, validateBarcodeRRF, reworkHistory, viewComponents } from '../../../quality/quality.service.js';
import { NRE, errorMsg, withQC } from '../_shared.js';
import { displayPatch, settingOr } from './_shared.js';
import { PAGE_EVENTS, PAGE_INIT, PAGE_LIST_TAG, PAGE_LOAD, PAGE_SAVE } from '../registry.js';

// ViewState: Qty (the inspection's quantity), PendingQty, UDDataTable, __Go / __BarcodeEnabled (Go's text, TBBarcode
// enabled). The record list follows the department (DDLDepartment_SelectedIndexChanged rewrites its Tag).

const REWORK_NEW = 'View/Quality/ReworkConfirmationNew.aspx';

Object.assign(PAGE_INIT, {
  [REWORK_NEW]: async (controls, vs) => Object.assign(vs, { Qty: '0', __Go: 'Go', __BarcodeEnabled: '1' }),
});

// Page_Load (its errors are swallowed): root cause panel by setting, the session department (else the only one)
PAGE_LOAD[REWORK_NEW] = (controls, ctx) => {
  controls.find((c) => c.id === 'PnlRootCause').visible = settingOr('ReworkRootCause', 0) === 1;
  const dept = controls.find((c) => c.id === 'DDLDepartment');
  if (dept.options.some((o) => o.value === netString(ctx.department))) dept.value = netString(ctx.department);
  if (dept.options.length === 2) dept.value = dept.options[1].value;
};

PAGE_LIST_TAG[REWORK_NEW] = (f, ctx) =>
  `|ID| where mb.Department =${netInt(f.dept ?? ctx?.department)}|Select ID, mb.BarcodeNo,m.Alias[ItemCode],m.Name[Item],mb.CurrentQty,u.Alias[Unit]  from InspectionTrans i inner join MaterialBarcode mb on i.SampleBarcode=mb.BarcodeNo   inner join Material m on mb.Material=m.MatCode inner join UnitOfMeasure u on m.BaseUom=u.UomCode and  i.NextAction=1 and isnull(i.ERPStatus,0)=1`;

Object.assign(PAGE_EVENTS, {
  [REWORK_NEW]: {
    DDLDepartment: async (v) => ({ list: { dept: netString(v.DDLDepartment) } }),
    DDLApproverStatus: async (v) => ({ set: { DDLNewAction: { value: '0' }, ActionPanel: { visible: netString(v.DDLApproverStatus) !== '12' } } }),
    // Go_Click: the rework inspection of the scanned barcode (or the scan cleared)
    Go: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.__Go === 'Clr') {
          Object.assign(out.set, { GridPanel: { visible: false }, ProcessGrid: { visible: false }, BtnUD: { visible: false }, OtherFields: { visible: false }, ConfirmationPanel: { visible: false }, TBBarcode: { value: '', enabled: true }, Go: { text: 'Go' } });
          Object.assign(out.viewState, { __Go: 'Go', __BarcodeEnabled: '1' });
          return out;
        }
        out.set.PrimaryKey = { value: '' };
        const r = await validateBarcodeRRF(v.TBBarcode, 1);
        out.set.PrimaryKey = { value: r.id };
        const [barcodeNo, serial] = r.rtn.split('~');
        Object.assign(out.set, { TBBarcode: { value: serial }, TbBar: { value: barcodeNo } });
        Object.assign(out.set, await displayPatch(h.spec, h.ctx, r.id));
        out.viewState.Qty = netString(out.set.TBQty?.value ?? v.TBQty);
        Object.assign(out.set, { BtnUD: { visible: true }, ConfirmationPanel: { visible: true } });
        // InitializeInspection
        const lot = netString(out.set.TBInspectionLot?.value ?? v.TBInspectionLot);
        out.viewState.PendingQty = '0';
        if (lot !== '') {
          Object.assign(out.set, { GridPanel: { visible: true }, OtherFields: { visible: true }, GVInspectionDetails: { rows: await selfInspectionDetails(lot) } });
          const ud = await udList(lot);
          out.viewState.UDDataTable = ud;
          out.set.BtnUD = { visible: ud.length > 0 };
        } else Object.assign(out.set, { TBQty: { value: '' }, GridPanel: { visible: false }, OtherFields: { visible: false } });
        out.buttons = { update: false };
        out.viewState.UDDataTable = await udData(r.id, lot);
        const hist = await viewComponents(serial);
        Object.assign(out.set, { GVProcess: { rows: hist.process }, GVSelfInspection: { rows: hist.self }, ProcessGrid: { visible: hist.process.length > 0 } });
        const rows = await reworkHistory(serial);
        Object.assign(out.set, { GVReworkHistory: { rows }, ReworkHistory: { visible: rows.length > 0 } });
        out.set.Go = { text: 'Clr' };
        out.set.TBBarcode = { ...out.set.TBBarcode, enabled: false };
        Object.assign(out.viewState, { __Go: 'Clr', __BarcodeEnabled: '0' });
      } catch (e) {
        out.alert = errorMsg(e.message);
        out.set.TBBarcode = { ...out.set.TBBarcode, value: '' };
      }
      return out;
    },
    BtnUD: async (v, h) => {
      if (netString(v.TBInspectionLot) === '') return {};
      const s = structuredClone(v.QC);
      await qcOpen(s, Array.isArray(h.vs.UDDataTable) ? structuredClone(h.vs.UDDataTable) : (() => { throw NRE(); })());
      return { set: { QC: { visible: true, value: s } } };
    },
  },
});

withQC(REWORK_NEW, async (rows, v, h) => ({ viewState: { ...h.vs, UDDataTable: rows } }));

// BTNSave_Click: the checks, then SaveNewRRFConfirmation; TitleControl shows the message (and starts a new form)
PAGE_SAVE[REWORK_NEW] = async (v, h) => {
  const fail = (m) => ({ ok: false, message: m, alert: errorMsg(m) });
  if (h.vs.__BarcodeEnabled !== '0') return { ...fail('Please scan Right Barcode'), set: { TBBarcode: { value: '' } } };
  const qty = netDouble(v.TBQty);
  if (qty === 0 || qty > netDouble(h.vs.Qty)) return fail('Wrong Qty');
  if (netString(v.TBBarcode).trim() === '') return fail('No Data to Save');
  if (netString(v.SSLActionTaken) === '0' || netString(v.TBApproverRemark) === '') return fail('Please Enter Rework Action or Remarks');
  if (netString(v.DDLApproverStatus) === '0') return fail('Please Select A Status');
  if (netString(v.DDLApproverStatus) !== '12' && netString(v.DDLNewAction) === '0') return fail('Please Select Action');
  try {
    await saveNewRRFConfirmation({ id: v.PrimaryKey, barcode: v.TbBar, qty, aqty: netDouble(h.vs.Qty), rootCause: String(netInt(v.DDLRootCause)), actionTaken: String(netInt(v.SSLActionTaken)), remark: netString(v.TBApproverRemark), selfApproval: settingOr('ReworkSelfApproval', 1) }, { ...h.ctx, department: netString(v.DDLDepartment) });
    return { ok: true, message: 'Record Created Successfully', session: { department: netString(v.DDLDepartment) } };
  } catch (e) {
    return { ok: false, message: e.message };
  }
};
