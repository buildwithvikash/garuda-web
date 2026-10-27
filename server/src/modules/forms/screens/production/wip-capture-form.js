// Production Capture (View/Production/WIPCaptureForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { scalar, query } from '../../../../db/pool.js';
import { netString, netInt, netLong, netDouble, netNum, netBool, exceptionAlert } from '../../../../shared/net.js';
import { digitsOrEmpty } from '../../../../shared/sql.js';
import { settingText } from '../../../settings/settings.service.js';
import { fill } from '../../../../db/options.js';
import { printerOnline } from '../../../production/labels.service.js';
import { qcOpen } from '../../qc.js';
import { guideData } from '../../../production/production.service.js';
import { scanStageLabelNew, stageRMScanValidate, scanInputMaterialBarcode, displayInputBOMNew, historyByLabel, validateProductionBarcodeforQC, udListInProcess, displayProcessMaterial, componentHistory, isNextStageLabelPrint, saveQCChecklist, saveQCINProcess, getNextSerialNo, getNextAssetIDWRL, saveQCFinalProcess } from '../../../production/wip.service.js';
import { reworkHistory } from '../../../quality/quality.service.js';
import { NRE, alertMsg, errorMsg, gridDelete, guard, notInList, parseString, select, selectedText, withQC } from '../_shared.js';
import { blankCells, deptPrinters, guideFile, guideStation } from './_shared.js';
import { PAGE_EVENTS, PAGE_LOAD } from '../registry.js';

// ViewState: ControlID, ProcessCode, PType, LastScanned, I (the scan's result), INRowID, vmCode, amCode, and the
// controls' Tag attributes as "Tag:<id>" (TBWorkStation's is the scanned station). Controls' Visible / Enabled /
// Text come from the posted page state (h.ui / h.shown).
// Ported: department, station and stage-label scans, the input panel (component scans), the guide.
// ponytail: result codes 20 (output capture), 30 / 40 (QC, FG label) and the job-card modes 5000-9001 are not ported
// yet (codes 30 / 40 / 20 still start / record the stage in the database, as the scan does); next step of the port.

const WIP = 'View/Production/WIPCaptureForm.aspx';

const RESET_INNER = {
  hide: ['ProcessingUnitPanle', 'ButtonPanel', 'BreakDownPanel', 'InputMaterialPanel', 'InMachinaryPanel', 'ScanINHUPanel', 'IDMINPanel', 'ScanINbarcodePanel', 'InQtyPanel', 'OnlySerialScanPanel', 'OutputMaterialPanel', 'OUTHUPanel', 'YieldMachinaryPanel', 'QuantityPanel', 'IDNPanle', 'OnlineRejectionPanel', 'DefectPanel'],
  boxes: ['TbProcessingMachine', 'TBINHU', 'TBIDmIN', 'TBINItemCode', 'TbSerialHU', 'TbSerialBarcode', 'TBOutHU', 'TbYieldMachinary', 'TBID', 'TbRejectBarcode'],
  clear: ['TbQuantity', 'TBQCStatusRemark', 'TbSerialNo', 'TbNoOfPacks', 'TbPackQty', 'TbTotalQty', 'TBGrossWt', 'TBTareWt', 'TBWeighingScale', 'TbNetWt', 'TBRejectQty'],
  go: ['BtnProcessingMachine', 'BtnINHU', 'BtnIDMIn', 'BtnINBarcode', 'BtnSerialHU', 'BtnSerialBarcode', 'BtnOutHU', 'BtnYieldMachinary', 'BtnOMID'],
};

/** ResetOrderSelection / ResetFirstScan (+ OrderSelectionPanel) / ResetForm (+ the scan panels and boxes) */
function wipReset(out, level) {
  const hide = [...RESET_INNER.hide, ...(level >= 1 ? ['OrderSelectionPanel'] : []), ...(level >= 2 ? ['ScanPanel', 'MachinePanel', 'JobCardPanel', 'WorkStationPanel'] : [])];
  for (const id of hide) out.set[id] = { ...out.set[id], visible: false };
  for (const id of [...RESET_INNER.boxes, ...(level >= 2 ? ['TBMachine', 'TBJobCoard', 'TBWorkStation'] : [])]) out.set[id] = { ...out.set[id], value: '', enabled: true };
  for (const id of RESET_INNER.clear) out.set[id] = { ...out.set[id], value: '' };
  for (const id of [...RESET_INNER.go, ...(level >= 2 ? ['BtnMachineScan', 'BtnWorderScan', 'BtnWorkStationScan'] : [])]) out.set[id] = { ...out.set[id], text: 'Go' };
  out.set.SerialBarcode = { ...out.set.SerialBarcode, visible: true };
}

/** the page as it is after this request's changes so far */
const wipUi = (h, out) => ({
  text: (id) => out.set[id]?.text ?? h.ui(id).text,
  visible: (id) => out.set[id]?.visible ?? h.ui(id).visible,
  shown(id) {
    for (let c = h.control(id); c; c = c.parent ? h.control(c.parent) : null) if (!this.visible(c.id)) return false;
    return true;
  },
});

const tagOf = (h, out, id) => out.viewState[`Tag:${id}`] ?? h.vs[`Tag:${id}`] ?? (h.control(id)?.tag ?? []).join('|');

/** DDLDepartment_SelectedIndexChanged: printers, ResetForm, the scan panels of the department's indicator; the
 *  session department follows the choice */
