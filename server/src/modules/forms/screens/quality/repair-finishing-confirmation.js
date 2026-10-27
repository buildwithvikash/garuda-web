// quality/repair-finishing-confirmation.js: the original page's code-behind, ported (registered in registry.js).
import { netInt } from '../../../../shared/net.js';
import { qcOpen } from '../../qc.js';
import { udData, validateBarcodeRRF, saveRRFConfirmation, reworkHistory, viewComponents } from '../../../quality/quality.service.js';
import { NRE, errorMsg, withQC } from '../_shared.js';
import { displayPatch, ncmrClear, ncmrInitialize, settingOr, withFooter } from './_shared.js';
import { PAGE_EVENTS, PAGE_INIT, PAGE_LOAD, PAGE_SAVE } from '../registry.js';

// Settings.X defaults
const RRF = {
  'View/Quality/RepairConfirmation.aspx': { action: 2, footer: true, processGrid: false },
  'View/Quality/FinishingConfirmation.aspx': { action: 3, footer: false, processGrid: true },
};

for (const [file, cfg] of Object.entries(RRF)) {
  Object.assign(PAGE_INIT, { [file]: async (controls, vs) => Object.assign(vs, { PendingQty: '0', __Go: 'Go', __BarcodeEnabled: '1' }) });
  // Rework's Page_Load: the root cause panel only when Settings.ReworkRootCause = 1
  if (cfg.rework) PAGE_LOAD[file] = (controls) => void (controls.find((c) => c.id === 'PnlRootCause').visible = settingOr('ReworkRootCause', 0) === 1);
  PAGE_EVENTS[file] = {
    DDLDepartment: async () => ({}), // rewrites the list's Tag; the page has no list (ViewButton = false)
    DDLApproverStatus: async () => ({}),
    // Go_Click: "Clr" clears the scan; otherwise the barcode's inspection for this action is displayed
    Go: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.__Go === 'Clr') {
          ncmrClear(out);
          return out;
        }
        out.set.PrimaryKey = { value: '' };
        const r = await validateBarcodeRRF(v.TBBarcode, cfg.action);
        out.set.PrimaryKey = { value: r.id };
        const [barcodeNo, serial] = r.rtn.split('~');
        Object.assign(out.set, { TBBarcode: { value: serial }, TbBar: { value: barcodeNo } });
        Object.assign(out.set, await displayPatch(h.spec, h.ctx, r.id));
        Object.assign(out.set, { BtnUD: { visible: true }, ConfirmationPanel: { visible: true } });
        const lot = out.set.TBInspectionLot?.value ?? v.TBInspectionLot;
        await ncmrInitialize(h, out, lot);
        out.viewState.UDDataTable = await udData(r.id, lot);
        const hist = await viewComponents(serial);
        Object.assign(out.set, { GVProcess: { rows: hist.process, visible: hist.process.length > 0 }, GVSelfInspection: { rows: hist.self, visible: hist.self.length > 0 } });
        if (cfg.processGrid) out.set.ProcessGrid = { visible: hist.process.length > 0 };
        if (cfg.rework) {
          const rows = await reworkHistory(serial);
          Object.assign(out.set, { GVReworkHistory: { rows, visible: rows.length > 0 }, ReworkHistory: { visible: rows.length > 0 } });
        }
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
      if (v.TBInspectionLot === '') return {};
      const s = structuredClone(v.QC);
      await qcOpen(s, Array.isArray(h.vs.UDDataTable) ? structuredClone(h.vs.UDDataTable) : (() => { throw NRE(); })());
      return { set: { QC: { visible: true, value: s } } };
    },
  };
  withQC(file, async (rows, v, h) => ({ viewState: { ...h.vs, UDDataTable: rows } }));
  // BTNSave_Click: the scanned barcode's action confirmed (AVQuality.SaveRRFConfirmation)
  const save = async (v, h) => {
    const out = { set: {}, viewState: { ...h.vs } };
    if (h.vs.__BarcodeEnabled !== '0') {
      out.set.TBBarcode = { value: '' };
      return { ...out, success: false, message: '', alert: errorMsg('Please scan Right Barcode') };
    }
    if (cfg.rework && v.SSLActionTaken === '' && settingOr('ReworkRootCause', 0) === 1) return { ...out, success: false, message: '', alert: errorMsg('Select Resoluation') };
    try {
      await saveRRFConfirmation(v.PrimaryKey, v.TbBar, v.TBApproverRemark, cfg.rework ? String(netInt(v.DDLRootCause)) : '0', cfg.rework ? String(netInt(v.SSLActionTaken)) : '0', settingOr('ReworkSelfApproval', 1), h.ctx);
      return { success: true, message: 'Record Created Successfully' };
    } catch (e) {
      return { ...out, success: false, message: e.message };
    }
  };
  if (cfg.footer) withFooter(file, save);
  else {
    PAGE_SAVE[file] = async (v, h) => {
      const r = await save(v, h);
      // TitleControl: success clears the form; otherwise its Message shows (a page alert takes its place)
      return r.success ? { ok: true, message: r.message } : { ok: false, message: r.alert ?? r.message };
    };
  }
}
