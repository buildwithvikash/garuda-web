// NCMR Confirmation (View/Quality/NCMRConfirmation.aspx): the original page's code-behind, ported (registered in registry.js).
import { qcOpen } from '../../qc.js';
import { udData, validateBarcodeNCMR, saveNCMRConfirmation, viewComponents } from '../../../quality/quality.service.js';
import { NRE, errorMsg, withQC } from '../_shared.js';
import { displayPatch, ncmrClear, ncmrInitialize, withFooter } from './_shared.js';
import { PAGE_EVENTS, PAGE_INIT } from '../registry.js';

// Saved through its Footer; TitleControl's own Save (AddButton) stays the engine's. ViewState: UDDataTable;
// __Go = the Go button's text ("Clr" once a barcode is shown), __BarcodeEnabled = TBBarcode.Enabled.

const NCMR = 'View/Quality/NCMRConfirmation.aspx';

Object.assign(PAGE_INIT, {
  [NCMR]: async (controls, vs) => Object.assign(vs, { PendingQty: '0', __Go: 'Go', __BarcodeEnabled: '1' }),
});

Object.assign(PAGE_EVENTS, {
  [NCMR]: {
    DDLDepartment: async () => ({}), // rewrites the list's Tag; the page has no list (ViewButton = false)
    // Go_Click: "Clr" clears the scan; otherwise the barcode's NCMR inspection is displayed with its details
    Go: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.__Go === 'Clr') {
          ncmrClear(out);
          return out;
        }
        out.set.PrimaryKey = { value: '' };
        const r = await validateBarcodeNCMR(v.TBBarcode);
        out.set.PrimaryKey = { value: r.id };
        const [barcodeNo, serial] = r.rtn.split('~');
        Object.assign(out.set, { TBBarcode: { value: serial }, TbBar: { value: barcodeNo } });
        Object.assign(out.set, await displayPatch(h.spec, h.ctx, r.id));
        Object.assign(out.set, { BtnUD: { visible: true }, ConfirmationPanel: { visible: true } });
        const lot = out.set.TBInspectionLot?.value ?? v.TBInspectionLot;
        await ncmrInitialize(h, out, lot);
        out.viewState.UDDataTable = await udData(r.id, lot);
        const hist = await viewComponents(serial);
        Object.assign(out.set, { GVProcess: { rows: hist.process, visible: hist.process.length > 0 }, ProcessGrid: { visible: hist.process.length > 0 } });
        out.set.Go = { text: 'Clr' };
        out.set.TBBarcode = { ...out.set.TBBarcode, enabled: false };
        Object.assign(out.viewState, { __Go: 'Clr', __BarcodeEnabled: '0' });
      } catch (e) {
        out.alert = errorMsg(e.message);
        out.set.TBBarcode = { ...out.set.TBBarcode, value: '' };
      }
      return out;
    },
    // DDLApproverStatus_SelectedIndexChanged: an approval needs no action
    DDLApproverStatus: async (v) => ({ set: v.DDLApproverStatus === '12' ? { ActionPanel: { visible: false }, TBApproverRemark: { visible: true } } : { ActionPanel: { visible: true } } }),
    BtnUD: async (v, h) => {
      if (v.TBInspectionLot === '') return {};
      const s = structuredClone(v.QC);
      await qcOpen(s, Array.isArray(h.vs.UDDataTable) ? structuredClone(h.vs.UDDataTable) : (() => { throw NRE(); })());
      return { set: { QC: { visible: true, value: s } } };
    },
  },
});

withQC(NCMR, async (rows, v, h) => ({ viewState: { ...h.vs, UDDataTable: rows } }));

// BTNSave_Click (Footer): the NCMR decision on the shown barcode
withFooter(NCMR, async (v, h) => {
  const out = { set: {}, viewState: { ...h.vs } };
  if (h.vs.__BarcodeEnabled !== '0') {
    out.set.TBBarcode = { value: '' };
    return { ...out, success: false, message: '', alert: errorMsg('Please scan Right Barcode') };
  }
  try {
    await saveNCMRConfirmation(v.PrimaryKey, v.TbBar, v.DDLApproverStatus, v.DDLApproverAction, v.TBApproverRemark, h.ctx);
    return { success: true, message: 'Record Created Successfully' };
  } catch (e) {
    return { ...out, success: false, message: e.message };
  }
});