async function wipDept(dept, h, out) {
  if (dept === '') return;
  for (const id of ['DDLPrinter', 'DDLViewPrinter', 'DDLQCPrinter', 'DDLStationPrinter']) out.set[id] = await deptPrinters(h, dept);
  const ind = parseString(await scalar(`Select ControlIndicator from Department where deptCode=${digitsOrEmpty(dept)}`));
  wipReset(out, 2);
  out.set.ScanPanel = { visible: true };
  out.viewState.ControlID = ind;
  out.set.ReworkPanel = { visible: false };
  const show = (...ids) => ids.forEach((id) => (out.set[id] = { ...out.set[id], visible: true }));
  if (ind === '5000') show('JobCardPanel', 'BtnWorderScan');
  else if (ind === '6000') show('MachinePanel');
  else if (ind === '7000') show('WorkStationPanel');
  else if (ind === '8000') show('JobCardPanel', 'BtnWorderScan', 'WorkStationPanel');
  else if (ind === '9000' || ind === '9001') {
    Object.assign(out.set, { JobCardPanel: { visible: false }, BtnWorderScan: { ...out.set.BtnWorderScan, visible: false } });
    show('WorkStationPanel');
  } else if (ind === '10000') show('JobCardPanel', 'BtnWorderScan', 'WorkStationPanel', 'ReworkPanel');
  out.session = { department: dept };
}

// Page_Load: BU, the session department (fixed when there is one), DDLDepartment_SelectedIndexChanged, the lists
PAGE_LOAD[WIP] = async (controls, ctx, viewState = {}) => {
  const byId = (id) => controls.find((c) => c.id === id);
  const h = { fill: (sql, params) => fill(sql, 'Select A Value', params) };
  try {
    const bu = byId('DDLBusinessUnit');
    if (!bu.options.some((o) => o.value === netString(ctx.businessUnit))) throw notInList('DDLBusinessUnit');
    bu.value = netString(ctx.businessUnit);
    const dept = byId('DDLDepartment');
    if (dept.options.length === 2) dept.value = dept.options[1].value;
    if (netString(ctx.department) !== '') {
      if (!dept.options.some((o) => o.value === netString(ctx.department))) throw notInList('DDLDepartment');
      dept.value = netString(ctx.department);
    }
    const out = { set: {}, viewState };
    await wipDept(netString(dept.value), h, out); // its ViewState (ControlID, ...) is the page's from the first load
    if (netInt(ctx.department) > 0) out.set.DDLDepartment = { enabled: false };
    const uom = await h.fill('Select UomCode, Alias from UnitOfMeasure where Status=1');
    for (const id of ['ddlINUom', 'DDLPackUom', 'DDLQuantityUom', 'DDLRejectUOM', 'DDLReverseUom']) out.set[id] = { options: uom };
    out.set.DDLDefectCate = { options: await h.fill('Select ID,[TYPE] from DefectCategoryType order by [Type]') };
    out.set.DdlWeightUnit = { options: await h.fill('Select UomCode, Alias from UnitOfMeasure where Status=1 and UOMType=6') };
    out.set.DDLBreakDownList = { options: await h.fill('Select ID, Type from BreakDownReasons') };
    out.set.DDLPauseList = { options: await h.fill('Select ID, Type from PauseReasons') };
    out.set.lblLine = { text: netString(ctx.lineName) };
    for (const [id, p] of Object.entries(out.set)) {
      const c = byId(id);
      if (!c) continue;
      if (p.options) Object.assign(c, { options: p.options, value: p.options[p.index ?? 0]?.value ?? '' });
      for (const k of ['visible', 'enabled', 'text', 'value']) if (k in p) c[k] = p[k];
    }
  } catch (e) {
    return { alert: exceptionAlert(e.message) };
  }
};

/** FillGuide then BtnGuide_Click: instructions, guide files (the first shown) */
async function wipGuide(ps, process, h, out) {
  const g = await guideData(ps, process);
  const ui = wipUi(h, out);
  out.set.RightPanel = { visible: true };
  out.set.GVInstruction = { rows: blankCells(g.instructions), visible: g.instructions.length > 0 };
  out.set.LBGuideFiles = { options: g.files, index: 0 };
  out.set.RightPanel = { visible: ui.shown('RightBottom') }; // RightPanel.Visible = rightbottom.Visible (list never empty)
  if (g.instructions.length > 0 || g.files.length > 1) {
    for (const id of ['RightTopPanel', 'RightPanel', 'RightTop', 'RightBottom']) out.set[id] = { visible: true };
    if (g.files.length > 1) {
      out.set.LBGuideFiles.index = 1;
      wipGuideFile(g.files[1], out);
    }
  }
}

/** LBGuideFiles_SelectedIndexChanged (WIP): a non-"Image" item in a frame, else a drawing / an image */
function wipGuideFile(item, out) {
  const url = guideFile(item.value).guide?.url ?? (item.value.startsWith('~/') ? item.value.slice(1) : item.value);
  out.set.GuideFileDisplayPanel = { guide: { kind: item.text !== 'Image' ? 'pdf' : item.value.includes('.dwg') ? 'dwg' : 'png', url } };
  Object.assign(out.set, { RightBottom: { visible: true }, RightTop: { visible: false } });
}

/** BtnRM_Click: the input panel with the stage's components */
async function wipInput(v, h, out) {
  for (const id of ['BreakDownPanel', 'InputMaterialPanel', 'OutputMaterialPanel', 'OnlineRejectionPanel', 'QualityApproval', 'QCPanel']) out.set[id] = { visible: false };
  Object.assign(out.set, { TbProcessingMachine: { value: '', enabled: true }, BtnProcessingMachine: { text: 'Go' }, TBINItemCode: { value: '', enabled: true }, BtnINBarcode: { text: 'Go' }, InputMaterialPanel: { visible: true } });
  const order = netString(out.set.DDLProdOrder?.value ?? v.DDLProdOrder);
  const r = await displayInputBOMNew(order, netString(out.viewState.ProcessCode));
  out.set.GVINMaterial = { rows: blankCells(r.rows), visible: true };
  if (r.more) Object.assign(out.set, { InMachinaryPanel: { visible: false }, ScanINbarcodePanel: { visible: true } }); // ISMachinaryScan: false
  out.set.ButtonPanel = { visible: false };
}

Object.assign(PAGE_EVENTS, {
  [WIP]: {
    DDLDepartment: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      await wipDept(netString(v.DDLDepartment), h, out);
      return out;
    },
    BtnWorkStationScan: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        const scan = netInt(settingText('WorkStationScan', '1'));
        if (scan === 0 && netString(v.DDLDepartment) === '') return { ...out, alert: errorMsg('Select Departmet') };
        if (netString(v.TBWorkStation) === '') return out;
        if (h.ui('BtnWorkStationScan').text === 'Clr') {
          wipReset(out, 1);
          for (const id of ['PnlHistory', 'PnlModelDetails', 'OrderSelectionPanel', 'ProcessingUnitPanle', 'MainPanel', 'PnlComponents', 'DefectHistoryPanel']) out.set[id] = { visible: false };
          Object.assign(out.set, { BtnWorkStationScan: { text: 'Go' }, TBWorkStation: { value: '', enabled: true }, TBMachine: { value: '', enabled: true }, BtnMachineScan: { text: 'Go' }, TBJobCoard: { value: '', enabled: true }, BtnWorderScan: { text: 'Go' } });
          return out;
        }
        out.viewState.ProcessCode = '';
        const r = await guideStation(netString(v.TBWorkStation), v, h, out);
        if (!r.ok) {
          out.alert = errorMsg('Invalid Work Center');
          out.set.TBWorkStation = { value: '' };
          return out;
        }
        const [code, alias] = r.rtn.split('~');
        Object.assign(out.viewState, { ProcessCode: r.process, 'Tag:TBWorkStation': code });
        out.set.TBWorkStation = { value: alias };
        out.viewState.PType = String(netInt(await scalar(`select prodcutionStage from ProductionProcess where ProcessCode=${digitsOrEmpty(r.process)}`)));
        out.set.PanelStationPrinter = { visible: out.viewState.PType === '7' };
        const ind = netInt(h.vs.ControlID);
        // ponytail: indicators 7000 / 9000 / 9001 (order list, serial-only scan) are not ported: WRL uses 10000
        if (ind === 7000 || ind === 9000 || ind === 9001) throw new Error(`Department indicator ${ind} is not supported`);
        Object.assign(out.set, { TBWorkStation: { value: alias, enabled: false }, BtnWorkStationScan: { text: 'Clr' } });
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        out.set.TBWorkStation = { ...out.set.TBWorkStation, value: '' };
      }
      return out;
    },
    BtnWorderScan: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.ui('BtnWorderScan').text === 'Clr') {
          wipReset(out, 1);
          for (const id of ['OrderSelectionPanel', 'ProcessingUnitPanle', 'MainPanel', 'MachinePanel', 'PnlHistory', 'PnlComponents', 'DefectHistoryPanel', 'RightTopPanel']) out.set[id] = { visible: false };
          Object.assign(out.set, { TBJobCoard: { value: '', enabled: true }, BtnWorderScan: { text: 'Go' }, WorkStationPanel: { visible: true }, JobCardPanel: { visible: true } });
          return out;
        }
        out.viewState.ProcessCode = '';
        if (netInt(h.vs.ControlID) !== 10000) throw new Error(`Department indicator ${netInt(h.vs.ControlID)} is not supported`);
        if (netString(v.DDLStationPrinter) === '' && h.shown('DDLStationPrinter')) return { ...out, alert: errorMsg('Please select a Printer') };
        if (netString(v.TBWorkStation).trim() === '' || h.ui('BtnWorkStationScan').text === 'Go') {
          Object.assign(out.set, { TBWorkStation: { value: '' }, TBJobCoard: { value: '' }, BtnWorderScan: { text: 'Go' } });
          return { ...out, alert: errorMsg('Please Scan Work Station') };
        }
        const card = netString(v.TBJobCoard);
        if (card.trim() === '') return { ...out, set: { ...out.set, TBJobCoard: { value: '' } }, alert: errorMsg('Please Scan Barcode') };
        out.viewState.LastScanned = card;
        Object.assign(out.set, { PnlHistory: { visible: true }, PnlModelDetails: { visible: true } });
        const hist = await historyByLabel(card);
        out.set.tbFG = { value: `${hist.name}|${card}` };
        out.set.GVHistory = { rows: hist.rows };
        if (!hist.rows.length) out.set.PnlHistory = { visible: false };
        out.viewState.I = '0';
        const s = await scanStageLabelNew(card.trim(), tagOf(h, out, 'TBWorkStation'), '', h.ctx);
        out.viewState.I = String(s.code);
        if (s.rows.length) {
          out.viewState.ProcessCode = s.rows[0].Process;
          out.viewState['Tag:TBWorkStation'] = s.rows[0].Station;
          out.set.DDLProdOrder = { options: await h.fill(`Select PSNo,Alias from ProcessOrder Where psNo=${digitsOrEmpty(s.rows[0].PsNo)}`), value: s.rows[0].PsNo };
        }
        if (!s.rows.length) throw noRowAt();
        await wipGuide(s.rows[0].PsNo, out.viewState.ProcessCode, h, out);
        if (s.code === 10) {
          out.set.MainPanel = { visible: true };
          out.set.BtnWorderScan = { text: 'Clr' };
          await wipInput(v, h, out);
        } else if (s.code === 11 || s.code === 21 || s.code === 50) {
          out.success = true;
          Object.assign(out.set, { TBJobCoard: { value: '' }, BtnWorderScan: { text: 'Go' } });
        } else if (s.code === 30) {
          await wipQCStage(v, h, out);
        } else if (s.code === 40) {
          await wipFGStage(v, h, out);
        } else if (s.code === 20) {
          throw new Error("This station's output capture is not available yet in the new app");
        }
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        out.set.TBJobCoard = { ...out.set.TBJobCoard, value: '' };
      }
      return out;
    },
    BtnRM: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, () => wipInput(v, h, out));
    },
    // BtnINBarcode_Click (indicator 10000): a component serial for the stage, then BtnInwardMaterial_Click
    BtnINBarcode: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.shown('InMachinaryPanel') && h.ui('TbProcessingMachine').enabled) {
          Object.assign(out.set, { TbProcessingMachine: { value: '' } });
          return { ...out, alert: errorMsg('Please Scan Machinary') };
        }
        const item = netString(v.TBINItemCode).trim();
        if (item === '') return out;
        if (h.vs.ProcessCode === undefined) throw NRE();
        const r = await stageRMScanValidate(netString(v.DDLProdOrder), netString(h.vs.ProcessCode), item, h.ctx);
        Object.assign(out.viewState, { vmCode: r.vCode, amCode: r.amCode });
        if (r.qty > 0 && r.reqQty > 0) {
          out.viewState['Tag:TBINItemCode'] = r.bar.split('~')[0];
          if (r.reqQty >= r.qty) {
            out.set.TBInQty = { value: netNum(r.qty) };
            await selectOrCache(h, out, 'ddlINUom', r.uom);
            out.viewState.INRowID = r.rowID;
            const inward = await PAGE_EVENTS[WIP].BtnInwardMaterial({ ...v, TBInQty: netNum(r.qty) }, { ...h, vs: out.viewState });
            return mergeOut(out, inward);
          }
          out.set.TBInQty = { value: netNum(r.reqQty) };
          await selectOrCache(h, out, 'ddlINUom', r.uom);
          out.viewState.INRowID = r.rowID;
          out.set.InQtyPanel = { visible: true };
          return out;
        }
        const last = parseString(await scalar('select top 1 p.Name  from ProcessOutputBOMBarcode b inner join ProductionProcess p on b.ProcessCode=p.ProcessCode  where b.Serial =@s order by b.CreatedOn desc', { s: item }).catch(() => ''));
        out.alert = errorMsg(last !== '' ? `Invalid barcode Last Process ${last}` : 'Invalid Item Barcode');
        out.set.TBINItemCode = { value: '' };
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        out.set.TBINItemCode = { value: '' };
      }
      return out;
    },
    // BtnInwardMaterial_Click: the component consumed; when the stage's inputs are complete the stage label is scanned
    // again (the next step runs) and the scan starts over
    BtnInwardMaterial: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.INRowID === undefined) throw NRE();
        const order = netString(v.DDLProdOrder);
        const process = netString(h.vs.ProcessCode);
        await scanInputMaterialBarcode(order, netString(h.vs.INRowID), process, tagOf(h, out, 'TBWorkStation'), tagOf(h, out, 'TBINItemCode'), netDouble(v.TBInQty), String(netInt(tagOf(h, out, 'TbProcessingMachine').replaceAll('|', ''))), netString(v.TBINItemCode), netString(h.vs.vmCode ?? ''), h.ctx);
        const r = await displayInputBOMNew(order, process);
        out.set.GVINMaterial = { rows: blankCells(r.rows), visible: true };
        Object.assign(out.set, { TBINItemCode: { value: '' }, TBInQty: { value: '' }, InQtyPanel: { visible: false }, TbProcessingMachine: { value: '', enabled: true }, BtnProcessingMachine: { text: 'Go' } });
        if (!r.more) {
          out.set.ScanINbarcodePanel = { visible: false };
          if (netInt(h.vs.ControlID) === 10000) {
            await scanStageLabelNew(netString(v.TBJobCoard), tagOf(h, out, 'TBWorkStation'), '', h.ctx);
            Object.assign(out.set, { MainPanel: { visible: false }, ButtonPanel: { visible: false }, TBJobCoard: { value: '' }, BtnWorderScan: { text: 'Go' } });
          }
        }
        out.success = true;
      } catch (e) {
        out.alert = exceptionAlert(e.message);
      }
      return out;
    },
    // Response.Redirect to the rework confirmation page
    BtnRework: async () => ({ redirect: '/quality/reworkconfirmationnew' }),
    BTNCloseInputMaterialPanel: async (v, h) => {
      const out = { set: { InputMaterialPanel: { visible: false } }, viewState: { ...h.vs } };
      if (netInt(h.vs.ControlID) !== 10000) throw new Error('Only department indicator 10000 is supported');
      Object.assign(out.set, { TBJobCoard: { value: '' }, BtnWorderScan: { text: 'Go' } });
      return out;
    },
    BtnGuide: async (v, h) => {
      const out = { set: {} };
      const rows = Array.isArray(v.GVInstruction) ? v.GVInstruction : [];
      const files = await h.options('LBGuideFiles');
      if (rows.length > 0 || files.length > 1) {
        for (const id of ['RightTopPanel', 'RightPanel', 'RightTop', 'RightBottom']) out.set[id] = { visible: true };
        if (files.length > 1) {
          out.set.LBGuideFiles = { index: 1 };
          wipGuideFile(files[1], out);
        }
      }
      return out;
    },
    LBGuideFiles: async (v, h) => {
      const out = { set: {} };
      const item = (await h.options('LBGuideFiles')).find((o) => o.value === netString(v.LBGuideFiles));
      if (!item) return { ...out, alert: errorMsg(NRE().message) };
      wipGuideFile(item, out);
      return out;
    },
    BtnToggleGuide: async () => ({ set: { RightTop: { visible: true }, RightBottom: { visible: false }, LBGuideFiles: { value: '' } } }),
    IMBGuideClose: async () => ({ set: { RightTopPanel: { visible: false } } }),
  },
});

const noRowAt = () => new Error('There is no row at position 0.');

/** an inner handler's result folded into the caller's (its sets and ViewState win, its alert too) */
function mergeOut(out, inner) {
  return { ...out, ...inner, set: { ...out.set, ...inner.set }, viewState: { ...out.viewState, ...inner.viewState } };
}

/** DropDownList.SelectedValue = value: an empty list only keeps it (no error), otherwise it must be listed */
async function selectOrCache(h, out, id, value) {
  if (!(out.set[id]?.options ?? (await h.options(id))).length) out.set[id] = { ...out.set[id], value };
  else await select(h, out, id, value);
}

// ViewState: LineCode, InspectionLotNo, QCDataTable (the checklist rows), PendingQty, Qty, BEEInd, BEE, FETCHGRNNE.

/** DDLWIPQCStatus_SelectedIndexChanged */
async function wipQCStatus(status, v, h, out) {
  const vs = out.viewState;
  const i = netInt(vs.I);
  const order = netString(out.set.DDLProdOrder?.value ?? v.DDLProdOrder);
  const process = netString(vs.ProcessCode);
  if (status === '12') {
    vs.BEEInd = String(netLong(await scalar(`Select ControlIndicator from ProductionProcess where ProcessCode = ${digitsOrEmpty(process)}`)));
    if (netInt(vs.BEEInd) === 10) {
      vs.BEE = String(netLong(await scalar('select md.Variant from MaterialBarcode mb inner join Material m on mb.Material = m.MatCode inner join model md on m.Model = md.ModelCode  where mb.Serial =@s', { s: netString(out.set.TBBarcode?.value ?? v.TBBarcode) })));
      out.set.PnlBEE = { visible: netLong(vs.BEE) > 0 };
    }
    if (i === 40) Object.assign(out.set, { FGLabelPanel: { visible: true }, DDLQCPrinter: { ...out.set.DDLQCPrinter, visible: true }, Label49: { visible: true } });
    Object.assign(out.set, { DDLNextAction: { index: 0 }, PanelDefects: { visible: false }, NextActionPanel: { visible: false }, QCPrinterPanel: { visible: await isNextStageLabelPrint(order, process) }, btnQCSave: { ...out.set.btnQCSave, visible: true } });
  } else if (status === '') {
    if (i === 40) out.set.FGLabelPanel = { visible: false };
    Object.assign(out.set, { PanelDefects: { visible: false }, NextActionPanel: { visible: false }, btnQCSave: { ...out.set.btnQCSave, visible: false }, PnlBEE: { visible: false } });
  } else {
    if (i === 40) out.set.FGLabelPanel = { visible: false };
    Object.assign(out.set, { btnQCSave: { ...out.set.btnQCSave, visible: true }, DDLNextAction: { index: 1 }, NextActionPanel: { visible: true }, PanelDefects: { visible: true }, PnlBEE: { visible: false }, QCPrinterPanel: { visible: false } });
  }
  if (netInt(vs.FETCHGRNNE) !== 1) out.set.TBGreenTag = { value: '' };
}

/** Go_Click: the barcode taken for QC (its lot, the checklist opened when the step has one) or cleared */
async function wipGo(v, h, out) {
  try {
    const goText = out.set.Go?.text ?? h.ui('Go').text;
    if (goText === 'Go') {
      out.set.DDLWIPQCStatus = { ...out.set.DDLWIPQCStatus, value: '' };
      await wipQCStatus('', v, h, out);
      const barcode = netString(out.set.TBBarcode?.value ?? v.TBBarcode);
      if (barcode.trim() === '') {
        Object.assign(out.set, { TBBarcode: { value: '' }, TbBar: { value: '' } });
        out.alert = errorMsg('Please Scan a Barcode');
        return;
      }
      out.set.btnQCSave = { ...out.set.btnQCSave, text: 'Save' };
      out.viewState.Qty = '0';
      out.set.DefectPanel = { visible: false };
      const order = netString(out.set.DDLProdOrder?.value ?? v.DDLProdOrder);
      const rows = await validateProductionBarcodeforQC(barcode.trim(), order);
      if (!rows.length) {
        Object.assign(out.set, { TBBarcode: { value: '' }, TbBar: { value: '' } });
        out.alert = errorMsg('Barcode is already Inspected or does not belongs to this Order');
        return;
      }
      Object.assign(out.set, { GVTransData: { rows: [] }, OtherFields: { visible: true }, QtyPanel: { visible: true }, TBQty: { ...out.set.TBQty, value: '1' } });
      out.viewState.PendingQty = '1';
      const uom = netString(rows[0].Uom);
      await selectOrCache(h, out, 'DDLUom', uom === '0' ? '' : uom);
      out.set.TbBar = { value: netString(rows[0].BarcodeNo) };
      out.viewState.InspectionLotNo = netString(rows[0].InspectionLotNo);
      const ud = await udListInProcess(order, netString(out.viewState.ProcessCode));
      out.viewState.QCDataTable = ud;
      if (ud.length) {
        Object.assign(out.set, { BtnUD: { visible: true }, DDLWIPQCStatus: { value: '13', enabled: false } });
        const s = structuredClone(v.InspectionCheckList);
        await qcOpen(s, structuredClone(ud));
        out.set.InspectionCheckList = { visible: true, value: s };
      } else Object.assign(out.set, { BtnUD: { visible: false }, DDLWIPQCStatus: { ...out.set.DDLWIPQCStatus, enabled: true } });
      out.set.NextActionPanel = { visible: false };
      await wipQCStatus(out.set.DDLWIPQCStatus.value, v, h, out);
      out.set.Go = { text: 'Clr' };
      if (netInt(out.viewState.I) === 40) await wipFGGo(rows[0], v, h, out);
    } else {
      Object.assign(out.set, { BtnUD: { visible: false }, OtherFields: { visible: false }, TBBarcode: { value: '' }, TbBar: { value: '' }, Go: { text: 'Go' }, DDLQCStatus: { index: 0 } });
    }
    if (netInt(out.viewState.ControlID) === 10000) out.set.QtyPanel = { visible: false };
  } catch (e) {
    out.alert = errorMsg(e.message);
    Object.assign(out.set, { QCPanel: { visible: false }, TBJobCoard: { value: '' } });
  }
}

/** BtnWorderScan_Click, result 30: the QC panel for the scanned serial */
async function wipQCStage(v, h, out) {
  Object.assign(out.set, { MainPanel: { visible: true }, ButtonPanel: { visible: false }, QCPanel: { visible: true }, btnQCClose: { visible: false }, FGLabelPanel: { visible: false } });
  const order = netString(out.set.DDLProdOrder?.value ?? v.DDLProdOrder);
  const process = netString(out.viewState.ProcessCode);
  const m = await displayProcessMaterial(order, process);
  out.viewState.LineCode = String(m.lineCode);
  out.set.GVWQCMaterial = { rows: blankCells(m.rows) };
  out.set.BarcodePanel = { visible: true };
  if (await isNextStageLabelPrint(order, process)) {
    out.set.QCPrinterPanel = { visible: true };
    const opts = out.set.DDLQCPrinter?.options ?? (await h.options('DDLQCPrinter'));
    if (opts.length === 2) out.set.DDLQCPrinter = { ...out.set.DDLQCPrinter, index: 1 };
  } else out.set.QCPrinterPanel = { visible: false };
  const card = netString(out.set.TBJobCoard?.value ?? v.TBJobCoard);
  Object.assign(out.set, { TBBarcode: { value: card }, Go: { text: 'Go' } });
  const defects = await reworkHistory(card);
  Object.assign(out.set, { GVDefectHistory: { rows: blankCells(defects) }, DefectHistoryPanel: { visible: defects.length > 0 } });
  const comps = await componentHistory(card);
  Object.assign(out.set, { GVComponents: { rows: blankCells(comps) }, PnlComponents: { visible: comps.length > 0 } });
  await wipGo({ ...v, TBBarcode: card }, h, out);
  out.set.BarcodePanel = { visible: false };
  out.set.TBQty = { ...out.set.TBQty, enabled: false };
}

Object.assign(PAGE_EVENTS[WIP], {
  Go: async (v, h) => {
    const out = { set: {}, viewState: { ...h.vs } };
    await wipGo(v, h, out);
    return out;
  },
  DDLWIPQCStatus: async (v, h) => {
    const out = { set: {}, viewState: { ...h.vs } };
    return guard(out, () => wipQCStatus(netString(v.DDLWIPQCStatus), v, h, out));
  },
  DDLDefectCate: async (v, h) => {
    const out = { set: {} };
    return guard(out, async () => {
      if (netString(v.DDLDefectCate) === '') return;
      const opts = await h.fill(`Select Code, concat(Alias,'-',Name) From DefectCodeMaster where  DefectCategory=${digitsOrEmpty(v.DDLDefectCate)}`);
      out.set.DDLDefectCodes = { options: opts, index: 0 };
      if (opts.length === 1) out.set.PanelDefects = { visible: false };
    });
  },
  btnAdd: async (v, h) => {
    const out = { set: {} };
    return guard(out, async () => {
      if (netString(v.DDLDefectCodes) === '') {
        out.alert = alertMsg('Kindly select a Defect Code');
        return;
      }
      const t = await h.table('GVTransData');
      if (t.rows.some((r) => t.get(r, 'Defect') === netString(v.DDLDefectCodes))) {
        out.alert = errorMsg('Already Added');
        return;
      }
      const text = await selectedText(h, 'DDLDefectCodes', v.DDLDefectCodes);
      const parts = text.split('-');
      if (parts.length < 2) throw new Error('Index was outside the bounds of the array.');
      const row = t.newRow();
      t.set(row, 'ID', 0);
      t.set(row, 'Defect', netInt(v.DDLDefectCodes));
      t.set(row, 'Alias', parts[0]);
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
  BtnUD: async (v, h) => {
    if (!Array.isArray(h.vs.QCDataTable)) throw NRE();
    const s = structuredClone(v.InspectionCheckList);
    await qcOpen(s, structuredClone(h.vs.QCDataTable));
    return { set: { InspectionCheckList: { visible: true, value: s } } };
  },
  btnQCClose: async (v, h) => {
    const out = { set: { QCPanel: { visible: false } } };
    if (netInt(h.vs.ControlID) !== 10000) out.set.ButtonPanel = { visible: true };
    else Object.assign(out.set, { TBJobCoard: { value: '' }, BtnWorderScan: { text: 'Go' } });
    return out;
  },
  btnQCClear: async (v, h) => ({
    set: { btnQCSave: { text: 'Save' }, OtherFields: { visible: false }, PanelDefects: { visible: false }, NextActionPanel: { visible: false }, TBBarcode: { value: '' }, QCPanel: { visible: false }, ButtonPanel: { visible: false } },
    viewState: { ...h.vs, barcodeNo: '' },
  }),
  // btnQCSave_Click (not the FG label stage): the QC decision saved (SaveQCINProcess)
  btnQCSave: async (v, h) => {
    const out = { set: {}, viewState: { ...h.vs } };
    try {
      const status = netString(v.DDLWIPQCStatus);
      if (status === '') return { ...out, alert: errorMsg('Please Select Status') };
      const defects = Array.isArray(v.GVTransData) ? v.GVTransData : [];
      if (status === '13') {
        if (['', '0'].includes(netString(v.DDLNextAction))) return { ...out, alert: errorMsg('Please Select Action') };
        if (!defects.length) return { ...out, alert: errorMsg('Please Select Defect') };
      }
      if (status === '12' && defects.length >= 1) return { ...out, alert: errorMsg('Remove the defects or change the Status') };
      if (netString(v.TBBarcode) === '' || h.ui('Go').text !== 'Clr') return { ...out, alert: errorMsg('Please Scan') };
      if (h.shown('QCPrinterPanel')) {
        if (netString(v.DDLQCPrinter) === '') return { ...out, alert: errorMsg('Select A Printer') };
        if (!(await printerOnline(v.DDLQCPrinter))) return { ...out, alert: errorMsg('Printer if Offline') };
      }
      const order = netString(v.DDLProdOrder);
      const base = () => {
        if (h.vs.LineCode === undefined || h.vs.InspectionLotNo === undefined) throw NRE();
        return { ud: Array.isArray(h.vs.QCDataTable) ? h.vs.QCDataTable : null, defects, status, nextAction: netString(v.DDLNextAction), barcode: netString(v.TBBarcode), ps: order, rowID: netString(h.vs.LineCode), process: netString(h.vs.ProcessCode), lot: netString(h.vs.InspectionLotNo), parameterCode: '0', station: tagOf(h, out, 'TBWorkStation'), controlId: netInt(h.vs.ControlID), printer: netString(v.DDLQCPrinter), bee: netString(v.TbBEENo).trim(), dept: netString(v.DDLDepartment), remark: netString(v.TBWQCRemark) };
      };
      let rtn;
      if (netInt(h.vs.I) === 40) {
        const r = await wipFGSave(v, h, out, base());
        if (r.alert) return { ...out, alert: r.alert };
        rtn = r.rtn;
      } else {
        if (netInt(h.vs.BEEInd) === 10 && netLong(h.vs.BEE) !== netLong(v.TbBEENo)) throw new Error('Please Scan Right BEE Code');
        out.session = { department: netString(v.DDLDepartment) };
        rtn = await saveQCINProcess(base(), { ...h.ctx, department: netString(v.DDLDepartment) });
      }
      out.viewState.barcodeNo = rtn;
      out.success = true;
      if (rtn === '0') {
        const m = await displayProcessMaterial(order, netString(h.vs.ProcessCode));
        out.viewState.LineCode = String(m.lineCode);
        out.set.GVWQCMaterial = { rows: blankCells(m.rows) };
        Object.assign(out.set, { OtherFields: { visible: false }, PanelDefects: { visible: false }, NextActionPanel: { visible: false }, TBBarcode: { value: '' }, TbBEENo: { value: '' }, Go: { text: 'Go' } });
        out.viewState.Cert = '';
        if (netInt(h.vs.ControlID) === 10000) {
          for (const id of ['BreakDownPanel', 'InputMaterialPanel', 'OutputMaterialPanel', 'OnlineRejectionPanel', 'QualityApproval', 'QCPanel', 'BtnStart', 'BtnPause', 'BtnComplete', 'BtnSetup', 'BtnRM', 'BtnBreakDown', 'BtnOG', 'BtnOnlineRejection', 'BtnInspect', 'MainPanel', 'PnlHistory', 'PnlComponents', 'DefectHistoryPanel']) out.set[id] = { visible: false };
          Object.assign(out.set, { TBJobCoard: { value: '' }, BtnWorderScan: { text: 'Go' } });
        }
      } else {
        Object.assign(out.set, { OtherFields: { visible: false }, PanelDefects: { visible: false }, NextActionPanel: { visible: false }, TBBarcode: { value: '' }, QCPanel: { visible: false }, ButtonPanel: { visible: false }, TBJobCoard: { value: '' }, BtnWorderScan: { text: 'Go' }, RightTopPanel: { visible: false }, TbBEENo: { value: '' } });
        out.viewState.Cert = '';
      }
    } catch (e) {
      out.alert = exceptionAlert(e.message);
    }
    return out;
  },
});

// InspectionCheckList (QCValueCaptureControl): its close is QCCheckListDataTable (no try/catch in the original)
withQC(WIP, async (rows, v, h) => {
  const out = { set: {}, viewState: { ...h.vs, QCDataTable: rows } };
  await saveQCChecklist(rows, netString(v.DDLProdOrder), tagOf(h, out, 'TBWorkStation'), netString(h.vs.ProcessCode), h.ctx);
  const fail = rows.some((r) => !netBool(r[Object.keys(r).find((k) => k.toLowerCase() === 'qcstatus')]));
  Object.assign(out.set, { DDLWIPQCStatus: { value: fail ? '13' : '12' }, DDLNextAction: { index: fail ? 1 : 0 } });
  await wipQCStatus(fail ? '13' : '12', v, h, out);
  return out;
}, 'InspectionCheckList');

/** BtnWorderScan_Click, result 40: the FG label panel for the scanned serial */
async function wipFGStage(v, h, out) {
  Object.assign(out.set, { MainPanel: { visible: true }, ButtonPanel: { visible: false }, QCPanel: { visible: true }, btnQCClose: { visible: false } });
  const order = netString(out.set.DDLProdOrder?.value ?? v.DDLProdOrder);
  const m = await displayProcessMaterial(order, netString(out.viewState.ProcessCode));
  out.viewState.LineCode = String(m.lineCode);
  Object.assign(out.set, { GVWQCMaterial: { rows: blankCells(m.rows) }, QtyPanel: { visible: false }, BarcodePanel: { visible: true }, QCPrinterPanel: { visible: true } });
  const card = netString(out.set.TBJobCoard?.value ?? v.TBJobCoard);
  Object.assign(out.set, { TBBarcode: { value: card }, Go: { text: 'Go' } });
  const defects = await reworkHistory(card);
  Object.assign(out.set, { GVDefectHistory: { rows: blankCells(defects) }, DefectHistoryPanel: { visible: defects.length > 0 } });
  const comps = await componentHistory(card);
  Object.assign(out.set, { GVComponents: { rows: blankCells(comps) }, PnlComponents: { visible: comps.length > 0 } });
  await wipGo({ ...v, TBBarcode: card }, h, out);
  out.set.BarcodePanel = { visible: false };
  out.set.TBQty = { ...out.set.TBQty, enabled: false };
}

/** Go_Click's FG part (result 40): the next FG serial and asset tag shown, the green tag, the certificate's printers */
async function wipFGGo(row, v, h, out) {
  const material = netString(row.Material);
  const dept = netString(v.DDLDepartment);
  const process = netString(out.viewState.ProcessCode);
  const serial = await getNextSerialNo(material, material, String(h.ctx.businessUnit), dept, process);
  const order = netString(out.set.DDLProdOrder?.value ?? v.DDLProdOrder);
  const fgRows = await query(`Select Classification,HSNCode,Barcode,AssetTagType,SalesTax From Material Where MatCode=${digitsOrEmpty(netString(await scalar(`Select Material from processOrder where PSNo=${digitsOrEmpty(order)}`) ?? ''))}`);
  if (fgRows.length) {
    const f = fgRows[0];
    Object.assign(out.viewState, { GreenLblFlag: netString(f.Classification === true ? 'True' : f.Classification === false ? 'False' : f.Classification), GreenLenght: netString(f.HSNCode), AssetLenght: netString(f.Barcode), AssetTagType: netString(f.AssetTagType), SalesTax: netString(f.SalesTax === true ? 'True' : f.SalesTax === false ? 'False' : f.SalesTax) });
  }
  out.set.TbFGSerialNo = { value: serial, enabled: serial.trim() === '' };
  const barcode = netString(out.set.TBBarcode?.value ?? v.TBBarcode).trim();
  const green = parseString(await scalar("select Serial2 from MaterialBarcode where Serial=@s and Serial2 <> '1'", { s: barcode }));
  out.viewState.FETCHGRNNE = green !== '' ? '1' : '0';
  out.set.TBGreenTag = { value: green };
  const logic = parseString(await scalar(`select AssetTagType from Material where matcode=${digitsOrEmpty(material)}`));
  const asset = await getNextAssetIDWRL(material, String(h.ctx.businessUnit), process, 1, logic);
  out.set.TbASsetTag = { value: asset, enabled: asset.trim() === '' };
  const cert = await query(`select * from CertificateController where ID = ( SELECT CertificateControl  FROM Material  WHERE MatCode = ${digitsOrEmpty(material)})`).catch(() => null);
  if (cert === null) throw NRE();
  const showPrinter = () => Object.assign(out.set, { Label49: { visible: true }, DDLQCPrinter: { ...out.set.DDLQCPrinter, visible: true, enabled: true } });
  if (cert.length) {
    out.viewState.Cert = netString(Object.values(cert[0])[1]);
    if (out.viewState.Cert === 'BIS') {
      const opts = await h.fill("Select ROWID,Name from BarcodePrinter Where Name like '%BIS%'");
      out.set.DDLQCPrinter = { options: opts, index: opts.length === 2 ? 1 : 0 };
      if (opts.length === 2) Object.assign(out.set, { Label49: { visible: false }, DDLQCPrinter: { ...out.set.DDLQCPrinter, visible: false, enabled: false } });
    } else {
      if (dept.includes('BIS')) out.set.DDLQCPrinter = await deptPrinters(h, dept); // DropDownList.Text: the chosen value
      showPrinter();
    }
  } else {
    const opts = out.set.DDLQCPrinter?.options ?? (await h.options('DDLQCPrinter'));
    const cur = netString(out.set.DDLQCPrinter?.value ?? v.DDLQCPrinter);
    const item = opts.find((o) => o.value === cur) ?? opts[0];
    if (!item) throw new Error('Index was out of range. Must be non-negative and less than the size of the collection.\r\nParameter name: index');
    if (item.text.includes('BIS')) out.set.DDLQCPrinter = await deptPrinters(h, dept);
    showPrinter();
  }
}

/** btnQCSave_Click's FG part (result 40): green / asset tag checks, then SaveQCFInalProcess */
async function wipFGSave(v, h, out, base) {
  const vs = h.vs;
  const green = netString(v.TBGreenTag);
  if (netInt(vs.GreenLblFlag) === 1) {
    if (green === '') return { alert: errorMsg('Please Enter Green Tag ') };
    if (netInt(vs.GreenLenght) !== 0 && green.length !== netInt(vs.GreenLenght)) return { alert: errorMsg(`Green Tag No. Lenght should be: ${netInt(vs.GreenLenght)}`) };
  }
  out.session = { department: netString(v.DDLDepartment) };
  if (netInt(vs.FETCHGRNNE) === 0 && netInt(vs.GreenLblFlag) === 1 && parseString(await scalar('Select Serial2 from  MaterialBarcode where Serial2=@g', { g: green.trim() })) !== '') {
    out.set.TBGreenTag = { value: '' };
    return { alert: errorMsg('Duplicate Green Tag ') };
  }
  const asset = netString(v.TbASsetTag);
  if (['0', ''].includes(parseString(vs.AssetTagType)) && netInt(vs.AssetLenght) !== 0 && asset.length !== netInt(vs.AssetLenght)) return { alert: errorMsg(`Asset Tag No. Lenght should be: ${netInt(vs.AssetLenght)}`) };
  // VaildateAssetGreentagWRL: a customer green tag for the asset must match
  const fg = parseString(await scalar(`Select Material from processOrder where PSNo=${digitsOrEmpty(base.ps)}`));
  if (fg !== '') {
    const code = parseString(await scalar(`Select Serial2 from TempAsset where Material =${digitsOrEmpty(fg)} And VSerial =@a`, { a: asset.trim() }));
    if (code !== '' && green.trim() !== code.trim()) throw new Error('This Green Tag Is Not Matched With Customer Green Tag');
  }
  return { rtn: await saveQCFinalProcess({ ...base, serial: netString(v.TbFGSerialNo), assetTag: asset, greenTag: green, otherPlant: netInt(vs.SalesTax) }, { ...h.ctx, department: netString(v.DDLDepartment) }) };
}
