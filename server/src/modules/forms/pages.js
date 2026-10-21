// Code-behind of individual engine pages (server side), keyed by the page file.
//  PAGE_INIT   - Page_Load code that runs between InitalizeForm and ClearForm: (controls, viewState, helpers)
//  PAGE_LISTS  - how a page fills a dropdown at run time (so its selected text can be looked up on the server)
//  PAGE_EVENTS - AutoPostBack / button / grid handlers: (values, helpers) -> { set, alert?, viewState? }
//                set: { id: { options?, index?, value?, rows?, visible?, text? } } (options first, then index/value).
//                Grid commands are named "<grid>:select" / "<grid>:delete" with the row's DataKey in helpers.arg.
// An exception a handler does not catch is the page's own error (the original showed the ASP.NET error page).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { scalar, execute, query, transaction } from '../../db/index.js';
import { netString, netInt, netLong, netDouble, netNum, netBool, exceptionAlert } from '../../lib/net.js';
import { config } from '../../config.js';
import { digitsOrEmpty, lit } from '../../lib/sql.js';
import { tableSchema } from './schema.js';
import { insert, update, collect, generateKey, logEvent } from './write.js';
import { toText } from './values.js';
import { changePassword, resetPassword } from '../auth/service.js';
import { setting, settingText } from '../settings/service.js';
import { fill, newFormState, displayState } from './state.js';
import { gridTable } from './children.js';
import { printLabel, printerDetail, printerOnline, prodStartLabelData, printProdStart } from './labels.js';
import { QC_EVENTS, qcOpen, dataTable, cell as qcCell } from './qc.js';
import { validateWorkStation, componentStatus, replaceRMScan, showModelDetails, modelToModelTransfer, getPSNo, guideData, orderMaterial, generateSerialNo, generateSerialNoWRL } from './production.js';
import { scanStageLabelNew, stageRMScanValidate, scanInputMaterialBarcode, displayInputBOMNew, historyByLabel, validateProductionBarcodeforQC, udListInProcess, displayProcessMaterial, componentHistory, isNextStageLabelPrint, saveQCChecklist, saveQCINProcess, saveNewRRFConfirmation, getNextSerialNo, getNextAssetIDWRL, saveQCFinalProcess } from './wip.js';
import { STATUS, udList, udData, udListMaterial, selfInspectionDetails, inspectionUom, isSerialLot, inspectionType, validateBarcodeInspectionQC, validateBarcodeNCMR, saveNCMRConfirmation, validateBarcodeRRF, saveRRFConfirmation, reworkHistory, viewComponents, qualitySave, ceatSelfInspectionSave, udListBarcode, validateBarcodeSelfInspection, scadaCuringOk } from './quality.js';

const run = promisify(execFile);

/** AU.FillServerPrinterList: "" then the printers installed on the web server (Windows only). */
async function serverPrinters() {
  if (process.platform !== 'win32') return [];
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Drawing; [System.Drawing.Printing.PrinterSettings]::InstalledPrinters'], { windowsHide: true });
  return stdout.split(/\r?\n/).filter((x) => x.trim() !== '');
}

// WrapperAvatar.Alert puts the text in alert('…') with "," written as "&#44" (shown as such) and "\" doubled.
const alertMsg = (m) => m.replaceAll(',', '&#44');
// WrapperAvatar.ErrorAlert: , . ' " ; removed, cut to 250.
const errorMsg = (m) => m.replace(/[,.'";]/g, '').slice(0, 250);
// "try { … } catch (ex) { WrapperAvatar.ExceptionAlert(Page, ex); }": what ran before the throw stays.
async function guard(out, fn) {
  try {
    await fn();
  } catch (e) {
    out.alert = exceptionAlert(e.message);
  }
  return out;
}
const parseString = (v) => (netString(v) === '&nbsp;' ? '' : netString(v));
const parseStringZero = (v) => (netString(v) === '' || netString(v) === '0' ? '' : netString(v));
const notInList = (id) => new Error(`'${id}' has a SelectedValue which is invalid because it does not exist in the list of items.\r\nParameter name: value`);
const NRE = () => new Error('Object reference not set to an instance of an object.');
const noKey = () => {
  throw NRE();
};

/** DropDownList.SelectedValue = value (throws when the value is not listed). */
async function select(h, out, id, value) {
  const opts = out.set[id]?.options ?? (await h.options(id));
  if (!opts.some((o) => o.value === value)) throw notInList(id);
  out.set[id] = { ...out.set[id], value };
}
/** DropDownList.SelectedItem.Text (null reference when the list is empty). */
async function selectedText(h, id, value) {
  const opts = await h.options(id);
  const o = opts.find((x) => x.value === value) ?? opts[0];
  if (!o) throw NRE();
  return o.text;
}

/** AU.GridViewRowDeleting(sender, e, grid, dt): a row already saved (FK > 0) is deleted from the table at once.
 *  given: the ViewState table when the page keeps its own (default: the rows shown) */
async function gridDelete(h, gridId, keyValue, given) {
  const t = await h.table(gridId, given);
  const c = h.control(gridId);
  const keyField = (c.attrs.datakeynames ?? '').split(',')[0].trim();
  const fk = c.tag[2].split('.').at(-1).trim();
  const i = t.rows.findIndex((r) => t.get(r, keyField) === keyValue);
  if (i >= 0 && netInt(t.get(t.rows[i], fk)) > 0) {
    await execute(`Delete from ${c.tag[1].trim()} where ${fk}=@fk and ${keyField}=@key`, { fk: t.get(t.rows[i], fk), key: keyValue });
  }
  return t.rows.filter((_, j) => j !== i);
}
/** The pages' own RowDeleting: the row with that DataKey leaves the grid (nothing is deleted in the table). */
async function gridRemove(h, gridId, field, keyValue) {
  const t = await h.table(gridId);
  const i = t.rows.findIndex((r) => t.get(r, field) === keyValue);
  return t.rows.filter((_, j) => j !== i);
}

/** AVMaterial.AddVarintFieldValue: new VariantFieldValue (key from IDMaster), returns its code. */
async function addVariantFieldValue(field, value, ctx) {
  const schema = await tableSchema('VariantFieldValue');
  const row = new Map([['Code', 0], ['Name', value], ['Field', field], ['Status', 1]].map(([k, v]) => [schema.col(k)?.name ?? k, v]));
  return insert(null, { tables: [{ schema, prefix: '', rows: [row] }] }, ctx);
}

const VARIANT_FIELDS = 'select FieldCode,Name from VariantField';
const groupFields = (h, group) => (group === '' ? h.fill(VARIANT_FIELDS) : h.fill('select f.FieldCode,f.Name   from VariantFGroupTrans g inner join VariantField f on g.FieldCode =f.FieldCode   where g.GroupCode=@g', { g: group }));
/** Convert.ToInt32(DdlName.SelectedItem.Value) */
const toInt32 = (s) => {
  if (!/^\s*[+-]?\d+\s*$/.test(s)) throw new Error('Input string was not in a correct format.');
  return Number(s);
};

export const PAGE_INIT = {
  'View/Settings/PrinterForm.aspx': async (controls) => {
    const ddl = controls.find((c) => c.id === 'DDLDriver');
    if (ddl) ddl.options = [{ value: '', text: '' }, ...(await serverPrinters().catch(() => [])).map((p) => ({ value: p, text: p }))];
  },
  'View/MaterialSetup/VariantFieldGroupForm.aspx': async (controls, vs, h) => {
    controls.find((c) => c.id === 'DdlName').options = await h.fill(VARIANT_FIELDS);
  },
  'View/MaterialSetup/VariantForm.aspx': async (controls, vs, h) => {
    controls.find((c) => c.id === 'DdlName').options = await h.fill(VARIANT_FIELDS);
  },
  'View/BusinessSetup/TaxMasterForm.aspx': async (controls, vs) => Object.assign(vs, { TACT: 'A', LINE: '0' }),
  'View/Settings/ParameterForm.aspx': async (controls, vs) => Object.assign(vs, { btnAdd: '1' }),
};

// Lists the page refills while the form is open: the current items follow from the other values.
export const PAGE_LISTS = {
  'View/MaterialSetup/VariantForm.aspx': {
    DdlName: (v, h) => groupFields(h, v.DDLGroup ?? ''),
    DdlValue: (v, h) => (v.DdlName === '' || v.DdlName == null ? [] : h.fill('select Code,Name from VariantFieldValue where Field=@f', { f: toInt32(v.DdlName) })),
  },
  'View/MaterialSetup/ModelForm.aspx': {
    DdlName: (v, h) => (v.DDLGroup ? groupFields(h, v.DDLGroup) : h.fill('Select FieldCode ,Name from VariantField where Status=1')),
    DdlValue: (v, h) => (v.DdlName === '' || v.DdlName == null ? [] : h.fill("select Concat(Code,'~',Prefix)[Code],Name from VariantFieldValue where Field=@f", { f: toInt32(v.DdlName) })),
  },
  'View/MaterialSetup/VariantFieldGroupForm.aspx': { DdlName: (v, h) => h.fill(VARIANT_FIELDS) },
};

/** Variant / Model "Add": shared start (field chosen, not yet in the grid, new value typed -> found or created). */
async function variantAddStart(v, h, out, { byText }) {
  if (v.DdlName === '') return { stop: { alert: alertMsg('Select a Variant Field') } };
  const t = await h.table('GVTransData');
  const name = await selectedText(h, 'DdlName', v.DdlName);
  if (t.rows.some((r) => t.get(r, 'Name') === name)) return { stop: { alert: alertMsg('The Field is Already Added') } };
  let opts = await h.options('DdlValue');
  let value = v.DdlValue;
  if (v.TbNewValue.trim() !== '') {
    const hit = opts.find((l) => l.text === v.TbNewValue && l.value !== '');
    if (hit) {
      value = byText ? opts.find((l) => l.text === hit.text).value : hit.value;
    } else {
      const code = await addVariantFieldValue(v.DdlName, v.TbNewValue, h.ctx);
      opts = await PAGE_LISTS[h.spec.file].DdlValue(v, h); // DdlName_SelectedIndexChanged
      out.set.DdlValue = { options: opts };
      if (byText) value = opts.find((l) => l.text === v.TbNewValue)?.value ?? opts[0]?.value ?? ''; // SelectDropDown(DdlValue, text)
      else if (opts.some((l) => l.value === code)) value = code;
      else throw notInList('DdlValue');
    }
    out.set.DdlValue = { ...out.set.DdlValue, value };
    out.set.TbNewValue = { value: '' };
  }
  const item = opts.find((l) => l.value === value) ?? opts[0];
  if (!item) throw NRE();
  return { t, name, item };
}

export const PAGE_EVENTS = {
  'View/MaterialSetup/MaterialCategoryForm.aspx': {
    DDLInspectionRequired: async (v) => (v.DDLInspectionRequired === 'False' ? { set: { DDLInspectionType: { index: 0 }, DDLInspectionCheckList: { index: 0 } } } : {}),
  },
  'View/MaterialSetup/MaterialLedgerMappingForm.aspx': {
    // AVMM.FillMaterialFromModel / FillMaterial (AU.FillDropDownList: list refilled, first item selected)
    DDLModel: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.DDLMaterial = {
          options: v.DDLModel !== '' ? await h.fill('Select matcode,Name from Material where Model=@m', { m: netString(v.DDLModel) }) : await h.fill("Select MatCode,CONCAT(Name, '|', Alias) from Material Where Status=1"),
          index: 0,
        };
      });
    },
  },
  'View/MaterialSetup/UnitConversionForm.aspx': {
    DDLTo: async (v) => (v.DDLfrom === v.DDLTo ? { alert: alertMsg('Both UOM cant be same'), set: { DDLfrom: { index: 0 } } } : {}),
    DDLMaterial: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLMaterial === '') return;
        // AVMM.GetUom: ExecuteScalar(...).ToString() -> null reference when the material is gone
        const uom = await scalar('select BaseUom from Material where MatCode = @m', { m: netString(v.DDLMaterial) });
        if (uom == null) throw NRE();
        await select(h, out, 'DDLTo', netString(uom));
      });
    },
  },

  // ---- grid pages -------------------------------------------------------------------------------------------
  'View/Settings/ShiftMasterForm.aspx': {
    BtnAdd: async (v, h) => {
      const t = await h.table('GVTransData');
      if (t.rows.some((r) => t.get(r, 'Name') === v.TBBreakName)) return { alert: alertMsg('Value Already Added') };
      const row = t.newRow();
      t.set(row, 'RowID', t.max('RowID') + 1);
      t.set(row, 'ShiftCode', 0);
      t.set(row, 'Name', v.TBBreakName);
      t.set(row, 'StartTime', v.TBStart);
      t.set(row, 'EndTime', v.TBEnd);
      return { set: { GVTransData: { rows: [...t.rows, row] }, TBBreakName: { value: '' }, TBStart: { value: '' }, TBEnd: { value: '' } } };
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridRemove(h, 'GVTransData', 'RowID', h.arg) } } }),
  },
  'View/MaterialSetup/AssetMaster.aspx': {
    BtnAdd: async (v, h) => {
      const t = await h.table('GVTransData');
      if (t.rows.some((r) => t.get(r, 'ScheduleDate') === v.TBScheduleDate)) return { alert: errorMsg('Value Already Added') };
      const row = t.newRow();
      t.set(row, 'RowID', t.max('RowID') + 1);
      t.set(row, 'AssetCode', 0);
      t.set(row, 'ScheduleDate', v.TBScheduleDate);
      t.set(row, 'Status', v.DDLAssetStatus);
      return { set: { GVTransData: { rows: [...t.rows, row] } } };
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridRemove(h, 'GVTransData', 'RowID', h.arg) } } }),
  },
  'View/MaterialSetup/VariantFieldGroupForm.aspx': {
    BtnAdd: async (v, h) => {
      const t = await h.table('GVTransData');
      if (t.rows.some((r) => t.get(r, 'FieldCode') === v.DdlName)) return { alert: alertMsg('Field Already Added') };
      const row = t.newRow();
      t.set(row, 'GroupCode', 0);
      t.set(row, 'Name', await selectedText(h, 'DdlName', v.DdlName));
      t.set(row, 'FieldCode', netInt(v.DdlName));
      return { set: { GVTransData: { rows: [...t.rows, row] }, DdlName: { index: 0 } } };
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridDelete(h, 'GVTransData', h.arg) } } }),
  },
  'View/Settings/ParameterValueListForm.aspx': {
    BtnAdd: async (v, h) => {
      const t = await h.table('GVTransData');
      if (t.rows.some((r) => t.get(r, 'Value') === v.TbValue)) return { alert: alertMsg('Value Already Added') };
      const row = t.newRow();
      t.set(row, 'Code', netInt(v.PrimaryKey));
      t.set(row, 'Value', v.TbValue);
      t.set(row, 'Result', netInt(v.DDLPass));
      return { set: { GVTransData: { rows: [...t.rows, row] }, TbValue: { value: '' } } };
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridRemove(h, 'GVTransData', 'Value', h.arg) } } }),
  },
  'View/BusinessSetup/TaxMasterForm.aspx': {
    BtnAdd: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const t = await h.table('GVTransData');
        const add = netString(h.vs.TACT) === 'A';
        const line = add ? t.max('RowID') + 1 : netInt(h.vs.LINE);
        const row = t.newRow();
        t.set(row, 'RowID', line);
        t.set(row, 'TaxCode', netInt(v.PrimaryKey));
        t.set(row, 'TaxBoundry', netInt(v.DDLTaxBoundry));
        t.set(row, 'Caption', v.TBCaption.trim());
        t.set(row, 'Percentage', netDouble(v.TBTaxp));
        t.set(row, 'Type', await selectedText(h, 'DDLTaxBoundry', v.DDLTaxBoundry));
        let rows = t.rows;
        if (add) rows = [...rows, row];
        else {
          // AU.UpdateDataRow: every column of the matching row takes the new row's value
          const i = rows.findIndex((r) => t.get(r, 'RowID') === String(line));
          if (i >= 0) rows = rows.map((r, j) => (j === i ? { ...row } : r));
        }
        Object.assign(out.viewState, { TACT: 'A', LINE: '' });
        Object.assign(out.set, { TBCaption: { value: '' }, TBTaxp: { value: '' }, GVTransData: { rows } });
      });
    },
    'GVTransData:select': async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const t = await h.table('GVTransData');
        const row = t.rows.find((r) => t.get(r, 'RowID') === h.arg) ?? noKey(); // GVTransData.SelectedDataKey is null when no row has that key
        out.viewState.LINE = parseString(t.get(row, 'RowID'));
        await select(h, out, 'DDLTaxBoundry', parseString(t.get(row, 'TaxBoundry')));
        out.set.TBCaption = { value: parseString(t.get(row, 'Caption')) };
        out.set.TBTaxp = { value: netNum(netDouble(t.get(row, 'Percentage'))) };
        out.viewState.TACT = 'M';
      });
    },
    'GVTransData:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVTransData = { rows: await gridDelete(h, 'GVTransData', h.arg) };
      });
    },
  },
  'View/MaterialSetup/VariantForm.aspx': {
    DdlName: async (v, h) => ({ set: { DdlValue: { options: await PAGE_LISTS[h.spec.file].DdlValue(v, h), index: 0 } } }),
    DDLGroup: async (v, h) => ({ set: { DdlName: { options: await groupFields(h, v.DDLGroup), index: 0 } } }),
    BtnAdd: async (v, h) => {
      const out = { set: {} };
      const s = await variantAddStart(v, h, out, { byText: false });
      if (s.stop) return { ...out, ...s.stop };
      const { t, name, item } = s;
      if (t.rows.some((r) => t.get(r, 'ValueCode') === item.value)) return { ...out, alert: alertMsg('Value Already Added') };
      const row = t.newRow();
      t.set(row, 'RowID', t.max('RowID') + 1);
      t.set(row, 'VariantCode', 0);
      t.set(row, 'ValueCode', netInt(item.value));
      t.set(row, 'Name', name);
      t.set(row, 'Value', item.text);
      Object.assign(out.set, { GVTransData: { rows: [...t.rows, row] }, DdlName: { index: 0 }, DdlValue: { options: out.set.DdlValue?.options, index: 0 } });
      return out;
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridDelete(h, 'GVTransData', h.arg) } } }),
  },
  'View/MaterialSetup/ModelForm.aspx': {
    DdlName: async (v, h) => ({ set: { DdlValue: { options: await PAGE_LISTS[h.spec.file].DdlValue(v, h), index: 0 } } }),
    DDLGroup: async (v, h) => ({ set: { DdlName: { options: await groupFields(h, v.DDLGroup), index: 0 } } }),
    BtnAdd: async (v, h) => {
      const out = { set: {} };
      const s = await variantAddStart(v, h, out, { byText: true });
      if (s.stop) return { ...out, ...s.stop };
      const { t, name, item } = s;
      if (t.rows.some((r) => t.get(r, 'ValueCode') === item.value)) return { ...out, alert: alertMsg('Value Already Added') };
      const parts = item.value.split('~');
      if (parts.length < 2) throw new Error('Index was outside the bounds of the array.');
      const row = t.newRow();
      t.set(row, 'RowID', t.max('RowID') + 1);
      t.set(row, 'RecNo', t.max('RecNo') + 1);
      t.set(row, 'ModelCode', 0);
      t.set(row, 'ValueCode', netInt(parts[0]));
      t.set(row, 'Prefix', parts[1].trim());
      t.set(row, 'Name', name);
      t.set(row, 'Value', item.text);
      const rows = [...t.rows, row];
      const cat = (await selectedText(h, 'DDLCategory', v.DDLCategory)).split('~');
      if (cat.length < 2) throw new Error('Index was outside the bounds of the array.');
      const alias = cat[1] + rows.map((r) => t.get(r, 'Prefix').trim()).join('');
      Object.assign(out.set, { GVTransData: { rows }, DdlName: { index: 0 }, DdlValue: { options: out.set.DdlValue?.options, index: 0 }, Alias: { value: alias } });
      return out;
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridDelete(h, 'GVTransData', h.arg) } } }),
  },
  'View/Settings/ParameterForm.aspx': {
    DdlInputType: async (v) => parameterInputType(v.DdlInputType),
    BtnAdd: async (v, h) => {
      const t = await h.table('GVTransData');
      const fill = async (row) => {
        t.set(row, 'Name', v.TbName);
        t.set(row, 'Description', v.TbDescription);
        t.set(row, 'InputType', v.DdlInputType);
        t.set(row, 'MinValue', netDouble(v.TbMinValue));
        t.set(row, 'MaxValue', netDouble(v.TbMaxValue));
        t.set(row, 'PassValue', v.TbPassValue);
        t.set(row, 'Uom', netInt(v.DdlUom));
        t.set(row, 'ResultDefined', v.DdlResultDefined);
        t.set(row, 'Instrument', netInt(v.DDLInstrument));
        t.set(row, 'List', netInt(v.DdlList));
        t.set(row, 'GuideImage', v.UploadImage ?? '');
      };
      let rows = t.rows;
      if (netBool(h.vs.btnAdd)) {
        if (rows.some((r) => t.get(r, 'Description') === v.TbDescription)) return { alert: alertMsg('Value Already Added') };
        const row = t.newRow();
        t.set(row, 'ParameterCode', netInt(v.PrimaryKey));
        t.set(row, 'LineCode', t.max('LineCode') + 1);
        await fill(row);
        rows = [...rows, row];
      } else {
        const i = rows.findIndex((r) => t.get(r, 'LineCode').trim() === parseString(h.vs.LineCode).trim());
        if (i >= 0) {
          const row = { ...rows[i] };
          await fill(row);
          rows = rows.map((r, j) => (j === i ? row : r));
        }
      }
      const blank = { value: '' };
      return {
        set: { GVTransData: { rows }, TbName: blank, TbDescription: blank, TbMaxValue: blank, TbMinValue: blank, TbPassValue: blank, DdlUom: { value: '' }, MinMaxPanel: { visible: false }, ListPanel: { visible: false }, BtnAdd: { text: '  ADD  ' } },
        viewState: { ...h.vs, btnAdd: '1' },
      };
    },
    'GVTransData:select': async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const t = await h.table('GVTransData');
        const row = t.rows.find((r) => t.get(r, 'LineCode') === h.arg) ?? noKey();
        out.set.TbName = { value: parseString(t.get(row, 'Name')) };
        out.set.TbDescription = { value: parseString(t.get(row, 'Description')) };
        await select(h, out, 'DdlInputType', parseString(t.get(row, 'InputType')));
        const p = parameterInputType(out.set.DdlInputType.value);
        for (const [k, x] of Object.entries(p.set ?? {})) out.set[k] = { ...out.set[k], ...x };
        out.set.TbMinValue = { value: parseString(t.get(row, 'MinValue')) };
        out.set.TbMaxValue = { value: parseString(t.get(row, 'MaxValue')) };
        out.set.TbPassValue = { value: parseString(t.get(row, 'PassValue')) };
        await select(h, out, 'DdlUom', parseStringZero(t.get(row, 'Uom')));
        await select(h, out, 'DdlResultDefined', parseString(t.get(row, 'ResultDefined')));
        await select(h, out, 'DDLInstrument', parseStringZero(t.get(row, 'Instrument')));
        // "DdlList.SelectedItem.Value = …": changes the value of the item that is selected, not the selection
        const lists = await h.options('DdlList');
        const at = Math.max(0, lists.findIndex((o) => o.value === v.DdlList));
        if (!lists[at]) throw NRE();
        out.set.DdlList = { options: lists.map((o, j) => (j === at ? { ...o, value: parseStringZero(t.get(row, 'List')) } : o)), index: at };
        out.viewState.btnAdd = '0';
        out.viewState.LineCode = parseString(t.get(row, 'LineCode'));
        out.set.BtnAdd = { text: '  Update  ' };
      });
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridRemove(h, 'GVTransData', 'LineCode', h.arg) } } }),
  },
};

/** What a handler gets besides the values: list items, the grid's DataTable, ViewState, the grid command's key. */
export function eventHelpers(spec, ctx, v, { viewState = {}, arg = '', index = -1, ui = {} } = {}) {
  let state = null;
  const byId = (id) => spec.controls.find((c) => c.id === id);
  const h = {
    spec,
    ctx,
    vs: viewState,
    arg: netString(arg),
    index, // the grid row clicked (GridViewDeleteEventArgs.RowIndex)
    fill: (sql, params) => fill(sql, 'Select A Value', params),
    control: (id) => spec.controls.find((c) => c.id === id),
    /** a control as the page shows it now (posted by the client: visible / enabled / text), else as in the markup */
    ui(id) {
      const c = byId(id);
      const a = c?.attrs ?? {};
      return { visible: a.visible?.toLowerCase() !== 'false', enabled: a.enabled?.toLowerCase() !== 'false', text: c?.text ?? '', ...(ui[id] ?? {}) };
    },
    /** Control.Visible as read in code: false when the control or any panel around it is hidden */
    shown(id) {
      for (let c = byId(id); c; c = c.parent ? byId(c.parent) : null) if (!h.ui(c.id).visible) return false;
      return true;
    },
    /** current items of a dropdown: the page's own refill if it has one, the posted items, else as the form was built */
    async options(id) {
      const own = PAGE_LISTS[spec.file]?.[id];
      if (own) return own(v, h);
      if (Array.isArray(ui[id]?.options)) return ui[id].options;
      state ??= await newFormState(spec, ctx);
      return state.controls.find((c) => c.id === id)?.options ?? [];
    },
    /** the grid's DataTable: the posted rows, or the rows given (e.g. after the page rewrote them) */
    async table(gridId, given) {
      const rows = (Array.isArray(given) ? given : Array.isArray(v[gridId]) ? v[gridId] : []).map((r) => Object.fromEntries(Object.entries(r ?? {}).map(([k, x]) => [k, netString(x)])));
      return gridTable(h.control(gridId), rows);
    },
  };
  return h;
}

/** ParameterForm.DdlInputType_SelectedIndexChanged */
function parameterInputType(type) {
  const map = { bit: [false, false, 'System'], text: [false, false, 'User'], numeric: [true, false, 'System'], image: [false, false, 'User'], list: [false, true, 'User'] };
  const m = map[type];
  return m ? { set: { MinMaxPanel: { visible: m[0] }, ListPanel: { visible: m[1] }, DdlResultDefined: { value: m[2] } } } : {};
}

// ---- custom Save / Display (TitleControl.btnsaveHandler, ViewControl.displayHandler) -------------------------------

/** Page_Load code after the form is built and cleared: (controls, ctx). */
/** display(key) code of a page around AU.Display: { before(controls, row, ctx), after(controls, row, ctx) } */
export const PAGE_DISPLAY = {};

export const PAGE_LOAD = {
  // TBUser = logged-in user id (disabled, so the posted value is never used), PrimaryKey = user code
  'View/Authorization/ChangePasswordForm.aspx': (controls, ctx) => {
    Object.assign(controls.find((c) => c.id === 'TBUser'), { value: netString(ctx.userId), enabled: false });
    controls.find((c) => c.id === 'PrimaryKey').value = netString(ctx.userCode);
  },
};

/** Pages whose list opens records through their own display(key): the record status does not lock the form. */
export const CUSTOM_DISPLAY = new Set([
  'View/BusinessSetup/BusinessUnitForm.aspx',
  'View/Settings/EmployeeForm.aspx',
  'View/BusinessSetup/StorageAreaForm.aspx',
  'View/Settings/WorkCenterAvailabilityForm.aspx',
  'View/MaterialSetup/MaterialBarcode.aspx',
  'View/BusinessSetup/TaxCategoryForm.aspx',
  'View/MaterialSetup/MaterialForm.aspx',
  'View/ProductionSetup/RoutingForm.aspx',
]);

/**
 * Save handlers that replace the engine's: (values, helpers) -> { ok, message?, alert?, key?, set?, logout? }.
 * ok/message are TitleControl.Success / Message (ok: success alert, the form is cleared unless CallNewOnSave = false;
 * not ok: the message as an error); alert is what the page itself showed; logout ends the session (the page cleared
 * UserId/UserCode and redirected to the login page).
 */
/** Delete handlers (TitleControl.btndeleteHandler): (values, helpers with .remark) -> { ok, message } */
export const PAGE_CANCEL = {};
/** Update handlers that replace the engine's (TitleControl.btnupdateHandler): same shape as PAGE_SAVE. */
export const PAGE_UPDATE = {};
const p2 = (n) => String(n).padStart(2, '0');

export const PAGE_SAVE = {
  'View/Authorization/ChangePasswordForm.aspx': async (v, h) => {
    const out = { ok: true, message: 'Record Created Successfully', set: {} };
    if (v.TBCurPass !== '' && v.TBNewPass === v.TBRetypePass) {
      const code = await changePassword({ userId: netString(h.ctx.userId), current: v.TBCurPass, next: v.TBNewPass });
      if (code === 0) {
        out.alert = errorMsg('Pasword must be 8 character long, Includes  number and special character');
        Object.assign(out.set, { TBNewPass: { value: '' }, TBRetypePass: { value: '' } });
      } else if (code === 6) {
        out.alert = errorMsg('Current Password is wrong!!');
        out.set.TBCurPass = { value: '' };
      } else return { ok: true, message: 'Password Changed!!', logout: true };
    } else out.alert = errorMsg('Make sure that current password is not blank and retype password is correct');
    return out;
  },
  'View/Authorization/ResetPasswordForm.aspx': async (v) => {
    if (v.DDLUser === '') return { ok: false, message: ' Please Select a User' };
    if (v.TBNewPass.trim() === '') return { ok: false, message: 'Password cant be blank' };
    const out = { ok: true, message: 'Record Created Successfully', set: {} };
    if (v.TBNewPass === v.TBRetypePass) {
      // the list's values are user codes, looked up as UserID (as the original did)
      if ((await resetPassword({ userId: v.DDLUser, next: v.TBNewPass })) === 0) {
        out.alert = errorMsg('Pasword must be 8 character long, Includes  number and special character');
        Object.assign(out.set, { TBNewPass: { value: '' }, TBRetypePass: { value: '' } });
      } else return { ok: true, message: 'Password Changed!!', logout: true };
    } else out.alert = errorMsg('Make sure that New password is not blank and retype password is correct');
    return out;
  },
  // AActions.Save(TopPanel, "50", Settings.PasswordEncrypt): EventLog module "50"
  'View/Authorization/UsersForm.aspx': async (v, h) => {
    const key = await insert(h.spec, await collect(h.spec, h.raw ?? v, h.ctx, { encryptPass: Number(setting('PasswordEncrypt')) || 0 }), h.ctx, { module: '50' });
    return { ok: true, key, message: 'Record Created Successfully' };
  },
};

Object.assign(PAGE_INIT, {
  'View/Authorization/ResetPasswordForm.aspx': async (controls, vs, h) => {
    controls.find((c) => c.id === 'DDLUser').options = await h.fill("Select usercode,Concat(UserID, ' ',UserName)[userName] from Users order by UserID ");
  },
  // AVProductionCapture.ViewOpenJobCard
  'View/Settings/RoutingUpdateForm.aspx': async (controls, vs, h) => {
    controls.find((c) => c.id === 'DDLJobCard').options = await h.fill('Select psno, Alias from ProcessOrder where Status=1');
  },
});

/** AVProductionCapture.UpdateJobRouting: the job card's open routing steps are rebuilt from its route. The original
 *  concatenated the values into the SQL; they are numbers read from the database (the job card is checked to be one),
 *  so the same text is built, which keeps its errors for empty values ("Incorrect syntax near …"). */
async function updateJobRouting(jobCard) {
  const num = (x) => {
    const s = netString(x);
    if (!/^-?[\d.]*$/.test(s)) throw new Error('Incorrect syntax');
    return s;
  };
  if (!/^\d+$/.test(jobCard)) throw new Error(`Invalid column name '${jobCard}'.`);
  const routing = await scalar(`select Routing  from ProcessOrder where PSNO=${jobCard}`);
  if (routing === null || routing === undefined) throw NRE();
  const maxSeq = num(await scalar(`select Min(SeqNo) from ProcessRouting where PSNo=${jobCard} and Status =0`));
  const steps = await query(`select * from RoutingTrans where RouteCode=${num(routing)} and SeqNo>=${netNum(netDouble(maxSeq))}`);
  await transaction(async (tx) => {
    await execute(`Delete from ProcessRouting where PSNo=${jobCard} and Status =0 and SeqNo>=${maxSeq}`, {}, tx);
    for (const dr of steps) {
      await execute(`insert into ProcessRouting(PSNo,RouteCode,SeqNo ,ProcessCode,Status,ParameterCode,SetupParameter) Values(${jobCard},${num(routing)},${num(dr.SeqNo)},${num(dr.ProcessCode)},0,${num(dr.InspectionCheckList)},${num(dr.SetupCheckList)})`, {}, tx);
    }
  });
}

Object.assign(PAGE_EVENTS, {
  'View/Authorization/UsersForm.aspx': {
    // CBAllProcess_CheckedChanged: every process ticked / unticked
    CBAllProcess: async (v, h) => ({ set: { CheckBoxList1: { value: netBool(v.CBAllProcess) ? (await h.options('CheckBoxList1')).map((o) => o.value) : [] } } }),
  },
  'View/Settings/RoutingUpdateForm.aspx': {
    Go: async (v) => {
      const out = {};
      return guard(out, async () => {
        if (v.DDLJobCard === '') return;
        await updateJobRouting(v.DDLJobCard);
        out.success = true; // WrapperAvatar.SuccessAlert
      });
    },
  },
});

// ---- label printing pages ------------------------------------------------------------------------------------------

const scalarText = async (sql, params) => {
  const v = await scalar(sql, params);
  if (v === null || v === undefined) throw NRE(); // ExecuteScalar().ToString() on no row
  return netString(v); // DBNull.ToString() == ""
};

/** DataWrapper.GenerateMaterialSerialNo (no transaction): BU prefix + department prefix + yy + MM + the month's next
 *  number for the business unit (5 digits); the counter row is created, or every row of that month is bumped. The
 *  original concatenated the codes into the SQL; they are checked to be numbers (or empty, which keeps its error).
 *  Returns [serial number, the counter value used]. */
async function generateMaterialSerialNo(material, businessUnit, dept, noOfKeys = 1, now = new Date()) {
  const [m, bu, d] = [material, businessUnit, dept].map(digitsOrEmpty);
  const yy = String(now.getFullYear()).slice(-2);
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const buPrefix = bu !== '0' && bu !== '999' ? await scalarText(`select Prefix from BusinessUnit where BUCode=${bu}`) : '';
  const deptPrefix = d !== '0' ? await scalarText(`select Prefix from Department where DeptCode=${d}`) : '';
  const key = netString(await scalar(`Select Max(NextSerialNo) from SerialBarcode where BusinessUnit=${bu} and Year=${yy} and Month=${MM}`));
  if (key === '') {
    await execute(`Insert into SerialBarcode(Material,Month,Year,NextSerialNo,BusinessUnit,Department) values(${m},${MM},${yy},${1 + noOfKeys},${bu},${d})`);
    return [`${buPrefix}${deptPrefix}${yy}${MM}00001`.replaceAll(' ', ''), 1];
  }
  await execute(`Update SerialBarcode set  NextSerialNo=NextSerialNo+${noOfKeys} where BusinessUnit=${bu} and Year=${yy} and Month=${MM}`);
  return [`${buPrefix}${deptPrefix}${yy}${MM}${key.padStart(5, '0')}`.replaceAll(' ', ''), Number(key)];
}

/** TitleControl.GetCurrentPrinter() + the pages' "printer chosen?" check ("Select A Printer"). */
async function withPrinter(h, out, fn) {
  if (netString(h.printer) === '') {
    out.alert = errorMsg('Select A Printer');
    return;
  }
  await fn(await printerDetail(h.printer));
}

Object.assign(PAGE_DISPLAY, {
  // display(key): DdlDept set from the record, its areas filled, then AU.Display
  'View/BusinessSetup/StorageAreaForm.aspx': {
    async before(controls, row) {
      const dept = controls.find((c) => c.id === 'DdlDept');
      const want = netString(row.Department);
      if (!dept.options.some((o) => o.value === want)) throw notInList('DdlDept');
      dept.value = want;
      if (want !== '') controls.find((c) => c.id === 'DdlArea').options = await fill("select AreaCode,CONCAT(Name, ' - ', AreaCode) as Name from Area where Department=@d", 'Select A Value', { d: want });
    },
  },
  // display(key): department (+ its areas and locations), area (+ its locations, errors ignored), AU.Display,
  // then the reprint count
  'View/MaterialSetup/MaterialBarcode.aspx': {
    async before(controls, row) {
      const byId = (id) => controls.find((c) => c.id === id);
      const dept = byId('DDLFromDepartment');
      const want = netString(row.Department);
      if (!dept.options.some((o) => o.value === want)) throw notInList('DDLFromDepartment');
      dept.value = want;
      if (want !== '') {
        byId('DDLFromArea').options = await fill("select AreaCode,CONCAT(Name, ' - ', Alias) as Name from Area where Department =@d", 'Select A Value', { d: netInt(want) });
        byId('DDLLocation').options = await fill("select StorageCode,CONCAT(Name, ' - ', Alias) as Name from StorageArea where Department =@d", 'Select A Value', { d: netInt(want) });
      }
      if (netInt(row.Area) > 0) {
        const area = netString(row.Area);
        if (byId('DDLFromArea').options.some((o) => o.value === area)) {
          byId('DDLFromArea').value = area;
          byId('DDLLocation').options = await fill("select StorageCode,CONCAT(Name, ' - ', Alias) as Name from StorageArea where Area =@a", 'Select A Value', { a: netInt(area) });
        }
      }
    },
    async after(controls, row) {
      controls.find((c) => c.id === 'TbReprint').value = String(netInt(await scalar('Select Count(*) from BarcodePrintTrail where BarcodeNo=@b', { b: netString(row.BarcodeNo) })));
    },
  },
});

Object.assign(PAGE_SAVE, {
  // BTNSave_Click: Serial "1" when blank, AVMaterial.SaveData (serial number generated), then display(new key)
  'View/MaterialSetup/MaterialBarcode.aspx': async (v, h) => {
    try {
      const raw = { ...(h.raw ?? v) };
      if (netString(raw.SerialID) === '') raw.SerialID = '1';
      const ds = await collect(h.spec, raw, h.ctx);
      const t0 = ds.tables[0];
      const row = t0.rows[0];
      if (row) {
        const get = (k) => netString(row.get(t0.schema.col(k)?.name ?? k));
        row.set(t0.schema.col('Serial').name, (await generateMaterialSerialNo(get('Material'), get('BusinessUnit'), get('Department')))[0]);
      }
      const key = await insert(h.spec, ds, h.ctx);
      return { ok: true, key, message: 'Record Created Successfully', display: key };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },
});

/** Print handlers (TitleControl.btnprintHandler): (values, helpers with .printer) -> { alert?, success? } */
export const PAGE_PRINT = {
  'View/Settings/EmployeeForm.aspx': async (v, h) => {
    const out = {};
    return guard(out, () => withPrinter(h, out, (bp) => printLabel('employee', v.PrimaryKey, bp, h.ctx.userId)));
  },
  'View/BusinessSetup/StorageAreaForm.aspx': async (v, h) => {
    const out = {};
    return guard(out, () => withPrinter(h, out, (bp) => printLabel('storage', v.PrimaryKey, bp, h.ctx.userId)));
  },
  // print(): remark, printer chosen and online, the label for the document type, then the reprint trail
  'View/MaterialSetup/MaterialBarcode.aspx': async (v, h) => {
    if (v.TbRemark.trim() === '') return { alert: errorMsg('Enter Remark') };
    if (netString(h.printer) === '') return { alert: errorMsg(' Select A Printer') };
    if (!(await printerOnline(h.printer))) return { alert: errorMsg('Printer is Offline') };
    const bp = await printerDetail(h.printer);
    const docType = netInt(await scalar('Select DocType from Materialbarcode where barcodeNo=@b', { b: netString(v.PrimaryKey) }));
    // DocType 4001 (process order) -> in-process label (WRL); 3001 (GRAPO) and anything else -> GRN label
    await printLabel(docType === 4001 ? 'inprocess' : 'grn', v.PrimaryKey, bp, h.ctx.userId);
    await execute('Insert into BarcodePrintTrail(BarcodeNo,PrintedBy,Remark)Values(@b,@u,@r)', { b: netString(v.PrimaryKey), u: netString(h.ctx.userCode), r: v.TbRemark });
    return { success: true };
  },
};

Object.assign(PAGE_EVENTS, {
  'View/BusinessSetup/StorageAreaForm.aspx': {
    DdlDept: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DdlDept === '') return;
        out.set.DdlArea = { options: await h.fill("select AreaCode,CONCAT(Name, ' - ', AreaCode) as Name from Area where Department=@d", { d: v.DdlDept }), index: 0 };
      });
    },
    DDLType: async (v) => ({ set: { RackPanel: { visible: v.DDLType === '100' } } }),
  },
  'View/MaterialSetup/MaterialBarcode.aspx': {
    DDLFromDepartment: async (v, h) => {
      if (v.DDLFromDepartment === '') return {};
      const d = netInt(v.DDLFromDepartment);
      return {
        set: {
          DDLFromArea: { options: await h.fill("select AreaCode,CONCAT(Name, ' - ', Alias) as Name from Area where Department =@d", { d }), index: 0 },
          DDLLocation: { options: await h.fill("select StorageCode,CONCAT(Name, ' - ', Alias) as Name from StorageArea where Department =@d", { d }), index: 0 },
        },
      };
    },
    DDLFromArea: async (v, h) => (v.DDLFromArea === '' ? {} : { set: { DDLLocation: { options: await h.fill("select StorageCode,CONCAT(Name, ' - ', Alias) as Name from StorageArea where Area =@a", { a: netInt(v.DDLFromArea) }), index: 0 } } }),
    // ComboBox onIndexChangeHandler: the material's base UOM selected
    DDLMaterial: async (v, h) => {
      const mat = netString(v.DDLMaterial) === '0' ? '' : netString(v.DDLMaterial); // SelectedValue(): ParseStringZero
      if (mat === '') return {};
      const out = { set: {} };
      await select(h, out, 'DdlUom', await scalarText('select BaseUom from Material where MatCode = @m', { m: mat }));
      return out;
    },
  },
});

// ---- MaterialForm ---------------------------------------------------------------------------------------------------

const MATERIAL = 'View/MaterialSetup/MaterialForm.aspx';

Object.assign(PAGE_INIT, {
  // Page_Load: variant panel only with variant fields; advanced panels by Settings.AdvanceMaterial; sales/purchase by
  // POFinance/SOFinance; WRL always shows the variant and ledger panels
  [MATERIAL]: async (controls) => {
    const byId = (id) => controls.find((c) => c.id === id);
    const show = (id, visible) => {
      const c = byId(id);
      if (c) c.visible = visible;
    };
    if ((byId('DdlName')?.options?.length ?? 0) < 2) show('VariantPanel', false);
    if (Number(setting('AdvanceMaterial')) === 0) for (const p of ['BatchPanel', 'QCPanel', 'FifoPanel', 'packPanel', 'LedgerMaterial']) show(p, false);
    const fin = Number(setting('POFinance')) === 1 || Number(setting('SOFinance')) === 1;
    show('SalesConfigPanel', fin);
    show('PurchaseConfigPanel', fin);
    if (config.erp === 'WRL') {
      show('VariantPanel', true);
      show('LedgerMaterial', true);
    }
  },
});

PAGE_LISTS[MATERIAL] = {
  DdlName: (v, h) => (v.DDLGroup ? groupFields(h, v.DDLGroup) : h.fill('Select FieldCode ,Name from VariantField where Status=1')),
  DdlValue: (v, h) => (v.DdlName === '' || v.DdlName == null ? [] : h.fill("select Concat(Code,'~',isnull(Prefix,''))[Code],Name from VariantFieldValue where Field=@f", { f: toInt32(v.DdlName) })),
};

/** AVMM.FillModelCategory(category, model, type): categories of the type, and models whose Category = the type
 *  (as the original queried); AVMM.FillTypeSerialLogic */
async function materialTypeLists(h, type) {
  return {
    DdlMaterialCategory: { options: await h.fill("Select CategoryCode, concat(Name,' - ', Alias) [Name] from MaterialCategory where CategoryType= @t", { t: type }), index: 0 },
    DdlModel: { options: await h.fill("Select ModelCode, concat(Name,' - ', Alias) [Name] from Model where Category= @t", { t: type }), index: 0 },
    ddlTrackSerialLogic: { options: await h.fill('Select SerialCode, Name from SerialGenerationLogicHeader where Status=1 and Type= @t', { t: type }), index: 0 },
  };
}

Object.assign(PAGE_EVENTS, {
  [MATERIAL]: {
    DdlBaseUom: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        const text = await selectedText(h, 'DdlBaseUom', v.DdlBaseUom);
        await select(h, out, 'DdlPurchaseUom', v.DdlBaseUom);
        Object.assign(out.set, { TbPConvQty: { value: '1' }, LblPconvUom: { text } });
        await select(h, out, 'DdlSalesUom', v.DdlBaseUom);
        Object.assign(out.set, { TbSConvQty: { value: '1' }, LblSConvUom: { text }, LblReorderUom: { text }, lblReorderQtyUOM: { text } });
      });
    },
    DdlType: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DdlType !== '') Object.assign(out.set, await materialTypeLists(h, v.DdlType));
        else Object.assign(out.set, { DdlModel: { options: [] }, DdlMaterialCategory: { options: [] } }); // Items.Clear()
      });
    },
    DDLInspectionRequired: async (v) => (v.DDLInspectionRequired === 'False' ? { set: { DDLInspectionType: { index: 0 }, DDLInspectionCheckList: { index: 0 }, TBResetIn: { value: '' } } } : {}),
    DdlMaterialCategory: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DdlMaterialCategory === '') return;
        out.set.DdlModel = { options: await h.fill("Select ModelCode, concat(Name,' - ', Alias) [Name] from Model where Category= @c", { c: v.DdlMaterialCategory }), index: 0 };
        const tag = netString(await scalar('Select TagCode from MaterialCategory where CategoryCode= @c', { c: v.DdlMaterialCategory }));
        await select(h, out, 'DDLTag', tag === '0' ? '' : tag);
      });
    },
    // AVMM.GetModeilDetails: read and not used (an error still shows)
    DdlModel: async (v) => {
      const out = {};
      return guard(out, async () => {
        if (v.DdlModel !== '') await query('Select * from Model where ModelCode=@m', { m: v.DdlModel });
      });
    },
    DdlName: async (v, h) => ({ set: { DdlValue: { options: await PAGE_LISTS[MATERIAL].DdlValue(v, h), index: 0 } } }),
    DDLGroup: async (v, h) => ({ set: { DdlName: { options: await groupFields(h, v.DDLGroup), index: 0 } } }),
    BtnAdd: async (v, h) => {
      const out = { set: {} };
      const s = await variantAddStart(v, h, out, { byText: true });
      if (s.stop) return { ...out, ...s.stop };
      const { t, name, item } = s;
      if (t.rows.some((r) => t.get(r, 'ValueCode') === item.value)) return { ...out, alert: alertMsg('Value Already Added') };
      const parts = item.value.split('~');
      if (parts.length < 2) throw new Error('Index was outside the bounds of the array.');
      const row = t.newRow();
      t.set(row, 'RecNo', t.max('RecNo') + 1);
      t.set(row, 'RowID', t.max('RowID') + 1);
      t.set(row, 'MatCode', netLong(v.PrimaryKey));
      t.set(row, 'ValueCode', netInt(parts[0]));
      t.set(row, 'Prefix', parts[1].trim());
      t.set(row, 'Name', name);
      t.set(row, 'Value', item.text);
      const rows = [...t.rows, row];
      let alias = '';
      if (v.DdlModel !== '') {
        const m = (await selectedText(h, 'DdlModel', v.DdlModel)).split('~');
        if (m.length < 2) throw new Error('Index was outside the bounds of the array.');
        alias = `${m[1].trim()}A`;
      }
      alias += rows.map((r) => t.get(r, 'Prefix').trim()).join('');
      Object.assign(out.set, { GVTransData: { rows }, DdlName: { index: 0 }, DdlValue: { options: out.set.DdlValue?.options, index: 0 }, Alias: { value: alias } });
      return out;
    },
    'GVTransData:delete': async (v, h) => ({ set: { GVTransData: { rows: await gridDelete(h, 'GVTransData', h.arg) } } }),
    // btnLedgerMap_Click
    btnLedgerMap: async (v, h) => {
      if (v.ddlVendor === '' || v.DDlSerialLogic === '' || v.tbVendorMat.trim() === '') return { alert: errorMsg('Please fill all Value') };
      const t = await h.table('GVLedgerCode');
      if (t.rows.some((r) => t.get(r, 'VandorMatCode') === v.tbVendorMat.trim())) return { alert: alertMsg('Vandor Material Already Added') };
      const row = t.newRow();
      t.set(row, 'RecNo', t.max('RecNo') + 1);
      t.set(row, 'Ledger', v.ddlVendor);
      t.set(row, 'LedgerName', await selectedText(h, 'ddlVendor', v.ddlVendor));
      t.set(row, 'VandorMatCode', v.tbVendorMat);
      t.set(row, 'SerialLogic', v.DDlSerialLogic);
      t.set(row, 'SerialLogicName', await selectedText(h, 'DDlSerialLogic', v.DDlSerialLogic));
      t.set(row, 'MatCode', netLong(v.PrimaryKey));
      return { set: { GVLedgerCode: { rows: [...t.rows, row] }, tbVendorMat: { value: '' }, DDlSerialLogic: { index: 0 } } };
    },
    // GVLedgerCode_RowDeleting passes GVTransData: the variant grid's key at the ledger row's index, looked up in the
    // ledger table by the variant grid's key column (RowID), which it does not have
    'GVLedgerCode:delete': async (v, h) => {
      const variants = Array.isArray(v.GVTransData) ? v.GVTransData : [];
      const i = netInt(h.index);
      if (i < 0 || i >= variants.length) throw new Error('Index was out of range. Must be non-negative and less than the size of the collection.\r\nParameter name: index');
      throw new Error("Column 'RowID' does not belong to table .");
    },
  },
});

// ---- BillOfMaterial -------------------------------------------------------------------------------------------------

const BOM = 'View/MaterialSetup/BillOfMaterial.aspx';
// AVMM.FillMaterial(ddl, type) / FillMaterial(ddl)
const materialsOfType = (h, type) =>
  type === '' ? h.fill("Select MatCode,CONCAT(Name, '|', Alias) from Material Where Status=1") : h.fill("Select MatCode,CONCAT(Name, '|', Alias) from Material Where InventoryFlag=1 and Type = @t and Status=1", { t: type });
const scalarString = async (sql, params) => netString(await scalar(sql, params)); // WrapperAvatar.ParseString(ExecuteScalar)

// Lists the page refilled earlier in this form: ViewState notes which fill they hold (the original kept the items).
PAGE_LISTS[BOM] = {
  DDLInputMaterial: async (v, h) => (h.vs.__inMat === undefined ? (await newFormState(h.spec, h.ctx)).controls.find((c) => c.id === 'DDLInputMaterial').options : materialsOfType(h, h.vs.__inMat)),
  DDLOutputMaterial: async (v, h) => (h.vs.__outMat === undefined ? (await newFormState(h.spec, h.ctx)).controls.find((c) => c.id === 'DDLOutputMaterial').options : materialsOfType(h, h.vs.__outMat)),
  DDLRouting: async (v, h) => (h.vs.__routing === undefined ? [] : h.fill('Select RouteCode, Name from RoutingHeader where material=@m', { m: h.vs.__routing })),
};

/** DDLInputMaterial_SelectedIndexChanged: type and UOM from the material, its sub-routings, serial -> output scan */
async function bomInputMaterial(v, h, out) {
  if (v.DDLInputMaterial === '') return;
  const m = v.DDLInputMaterial;
  const type = netString(await scalar('Select [Type] from Material where MatCode=@m', { m }));
  await select(h, out, 'DDLInputMaterialType', type === '0' ? '' : type);
  await select(h, out, 'DdlInputUom', await scalarString('select BaseUom from Material where MatCode = @m', { m }));
  const routes = await h.fill('Select RouteCode, Name from RoutingHeader where material=@m', { m });
  out.viewState.__routing = m;
  if (routes.length <= 1) Object.assign(out.set, { DDLRouting: { options: routes, index: 0 }, SubRoutingPanel: { visible: false } });
  else Object.assign(out.set, { DDLRouting: { options: routes, ...(routes.length === 2 ? { index: 1 } : {}) }, SubRoutingPanel: { visible: true } });
  const serial = netBool(await scalar('select  Serial from Material where MatCode=@m', { m }));
  out.set.OutputScanPanel = { visible: serial };
  if (serial) out.set.TbInputQuantity = { value: '1' };
}

/** BtnInputAdd / BtnOutputAdd: add (or, after Select, update) a line of the input / output grid */
async function bomAddLine(v, h, side) {
  const input = side === 'in';
  const ids = input
    ? { grid: 'GVBOMInput', type: 'DDLInputMaterialType', mat: 'DDLInputMaterial', qty: 'TbInputQuantity', uom: 'DdlInputUom', mode: 'BOMINAdd', row: 'INRowID', btn: 'BtnInputAdd' }
    : { grid: 'GVOutput', type: 'DDLOutoutMaterialType', mat: 'DDLOutputMaterial', qty: 'TBOutputQty', uom: 'DDLOutputUom', mode: 'BOMOutAdd', row: 'OutRowID', btn: 'BtnOutputAdd' };
  const out = { set: {}, viewState: { ...h.vs } };
  return guard(out, async () => {
    // the input side reports every check with ErrorAlert, the output side the last two with Alert
    if (v[ids.type] === '') return void (out.alert = errorMsg('Please Select Material Type'));
    if (v[ids.mat] === '') return void (out.alert = errorMsg('Please Select Material'));
    if (v.DdlProcess === '') return void (out.alert = input ? errorMsg('Please Select Process') : alertMsg('Please Select Process'));
    if (v[ids.qty] === '') return void (out.alert = input ? errorMsg('Please Enter Qty') : alertMsg('Please Enter Qty'));
    const t = await h.table(ids.grid);
    const text = (id) => selectedText(h, id, v[id]);
    const fill = async (row, update) => {
      if (input && update) t.set(row, 'ProcessCode', v.DdlProcess); // the update branch sets it first (and again below)
      t.set(row, 'Type', await text(ids.type));
      t.set(row, 'MaterialDesc', await text(ids.mat));
      t.set(row, 'Material', v[ids.mat]);
      t.set(row, 'Qty', netDouble(v[ids.qty]));
      t.set(row, 'UomDesc', await text(ids.uom));
      t.set(row, 'Uom', v[ids.uom]);
      t.set(row, 'ProcessDesc', await text('DdlProcess'));
      t.set(row, 'ProcessCode', v.DdlProcess);
      if (input) {
        t.set(row, 'ScanReq', netBool(v.DDLInputScan));
        t.set(row, 'OutputScan', netBool(v.DDLOutputScan));
        t.set(row, 'RoutingCode', netInt(v.DDLRouting));
      }
    };
    let rows = t.rows;
    if (netBool(h.vs[ids.mode])) {
      if (rows.some((r) => t.get(r, 'Material') === v[ids.mat] && t.get(r, 'Qty') === v[ids.qty] && t.get(r, 'ProcessCode') === v.DdlProcess)) {
        out.alert = input ? errorMsg('Value Already Added') : alertMsg('Value Already Added');
        return;
      }
      const row = t.newRow();
      t.set(row, 'BOMCode', netInt(v.PrimaryKey));
      t.set(row, 'RowID', t.max('RowID') + 1);
      // the new line's columns in the original order (Type … RoutingCode)
      await fill(row);
      rows = [...rows, row];
    } else {
      const i = rows.findIndex((r) => t.get(r, 'RowID').trim() === parseString(h.vs[ids.row]).trim());
      if (i >= 0) {
        const row = { ...rows[i] };
        await fill(row, true);
        rows = rows.map((r, j) => (j === i ? row : r));
      }
    }
    Object.assign(out.set, { [ids.grid]: { rows }, [ids.mat]: { index: 0 }, [ids.qty]: { value: '' }, [ids.btn]: { text: ' ADD ' } });
    if (input) out.set.DDLOutputScan = { index: 0 };
    out.viewState[ids.mode] = '1';
  });
}

/** GVBOMInput / GVOutput SelectedIndexChanged: the line back into the editors, the Add button becomes Update */
async function bomSelectLine(v, h, side) {
  const input = side === 'in';
  const grid = input ? 'GVBOMInput' : 'GVOutput';
  const out = { set: {}, viewState: { ...h.vs } };
  return guard(out, async () => {
    const t = await h.table(grid);
    const row = t.rows.find((r) => t.get(r, 'RowID') === h.arg) ?? noKey();
    const typeId = input ? 'DDLInputMaterialType' : 'DDLOutoutMaterialType';
    // WrapperAvatar.SelectDropDown: by text, nothing when not listed
    const typeOpt = (await h.options(typeId)).find((o) => o.text === parseString(t.get(row, 'Type')));
    if (typeOpt) out.set[typeId] = { value: typeOpt.value };
    await select(h, out, 'DdlProcess', parseString(t.get(row, 'ProcessCode')));
    if (input) {
      await select(h, out, 'DDLInputMaterial', parseString(t.get(row, 'Material')));
      await bomInputMaterial({ ...v, DDLInputMaterial: parseString(t.get(row, 'Material')) }, h, out);
      out.set.TbInputQuantity = { value: parseString(t.get(row, 'Qty')) };
      await select(h, out, 'DdlInputUom', parseString(t.get(row, 'Uom')));
      await select(h, out, 'DDLInputScan', String(netInt(t.get(row, 'ScanReq'))));
      await select(h, out, 'DDLOutputScan', String(netInt(t.get(row, 'OutputScan'))));
      Object.assign(out.viewState, { BOMINAdd: '0', INRowID: parseString(t.get(row, 'RowID')) });
      out.set.BtnInputAdd = { text: '  Update  ' };
      if (out.set.SubRoutingPanel?.visible) {
        const opts = out.set.DDLRouting.options;
        const want = parseString(t.get(row, 'RoutingCode'));
        if (!opts.some((o) => o.value === want)) throw notInList('DDLRouting');
        out.set.DDLRouting = { options: opts, value: want };
      }
    } else {
      await select(h, out, 'DDLOutputMaterial', parseString(t.get(row, 'Material')));
      out.set.TBOutputQty = { value: parseString(t.get(row, 'Qty')) };
      await select(h, out, 'DDLOutputUom', parseString(t.get(row, 'Uom')));
      Object.assign(out.viewState, { BOMOutAdd: '0', OutRowID: parseString(t.get(row, 'RowID')) });
      out.set.BtnOutputAdd = { text: '  Update  ' };
    }
  });
}

Object.assign(PAGE_INIT, {
  [BOM]: async (controls, vs) => Object.assign(vs, { BOMINAdd: '1', BOMOutAdd: '1' }),
});

Object.assign(PAGE_EVENTS, {
  [BOM]: {
    DDLMaterial: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLMaterial === '') return;
        await select(h, out, 'DDLBaseUom', await scalarText('select BaseUom from Material where MatCode = @m', { m: v.DDLMaterial }));
      });
    },
    DDLInputMaterialType: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs, __inMat: v.DDLInputMaterialType } };
      return guard(out, async () => {
        out.set.DDLInputMaterial = { options: await materialsOfType(h, v.DDLInputMaterialType), index: 0 };
      });
    },
    DDLOutoutMaterialType: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs, __outMat: v.DDLOutoutMaterialType } };
      return guard(out, async () => {
        out.set.DDLOutputMaterial = { options: await materialsOfType(h, v.DDLOutoutMaterialType), index: 0 };
      });
    },
    DDLInputMaterial: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, () => bomInputMaterial(v, h, out));
    },
    DDLOutputMaterial: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLOutputMaterial === '') return;
        const m = v.DDLOutputMaterial;
        await select(h, out, 'DDLOutputUom', await scalarString('select BaseUom from Material where MatCode = @m', { m }));
        const type = netString(await scalar('Select [Type] from Material where MatCode=@m', { m }));
        await select(h, out, 'DDLOutoutMaterialType', type === '0' ? '' : type);
        if (netBool(await scalar('select  Serial from Material where MatCode=@m', { m }))) out.set.TBOutputQty = { value: '1' };
      });
    },
    BtnInputAdd: (v, h) => bomAddLine(v, h, 'in'),
    BtnOutputAdd: (v, h) => bomAddLine(v, h, 'out'),
    'GVBOMInput:select': (v, h) => bomSelectLine(v, h, 'in'),
    'GVOutput:select': (v, h) => bomSelectLine(v, h, 'out'),
    'GVBOMInput:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVBOMInput = { rows: await gridDelete(h, 'GVBOMInput', h.arg) };
      });
    },
    'GVOutput:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVOutput = { rows: await gridDelete(h, 'GVOutput', h.arg) };
      });
    },
    // GVBOMInput_RowCommand "AlternativeMat": the line's alternative materials into the popup
    'GVBOMInput:AlternativeMat': async (v, h) => {
      const t = await h.table('GVBOMInput');
      const row = t.rows[netInt(h.index)];
      if (!row) throw new Error('Index was out of range. Must be non-negative and less than the size of the collection.\r\nParameter name: index');
      const key = t.get(row, 'RowID');
      const alt = await h.table('GVAltMaterial');
      const current = alt.rows.filter((r) => alt.get(r, 'ROWID') === key);
      return { set: { GVCurrentAltMaterial: { rows: current }, AltMaterialPanel: { visible: true } }, viewState: { ...h.vs, ROWID: key } };
    },
    btnAltPanelClose: async () => ({ set: { AltMaterialPanel: { visible: false } } }),
    btnAddAltMaterial: async (v, h) => {
      if (v.DDlAltInputMaterial === '') return { alert: errorMsg('Please select a Material') };
      const cur = await h.table('GVAltMaterial', Array.isArray(v.GVCurrentAltMaterial) ? v.GVCurrentAltMaterial : []);
      if (cur.rows.some((r) => cur.get(r, 'Material') === v.DDlAltInputMaterial)) return { alert: errorMsg('Already Added') };
      const row = cur.newRow();
      cur.set(row, 'BOMCode', netInt(v.PrimaryKey));
      cur.set(row, 'RowID', netInt(h.vs.ROWID));
      cur.set(row, 'Material', v.DDlAltInputMaterial);
      cur.set(row, 'Description', await selectedText(h, 'DDlAltInputMaterial', v.DDlAltInputMaterial));
      return { set: { GVCurrentAltMaterial: { rows: [...cur.rows, row] }, DDlAltInputMaterial: { index: 0 } } };
    },
    // btnUpdateAltMaterial: the line's alternatives replaced by the popup's
    btnUpdateAltMaterial: async (v, h) => {
      const alt = await h.table('GVAltMaterial');
      const cur = await h.table('GVAltMaterial', Array.isArray(v.GVCurrentAltMaterial) ? v.GVCurrentAltMaterial : []);
      const id = parseString(h.vs.ROWID);
      const rows = [...alt.rows.filter((r) => alt.get(r, 'RowID') !== id), ...cur.rows.filter((r) => cur.get(r, 'RowID') === id)];
      return { set: { GVAltMaterial: { rows } }, success: true };
    },
    // GVCurrentAltMaterial_RowDeleting: removed from the popup; the main list keeps rows that differ in RowID AND
    // BOMCode AND Material (as written) plus the popup's rows of this line; a saved BOM loses it at once
    'GVCurrentAltMaterial:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        const cur = await h.table('GVAltMaterial', Array.isArray(v.GVCurrentAltMaterial) ? v.GVCurrentAltMaterial : []);
        const r0 = cur.rows[netInt(h.index)];
        if (!r0) throw new Error('Index was out of range. Must be non-negative and less than the size of the collection.\r\nParameter name: index');
        const [bomCode, rowId, material] = [cur.get(r0, 'BOMCode'), cur.get(r0, 'RowID'), cur.get(r0, 'Material')];
        const left = cur.rows.filter((r) => cur.get(r, 'Material') !== material);
        const alt = await h.table('GVAltMaterial');
        const rows = [...alt.rows.filter((r) => alt.get(r, 'RowID') !== rowId && alt.get(r, 'BomCode') !== bomCode && alt.get(r, 'Material') !== material), ...left.filter((r) => cur.get(r, 'RowID') === parseString(h.vs.ROWID))];
        Object.assign(out.set, { GVCurrentAltMaterial: { rows: left }, GVAltMaterial: { rows } });
        if (netInt(v.PrimaryKey) > 0) await execute('Delete from BOMInputAltMaterial where ROWID=@r and Material=@m and BOMCOde=@b', { r: rowId, m: material, b: bomCode });
      });
    },
  },
});

// ---- RoutingForm ----------------------------------------------------------------------------------------------------

const ROUTING = 'View/ProductionSetup/RoutingForm.aspx';
// Settings.RouteSeq (5 unless the Settings table has it); Math.DivRem by 0 throws
const routeSeq = () => (settingText('RouteSeq', null) === null ? 5 : setting('RouteSeq'));
const divRem = (i, d) => {
  if (d === 0) throw new Error('Attempted to divide by zero.');
  return i % d;
};
// Convert.ToInt32(decimal): to nearest, halves to even
const toInt32Even = (n) => {
  const f = Math.floor(n);
  return n - f === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(n);
};
const nextSeq = (t, trimRem) => {
  let i = toInt32Even(t.max('SeqNo')) + routeSeq();
  const rem = divRem(i, routeSeq());
  if (trimRem) i -= rem;
  return String(i);
};
// Path.GetExtension
const extensionOf = (p) => {
  const base = p.split(/[\\/]/).pop();
  const i = base.lastIndexOf('.');
  return i >= 0 && i < base.length - 1 ? base.slice(i) : '';
};
// AVMM.FillMaterialDropdown(ddl, model) / FillMaterialRouting(ddl) (operator precedence as written)
const routingMaterials = (h, model) =>
  model !== ''
    ? h.fill(`Select MatCode, CONCAT(Name, ' - ', Alias) as Name From Material where(Type >= 100 and Type < 200) or(Type >= 400 and Type < 500) and Model=${digitsOrEmpty(model)}`)
    : h.fill("Select MatCode, CONCAT(Name, ' - ', Alias) as Name From Material where (Type>=100 and Type<200) or (Type>=400 and Type<500) and Status=1");

Object.assign(PAGE_INIT, {
  [ROUTING]: async (controls, vs) => Object.assign(vs, { add: 'True' }),
});

Object.assign(PAGE_DISPLAY, {
  // display(key): next SeqNo after the last line, the model's materials, then AU.Display
  [ROUTING]: {
    async before(controls, row) {
      const byId = (id) => controls.find((c) => c.id === id);
      const max = await scalar('Select max(SeqNo) from RoutingTrans where RouteCode=@r', { r: row.RouteCode });
      if (max !== null && max !== undefined) {
        const i = toInt32Even(Number(max)) + routeSeq();
        divRem(i, routeSeq());
        byId('TBSeq').value = String(i);
      }
      if (netInt(row.Model) > 0) {
        const model = byId('DDLModel');
        const want = netString(row.Model);
        if (!model.options.some((o) => o.value === want)) throw notInList('DDLModel');
        model.value = want;
        byId('DDLMaterial').options = await fill(`Select MatCode, CONCAT(Name, ' - ', Alias) as Name From Material where(Type >= 100 and Type < 200) or(Type >= 400 and Type < 500) and Model=${want}`);
      }
    },
  },
});

/** BTNInstruction / BTNGuide: the row's SeqNo cell into ViewState, the popup opened */
async function routingPopup(v, h, panel, seqLabel, codeLabel) {
  const out = { set: {}, viewState: { ...h.vs } };
  return guard(out, async () => {
    const t = await h.table('GVTransData');
    const row = t.rows[netInt(h.index)] ?? noKey();
    Object.assign(out.viewState, { SeqNo: t.get(row, 'SeqNo'), RouteCode: String(netInt(v.PrimaryKey)) });
    Object.assign(out.set, { [panel]: { visible: true }, [seqLabel]: { text: `Seq No. : ${out.viewState.SeqNo}` }, [codeLabel]: { text: `Routing Code :${v.PrimaryKey}` } });
  });
}

Object.assign(PAGE_EVENTS, {
  [ROUTING]: {
    DDLModel: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.DDLMaterial = { options: await routingMaterials(h, v.DDLModel), index: 0 };
      });
    },
    BtnAdd: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const t = await h.table('GVTransData');
        const add = netBool(h.vs.add);
        if (add && t.rows.some((r) => t.get(r, 'ProcessCode') === v.DdlProcess)) return void (out.alert = alertMsg('Value Already Added'));
        if (netDouble(v.TbMaxHoldP) < netDouble(v.TbMinHoldP)) return void (out.alert = errorMsg('Minimum Hold Period cannot be greater than Maximum Hold Period'));
        if (netDouble(v.TBSeq) <= 0) return void (out.alert = errorMsg('Please Enter SeqNo'));
        const at = t.rows.findIndex((r) => t.get(r, 'SeqNo') === v.TBSeq.trim());
        if (at >= 0 && add) return void (out.alert = errorMsg('SeqNo already Exist'));
        const fields = async (row) => {
          t.set(row, 'RouteCode', netInt(v.PrimaryKey));
          if (add) t.set(row, 'SeqNo', netInt(v.TBSeq));
          t.set(row, 'ProcessCode', v.DdlProcess);
          t.set(row, 'Process', await selectedText(h, 'DdlProcess', v.DdlProcess));
          t.set(row, 'ProcessTime', netInt(v.TbProcessTime));
          t.set(row, 'MachineSetupTime', netInt(v.TbSetupTime));
          t.set(row, 'SetupCheckList', netInt(v.DDLCheckList));
          t.set(row, 'MatConsession', netBool(v.DdlConsession));
          t.set(row, 'MaterialSeq', netBool(v.DDLMaterialSeq));
          t.set(row, 'MinHoldPeriod', netDouble(v.TbMinHoldP));
          t.set(row, 'MaxHoldPeriod', netDouble(v.TbMaxHoldP));
          t.set(row, 'ProcessSeq', netBool(v.DDLValidate));
          t.set(row, 'HandlingUnit', netBool(v.DDLPallet));
          t.set(row, 'InspectionCheckList', netInt(v.DDLInspection));
          t.set(row, 'BatchNoFreq', netInt(v.ddlBatchFreq));
          t.set(row, 'DrawingNo', v.TBDrawaingNo);
          t.set(row, 'StageLabel', netBool(v.DDLStageLabel));
          t.set(row, 'StageQC', netBool(v.DDLStageQC));
          t.set(row, 'PrintNextStageLabel', netBool(v.DDLNextStageLabel));
          t.set(row, 'InputMaterialQC', netInt(v.DDLQCStatus));
          t.set(row, 'AutoProcessing', netInt(v.TBAutoProcess));
          t.set(row, 'NoOfCopy', netInt(v.TbNoOfCopy));
          t.set(row, 'StationScan', netInt(v.DDLWorkStation));
        };
        let rows = t.rows;
        if (at >= 0) {
          const row = { ...rows[at] };
          await fields(row);
          rows = rows.map((r, j) => (j === at ? row : r));
        }
        if (add) {
          const row = t.newRow();
          await fields(row);
          rows = [...rows, row];
        }
        Object.assign(out.set, { GVTransData: { rows, visible: true }, DdlProcess: { index: 0 }, TbProcessTime: { value: '' }, TbSetupTime: { value: '' }, DDLCheckList: { index: 0 }, ddlBatchFreq: { index: 0 }, TbMaxHoldP: { value: '' }, TbMinHoldP: { value: '' } });
        out.set.TBSeq = { value: nextSeq(await h.table('GVTransData', rows), true) };
        out.viewState.add = 'True';
        out.set.BtnAdd = { text: '    ADD    ' };
        out.success = true;
      });
    },
    'GVTransData:delete': async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const rows = await gridDelete(h, 'GVTransData', h.arg);
        Object.assign(out.set, { GVTransData: { rows }, DdlProcess: { index: 0 }, TbProcessTime: { value: '' }, TbSetupTime: { value: '' }, DDLCheckList: { index: 0 }, TbMaxHoldP: { value: '' }, TbMinHoldP: { value: '' }, TBAutoProcess: { value: '' } });
        out.set.TBSeq = { value: nextSeq(await h.table('GVTransData', rows), false) };
        out.viewState.add = 'True';
        out.set.BtnAdd = { text: '    ADD    ' };
      });
    },
    // GVTransData_SelectedIndexChanged: the line back into the editors, Add becomes Update
    'GVTransData:select': async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const t = await h.table('GVTransData');
        const i = t.rows.findIndex((r) => t.get(r, 'SeqNo') === h.arg);
        const row = i >= 0 ? t.rows[i] : t.newRow(); // not found: a detached new row (all DBNull)
        const get = (c) => parseString(t.get(row, c));
        const intOf = (c) => String(netInt(t.get(row, c)));
        if (i >= 0) {
          const changed = { ...row };
          t.set(changed, 'RouteCode', netInt(v.PrimaryKey));
          out.set.GVTransData = { rows: t.rows.map((r, j) => (j === i ? changed : r)) };
        }
        out.set.TBSeq = { value: get('SeqNo') };
        await select(h, out, 'DdlProcess', get('ProcessCode'));
        // DdlProcess.SelectedItem.Text = row["Process"]: the list item itself is renamed
        out.set.DdlProcess = { options: (await h.options('DdlProcess')).map((o) => (o.value === get('ProcessCode') ? { ...o, text: netString(t.get(row, 'Process')) } : o)), value: get('ProcessCode') };
        Object.assign(out.set, { TbProcessTime: { value: get('ProcessTime') }, TbSetupTime: { value: get('MachineSetupTime') } });
        const setup = parseStringZero(t.get(row, 'SetupCheckList'));
        if (setup !== '') out.set.DDLCheckList = { options: await h.fill(`Select ParameterCode, CONCAT(Name, ' - ', Alias) as Name From ParameterHeader where (Status=1 and Type =3) or ParameterCode=${digitsOrEmpty(setup)} order by Name`) };
        await select(h, out, 'DDLCheckList', setup);
        await select(h, out, 'DdlConsession', intOf('MatConsession'));
        await select(h, out, 'DDLMaterialSeq', intOf('MaterialSeq'));
        Object.assign(out.set, { TbMinHoldP: { value: get('MinHoldPeriod') }, TbMaxHoldP: { value: get('MaxHoldPeriod') } });
        await select(h, out, 'DDLValidate', intOf('ProcessSeq'));
        await select(h, out, 'DDLPallet', intOf('HandlingUnit'));
        const insp = parseStringZero(t.get(row, 'InspectionCheckList'));
        if (insp !== '') out.set.DDLInspection = { options: await h.fill(`Select ParameterCode, CONCAT(Name, ' - ', Alias) as Name From ParameterHeader where (Status=1 and Type in(6,7,8,2)) or ParameterCode=${digitsOrEmpty(insp)} order by Name`) };
        await select(h, out, 'DDLInspection', insp);
        out.set.TBDrawaingNo = { value: get('DrawingNo') };
        await select(h, out, 'DDLStageLabel', intOf('StageLabel'));
        await select(h, out, 'DDLStageQC', intOf('StageQC'));
        await select(h, out, 'DDLNextStageLabel', intOf('PrintNextStageLabel'));
        await select(h, out, 'ddlBatchFreq', intOf('BatchNoFreq'));
        await select(h, out, 'DDLQCStatus', intOf('InputMaterialQC'));
        out.set.TBAutoProcess = { value: intOf('AutoProcessing') };
        out.set.TbNoOfCopy = { value: intOf('NoOfCopy') };
        await select(h, out, 'DDLWorkStation', intOf('StationScan'));
        out.viewState.add = 'False';
        out.set.BtnAdd = { text: '  Update  ' };
      });
    },
    'GVTransData:Instruction': (v, h) => routingPopup(v, h, 'InsructionPanel', 'LblInstractionSeqNo', 'LBLInstructionRoutingCode'),
    'GVTransData:Guide': (v, h) => routingPopup(v, h, 'GuidePanel', 'LblGuideSeqNo', 'LblGuideRoutingCode'),
    IMBInstructionClose: async () => ({ set: { InsructionPanel: { visible: false } } }),
    IMBGuideClose: async () => ({ set: { GuidePanel: { visible: false } } }),
    // BtnInstructionAdd_Click (no try/catch in the original)
    BtnInstructionAdd: async (v, h) => {
      if (v.TBInstruction === '') return { alert: alertMsg('Kindly enter Instruction') };
      const t = await h.table('GVInstruction');
      const row = t.newRow();
      t.set(row, 'RouteCode', netInt(h.vs.RouteCode));
      t.set(row, 'RowID', t.max('RowID') + 1);
      t.set(row, 'SeqNo', netDouble(h.vs.SeqNo));
      t.set(row, 'Instruction', v.TBInstruction);
      return { set: { GVInstruction: { rows: [...t.rows, row], visible: true }, TBInstruction: { value: '' } } };
    },
    'GVInstruction:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVInstruction = { rows: await gridDelete(h, 'GVInstruction', h.arg) };
      });
    },
    'GVGuide:delete': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GVGuide = { rows: await gridDelete(h, 'GVGuide', h.arg) };
      });
    },
    DDLExistingGuide: async (v) => ({ set: { TBGuideFilePath: { value: v.DDLExistingGuide } } }),
    // DDLGuideFileType_SelectedIndexChanged: "" empties the type list itself (as written)
    DDLGuideFileType: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLGuideFileType !== '') out.set.DDLExistingGuide = { options: await h.fill(`Select Distinct GuidePath,Description from RoutingGuide where guidetype=${digitsOrEmpty(v.DDLGuideFileType)}`), index: 0 };
        else out.set.DDLGuideFileType = { options: [] };
      });
    },
    // BTNGuideAdd_Click: an uploaded file is saved as ~/GuideFiles/<description><ext>, or an existing guide is reused
    BTNGuideAdd: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.TBGuideDesc === '') return void (out.alert = alertMsg('Kindly enter description'));
        const typeText = () => selectedText(h, 'DDLGuideFileType', v.DDLGuideFileType);
        const wrongType = async (ext) => ext.toUpperCase().replace('.', '') !== (await typeText()).toUpperCase().trim();
        let path = netString(v.TBGuideFilePath);
        const file = v.FileUploadGuide;
        if (path === '' && file?.name && file.data) {
          const ext = extensionOf(file.name);
          const name = v.TBGuideDesc.replaceAll(' ', '').replaceAll('~', '').replaceAll('.', '').replaceAll(',', '').replaceAll('#', '') + ext;
          if (await wrongType(ext)) {
            out.set.TBGuideFilePath = { value: '' };
            return void (out.alert = alertMsg(`Kindly select a file with Extention as ${await typeText()}`));
          }
          const target = resolvePath(config.guideFilesDir, name);
          if (dirname(target) !== resolvePath(config.guideFilesDir)) throw new Error(`Could not find a part of the path '${target}'.`);
          await mkdir(config.guideFilesDir, { recursive: true });
          await writeFile(target, Buffer.from(file.data, 'base64'));
          path = `~/GuideFiles/${name}`;
          out.set.TBGuideFilePath = { value: path };
        }
        if (path === '') return void (out.alert = alertMsg('Please Select a File'));
        if (await wrongType(extensionOf(path))) {
          out.set.TBGuideFilePath = { value: '' };
          return void (out.alert = alertMsg(`Kindly select a file with Extention as ${await typeText()}`));
        }
        const t = await h.table('GVGuide');
        const row = t.newRow();
        t.set(row, 'RouteCode', netInt(h.vs.RouteCode));
        t.set(row, 'RowID', t.max('RowID') + 1);
        t.set(row, 'SeqNo', netDouble(h.vs.SeqNo));
        t.set(row, 'Description', v.TBGuideDesc);
        t.set(row, 'GuideType', v.DDLGuideFileType);
        t.set(row, 'GuidePath', path);
        Object.assign(out.set, { GVGuide: { rows: [...t.rows, row], visible: true }, TBGuideFilePath: { value: '' }, TBGuideDesc: { value: '' } });
      });
    },
  },
});

// ---- RoutingGuideForm: Routing's instruction / guide popups on an existing routing (display: AU.Display only) -------

const ROUTING_GUIDE = 'View/ProductionSetup/RoutingGuideForm.aspx';
CUSTOM_DISPLAY.add(ROUTING_GUIDE);
PAGE_EVENTS[ROUTING_GUIDE] = Object.fromEntries(
  ['DDLModel', 'GVTransData:Instruction', 'GVTransData:Guide', 'IMBInstructionClose', 'IMBGuideClose', 'BtnInstructionAdd', 'GVInstruction:delete', 'GVGuide:delete', 'DDLExistingGuide', 'DDLGuideFileType', 'BTNGuideAdd'].map((k) => [k, PAGE_EVENTS[ROUTING][k]]),
);

// ---- SerialGenerationLogicForm ---------------------------------------------------------------------------------------

const SERIAL = 'View/MaterialSetup/SerialGenerationLogicForm.aspx';
CUSTOM_DISPLAY.add(SERIAL);
/** DdlName value "<VariantCode>-<VariantType>": the type (Split('-')[1] throws without a "-") */
const variantType = (value) => {
  const parts = value.split('-');
  if (parts.length < 2) throw new Error('Index was outside the bounds of the array.');
  return netInt(parts[1]);
};
// DdlName_SelectedIndexChanged: 1 = date format, 2 = serial, 3 = fixed value
const serialPanels = (value) => {
  const type = value === '' ? 0 : variantType(value);
  return { dateFormat: { visible: type === 1 }, Serial: { visible: type === 2 }, Value: { visible: type === 3 } };
};
/** the StartingNo of the serial-number part (VariantCode 10), "" when there is none */
const serialStart = (rows, get) => netString(get(rows.find((r) => netString(get(r, 'VariantCode')) === '10') ?? null, 'StartingNo'));

Object.assign(PAGE_DISPLAY, {
  // display(key): AU.Display, then ViewState["Serial"] = the serial part's StartingNo (compared on update)
  [SERIAL]: {
    async after(controls, row, ctx, vs) {
      const rows = await query('Select VariantCode, StartingNo from SerialGenerationLogicDetail where SerialCode=@k', { k: row.SerialCode });
      vs.Serial = serialStart(rows, (r, c) => (r ? toText(r[c]) : ''));
    },
  },
});

Object.assign(PAGE_UPDATE, {
  // BTNUpdate_Click: UpdateDataWithoutTransaction; a changed serial start resets NextSerialNo of this year's serials
  // of every material using the logic
  [SERIAL]: async (v, h) => {
    try {
      const ds = await collect(h.spec, h.raw ?? v, h.ctx);
      const det = ds.tables.find((t) => t.schema.name.toLowerCase() === 'serialgenerationlogicdetail');
      const serial = det ? serialStart(det.rows, (r, c) => (r ? toText(r.get(det.schema.col(c).name)) : '')) : '';
      const key = await update(h.spec, ds, h.ctx, {
        plain: true,
        then: async (tx) => {
          const mats = await query('Select Matcode from Material where AssetTagType=@k', { k: netString(v.PrimaryKey) }, tx);
          if (netLong(h.vs.Serial) === netLong(serial)) return;
          const yy = String(new Date().getFullYear()).slice(-2);
          for (const m of mats) await execute(`update SerialBarcode set NextSerialNo=@n where  AssetId=1 and Material=@m and BusinessUnit=@bu and Year=${yy}`, { n: netLong(serial), m: m.Matcode, bu: netString(h.ctx.businessUnit) }, tx);
        },
      });
      return { ok: true, key, message: '' };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },
});

Object.assign(PAGE_EVENTS, {
  [SERIAL]: {
    DdlName: async (v) => ({ set: serialPanels(v.DdlName) }),
    DdlType: async () => ({}),
    BtnAdd: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DdlName === '') return void (out.alert = errorMsg('Please Select a Name'));
        const type = variantType(v.DdlName);
        if (type === 1 && v.tbFormat.trim() === '') return void (out.alert = errorMsg('Please Enter a Format'));
        if (type === 2 && v.tbLenth.trim() === '') return void (out.alert = errorMsg('Please Enter a Length'));
        if (type === 3 && v.tbValue.trim() === '') return void (out.alert = errorMsg('Please Enter a Value'));
        const t = await h.table('GVTransData');
        if (t.rows.some((r) => t.get(r, 'Seq') === v.tbSeqNo)) return void (out.alert = errorMsg('Duplicate Sequance'));
        const row = t.newRow();
        t.set(row, 'SerialCode', netInt(v.PrimaryKey));
        t.set(row, 'RowID', t.max('RowID') + 1);
        t.set(row, 'VariantCode', v.DdlName.split('-')[0]);
        t.set(row, 'VariantName', await selectedText(h, 'DdlName', v.DdlName));
        t.set(row, 'Name', v.TbDescription.trim());
        t.set(row, 'Seq', netInt(v.tbSeqNo));
        t.set(row, 'Seperator', await selectedText(h, 'DDLSeperator', v.DDLSeperator));
        t.set(row, 'StartingNo', netLong(v.tbStartingNo));
        t.set(row, 'Seed', netInt(v.tbSeed));
        t.set(row, 'Length', netInt(v.tbLenth));
        t.set(row, 'EndingNo', netLong(v.tbEndingNo));
        t.set(row, 'Format', v.tbFormat.trim());
        t.set(row, 'Value', v.tbValue.trim());
        const blank = Object.fromEntries(['tbSeed', 'tbSeqNo', 'tbStartingNo', 'tbLenth', 'tbEndingNo', 'tbFormat', 'tbValue', 'TbDescription'].map((id) => [id, { value: '' }]));
        Object.assign(out.set, { GVTransData: { rows: [...t.rows, row], visible: true }, ...blank, DdlName: { index: 0 }, ...serialPanels('') });
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

// ---- Page_Load without an IsPostBack check ---------------------------------------------------------------------------

/** Page_Load code that also runs on every postback: (values, spec, ctx) -> the values the handlers / Save then see */
export const PAGE_POSTBACK = {};

// ---- QCValueCaptureControl on a page ----------------------------------------------------------------------------------

/** The page's lists that rewrite the record list's Tag: (filter sent back by the client) -> Tag, or nothing */
export const PAGE_LIST_TAG = {};

/** The QC popup's own events ("QC:<name>") on a page; close(rows, values, helpers) is the page's btncloseHandler. */
function withQC(file, close, id = 'QC') {
  PAGE_EVENTS[file] ??= {};
  for (const [name, fn] of Object.entries(QC_EVENTS)) {
    PAGE_EVENTS[file][`${id}:${name}`] = async (v, h) => {
      const s = structuredClone(v[id]);
      s.bound = false;
      const r = await fn(s, h.arg, h.index);
      return { set: { [id]: { value: s } }, ...(r.alert ? { alert: r.alert } : {}) };
    };
  }
  // IMBClose_Click: the page's handler gets the table, then the popup closes
  PAGE_EVENTS[file][`${id}:close`] = async (v, h) => {
    const s = structuredClone(v[id]);
    s.bound = false;
    const out = close ? await close(s.rows, v, h) : {};
    return { ...out, set: { ...(out.set ?? {}), [id]: { visible: false, value: s } } };
  };
}

// ---- QualityInspectionForm (Final Inspection) -------------------------------------------------------------------------
// TitleControl: no View / Update, so a saved inspection is never displayed again. ViewState keeps PendingQty and the
// checklist (UDDataTable); OtherFields' visibility (read by Save) is kept as __OtherFields.

const FINAL_QI = 'View/Quality/QualityInspectionForm.aspx';

PAGE_LOAD[FINAL_QI] = (controls, ctx) => {
  // DDLDepartment.SelectedValue = the session's department (not listed: Page_Load's try/catch swallows it)
  const d = controls.find((c) => c.id === 'DDLDepartment');
  if (d.options.some((o) => o.value === netString(ctx.department))) d.value = netString(ctx.department);
};
Object.assign(PAGE_INIT, { [FINAL_QI]: async (controls, vs) => Object.assign(vs, { PendingQty: '0' }) });

/** DDLStatus_SelectedIndexChanged: the defect panel for a rejection when there are defect codes */
async function qiStatusChanged(v, h, out) {
  const defects = out.set.DDLDefectCodes?.options ?? (await h.options('DDLDefectCodes'));
  const status = out.set.DDLStatus?.value ?? v.DDLStatus;
  if (defects.length === 0) out.set.DefectPanel = { visible: false };
  else {
    out.set.DDLNextAction = { index: 0 };
    out.set.DefectPanel = { visible: status !== '12' };
  }
}

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

// ---- CEATINSelfInspectionForm: a held barcode's self inspection (CEAT's page, in WRL's menu) ---------------------------
// As QualityInspectionForm: no View / Update, so a saved inspection is never displayed again. ViewState: PendingQty,
// UDDataTable (the checklist), SCADAFLG (1: the curing defect was added for the tyre). The curing check reads CEAT's
// SCADACuringDetails, which WRL does not have: there Go ends with that SQL error (what it filled before stays).

const CEAT_SELF = 'View/CEAT/CEATINSelfInspectionForm.aspx';
PAGE_LOAD[CEAT_SELF] = PAGE_LOAD[FINAL_QI];
Object.assign(PAGE_INIT, { [CEAT_SELF]: async (controls, vs) => Object.assign(vs, { PendingQty: '0' }) });

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

// ---- FooterControl ---------------------------------------------------------------------------------------------------

/** FooterControl.BtnSave_Click with the page's btnsaveHandler: save(values, helpers) -> { success, message, alert?, set?,
 *  viewState? }. Success: SuccessAlert and the form starts again (CallNewOnSave); otherwise ErrorAlert(Message). */
function withFooter(file, save) {
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
async function displayPatch(spec, ctx, key) {
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

// ---- NCMRConfirmation ------------------------------------------------------------------------------------------------
// Saved through its Footer; TitleControl's own Save (AddButton) stays the engine's. ViewState: UDDataTable;
// __Go = the Go button's text ("Clr" once a barcode is shown), __BarcodeEnabled = TBBarcode.Enabled.

const NCMR = 'View/Quality/NCMRConfirmation.aspx';
Object.assign(PAGE_INIT, { [NCMR]: async (controls, vs) => Object.assign(vs, { PendingQty: '0', __Go: 'Go', __BarcodeEnabled: '1' }) });

/** NCMR's InitializeInspection(): the lot's details and checklist */
async function ncmrInitialize(h, out, lot) {
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
const ncmrClear = (out) => {
  Object.assign(out.set, { GridPanel: { visible: false }, ProcessGrid: { visible: false }, BtnUD: { visible: false }, OtherFields: { visible: false }, ConfirmationPanel: { visible: false }, TBBarcode: { value: '', enabled: true }, Go: { text: 'Go' } });
  Object.assign(out.viewState, { __Go: 'Go', __BarcodeEnabled: '1' });
};

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

// ---- Repair / Finishing / Rework confirmation ("RRF") ------------------------------------------------------------------
// One page each for a rejected barcode's next action (2 repair, 3 finishing, 1 rework): scan, the inspection shown,
// the action confirmed. Repair and Rework save through their Footer, Finishing through TitleControl; Rework also asks
// for root cause / resolution (Settings.ReworkRootCause) and shows the job card's rework history.

const settingOr = (name, fallback) => (settingText(name, null) === null ? fallback : setting(name)); // Settings.X defaults
const RRF = {
  'View/Quality/RepairConfirmation.aspx': { action: 2, footer: true, processGrid: false },
  'View/Quality/FinishingConfirmation.aspx': { action: 3, footer: false, processGrid: true },
  'View/Quality/ReworkConfirmation.aspx': { action: 1, footer: true, processGrid: true, rework: true },
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

// ---- WRLImageDisply: a serial's material image -------------------------------------------------------------------------

Object.assign(PAGE_EVENTS, {
  'View/Production/WRLImageDisply.aspx': {
    // BtnGo_Click: AVHistory.WRLShowImage (AU.FillimgView: the first row's image as a data URL)
    BtnGo: async (v) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.PrimaryKey.trim() === '') return;
        const rows = await query("select m.MaterialImage FROM Material m inner join MaterialBarcode mb on m.MatCode = mb.Material where mb.Serial =@s", { s: v.PrimaryKey });
        if (!rows.length) throw new Error('There is no row at position 0.');
        const img = rows[0].MaterialImage;
        if (!Buffer.isBuffer(img)) throw new Error("Unable to cast object of type 'System.DBNull' to type 'System.Byte[]'.");
        Object.assign(out.set, { ImgGuideFileDisplay: { value: `data:image/png;base64,${img.toString('base64')}` }, PrimaryKey: { value: '' } });
      });
    },
  },
});

// ---- Excel-upload pages (AssetTagIDReplacement, ProdPlanUpload, MRPUpdate) ---------------------------------------------
// btnImport: the file's first sheet into the grid (AExcelWrapper.ImportExcel: row 1 the column names, then each row's
// cells in document order, as stored - numbers / dates as their raw values, shared strings as text); BtnUpdate: each
// row applied, the grid row green (done) or red (not found). The imported table is kept as ViewState["DT"].

/** AExcelWrapper.ImportExcel on the uploaded .xlsx */
export async function importExcel(file) {
  if (!file?.data) throw NRE(); // FileUpload1.PostedFile
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(file.data, 'base64'));
  const ws = wb.worksheets[0];
  const raw = (v) => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return String((v.getTime() - Date.UTC(1899, 11, 30)) / 86400000); // the stored serial
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'object') {
      if ('result' in v) return raw(v.result); // a formula's cached value
      if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
      if ('text' in v) return String(v.text);
      if ('error' in v) return String(v.error);
    }
    return String(v);
  };
  const columns = [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const cells = [];
    row.eachCell({ includeEmpty: false }, (c) => cells.push(raw(c.value)));
    if (n === 1) {
      for (const name of cells) {
        if (name === null) throw NRE(); // cell.CellValue
        if (columns.includes(name)) throw new Error(`A column named '${name}' already belongs to this DataTable.`); // names differing in case are allowed
        columns.push(name);
      }
      return;
    }
    rows.push(columns.map((_, i) => cells[i] ?? null)); // cells past the last column are dropped (caught)
  });
  return { columns, rows };
}
const dtRows = (dt, colors = []) => dt.rows.map((r, i) => ({ ...Object.fromEntries(dt.columns.map((c, j) => [c, r[j] ?? ''])), ...(colors[i] ? { __color: colors[i] } : {}) }));
/** a value the original spliced into SQL unquoted: a plain number goes in as such; anything else fails as SQL would */
const bareNumber = (s) => {
  const t = netString(s).trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return t;
  throw new Error(t === '' ? "Incorrect syntax near ','." : `Invalid column name '${t}'.`);
};
const UPLOADS = {
  // AVProductionCapture.UpdateAssetTagId(material name, serial, new asset tag)
  'View/Production/AssetTagIDReplacementForm.aspx': {
    columns: 4,
    row: async (r, ctx) => {
      const [name, serial, tag] = [r[1] ?? '', r[2] ?? '', r[3] ?? ''];
      const b = (await query('Select BarcodeNo,Material,VSerial from  MaterialBarcode where Serial=@s and material=(Select top 1 matcode from Material where Name=@n)', { s: serial, n: name }))[0];
      if (!b) return false;
      await execute('Update MaterialBarcode set VSerial=@t where BarcodeNo=@b', { t: tag, b: b.BarcodeNo });
      await execute(`insert into AssetTagIDReplace(Material,FGSerial,OldAssetTagID,NewAssetTagID,UserCode) Values(${netInt(b.Material)},${bareNumber(serial)},@o,@t,${netInt(ctx.userCode)})`, { o: netString(b.VSerial), t: tag });
      return true;
    },
  },
  // AVProductionCapture.UploadProdPlanWRL(MMyyyy, material alias, qty, plan type, remark): this or next month only
  'View/Production/ProdPlanUpload.aspx': {
    columns: 5,
    row: async (r, ctx) => {
      const [monthYear, alias, qty, type, remark] = r.map((x) => x ?? '');
      const p2 = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      if (monthYear !== `${p2(next.getMonth() + 1)}${next.getFullYear()}` && monthYear !== `${p2(now.getMonth() + 1)}${now.getFullYear()}`) return false;
      const material = netInt(await scalar('Select MatCode from Material where Alias=@a', { a: alias }));
      if (material <= 0) return false;
      const existing = (await query(`Select PlanNo from  PlanOrderPrint where PlanMaterial=${material} and PlanMonthYear =${netInt(monthYear)} and PlanType =@t`, { t: type }))[0];
      if (existing) {
        await execute(`Update PlanOrderPrint set PlanQty=${bareNumber(qty)} where PlanNo=${netInt(existing.PlanNo)} and PlanType =@t`, { t: type });
        return true;
      }
      const { key } = await generateKey('PlanOrderPrint', 1, netInt(ctx.businessUnit));
      await execute(`INSERT INTO [PlanOrderPrint]([PlanNo],[PlanMonthYear],[PlanMaterial],[PlanQty],[PlanType],[Remark],[CreatedBy],[CreatedOn],[Status]) Values(${netInt(key)},${bareNumber(monthYear)},${material},${bareNumber(qty)},@t,@r,${netInt(ctx.userCode)}, Getdate(),0 )`, { t: type, r: remark });
      return true;
    },
  },
  // AVProductionCapture.UpdateMRP(material name, MRP) - the MRP from the third column
  'View/Production/MRPUpdateForm.aspx': {
    columns: 3,
    row: async (r, ctx) => {
      const [name, mrp] = [r[0] ?? '', r[2] ?? ''];
      const m = (await query('Select matcode from  Material where Name=@n', { n: name }))[0];
      if (!m) return false;
      // a quoted (varchar) literal as written, its quotes escaped: the same conversion and its error text
      const lit = `'${String(mrp).replaceAll("'", "''")}'`;
      await execute(`Update Material set SRetailRate=${lit} where matcode=@m`, { m: m.matcode });
      await execute(`insert into MRPUpdate(Material,MRP,UserCode) Values(${netInt(m.matcode)},${lit},${netInt(ctx.userCode)})`);
      return true;
    },
  },
};
for (const [file, u] of Object.entries(UPLOADS)) {
  PAGE_LOAD[file] = (controls) => void (controls.find((c) => c.id === 'BtnUpdate').visible = false);
  PAGE_EVENTS[file] = {
    btnImport: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const dt = await importExcel(v.FileUpload1);
        out.set.GvDetails = { rows: dtRows(dt) };
        out.viewState.DT = dt;
        out.set.BtnUpdate = { visible: true };
      });
    },
    BtnUpdate: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      const dt = h.vs.DT;
      const colors = [];
      return guard(out, async () => {
        if (!dt?.columns) throw NRE();
        if (dt.columns.length !== u.columns) return void (out.alert = errorMsg('Invalid File'));
        try {
          for (const r of dt.rows) colors.push((await u.row(r, h.ctx)) ? 'green' : 'red');
        } finally {
          out.set.GvDetails = { rows: dtRows(dt, colors) };
        }
        out.success = true;
        out.set.BtnUpdate = { visible: false };
      });
    },
  };
}

// ---- FGScrapForm: a finished good's scanned components scrapped ------------------------------------------------------

const FG_SCRAP = 'View/Production/FGScrapForm.aspx';
/** a quoted (varchar) SQL literal as the original wrote it, its quotes escaped */
const sqlLit = (s) => `'${netString(s).replaceAll("'", "''")}'`;
Object.assign(PAGE_INIT, {
  [FG_SCRAP]: async (controls, vs, h) => {
    controls.find((c) => c.id === 'DDLScrapCategory').options = await h.fill('Select ID,Type from ScrapReasons');
    vs.__Go = 'Go';
  },
});
/** AVProcess.RMComponetDetails: the components scanned into the serial's job card */
async function fgComponents(serial) {
  const rows = await dataTable("Select mc.Type[Category]  , m.Name[Material],w.Name[Process],pb.Serial, pb.PsNo,pb.RowID,pb.ProcessCode ,m.matCode  from ProcessInputBOMScan pb inner join ProductionProcess w on pb.processCode  =w.ProcessCode  inner join Material m on pb.Material=m.MatCode  left join MaterialCategoryType mc on m.Type =mc.ID where pb.PSNo=(Select DocNo from MaterialBarcode where Serial=@s)", { s: serial });
  if (!rows.length) throw new Error('Invaild Barcode Scanned');
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x ?? ''])));
}
/** AVProductionCapture.FGScrap (no transaction: each statement stands) */
async function fgScrap(serial, remark, category, ctx) {
  const pad = (n) => String(n).padStart(2, '0');
  const rows = await query('Select * from ProcessInputBOMScan where psno=(select docno from Materialbarcode where serial=@s)', { s: serial });
  if (!rows.length) throw new Error('There is no row at position 0.');
  const station = netString(await scalar(`select top 1 StationCode from ProcessActivity where PSNo = ${digitsOrEmpty(netString(rows[0].PSNo))} order by ROWID desc`));
  await execute('Update MaterialBarcode Set Status=99 where serial=@s', { s: serial });
  for (const dr of rows) {
    if (netString(dr.Serial) === '99') throw new Error('Already Scrapped');
    const d = new Date();
    const scrapped = `${netString(dr.Serial)}-SCRAP${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${String(d.getFullYear()).slice(-2)}-${pad(d.getMinutes())}`;
    await execute(`Update MaterialBarcode set Serial=${sqlLit(scrapped)} where BarcodeNo=${digitsOrEmpty(netString(dr.BarcodeNo))}`);
    await execute(`Update ProcessInputBOMScan set Serial=${sqlLit(scrapped)} where Serial=${sqlLit(dr.Serial)}`);
    await execute(`INSERT INTO [FGScrap]([BarcodeNo],[Serial],[PSNo],[Remark],[SCRAPCATEGORY],[LastStation],[UserID],[ScrapDate]) VALUES (${digitsOrEmpty(netString(dr.BarcodeNo))},${sqlLit(dr.Serial)},${digitsOrEmpty(netString(dr.PSNo))},${sqlLit(remark.trim())},${sqlLit(category)},${digitsOrEmpty(station)},${sqlLit(ctx.userId)},GETDATE())`);
  }
  // (a stray ")" in the original's statement: it fails here, after the scrap, as written)
  const plan = netString(await scalar(`select top 1 Material from MaterialBarcode where serial=${sqlLit(serial)})`));
  const p2 = (n) => String(n).padStart(2, '0');
  await execute(`Update PlanOrderPrint set PlanQty=PlanQty +1 where PlanMaterial =${digitsOrEmpty(plan)} and PlanMonthYear = ${p2(new Date().getMonth() + 1)}${new Date().getFullYear()}`);
}
Object.assign(PAGE_EVENTS, {
  [FG_SCRAP]: {
    // Go_Click: the serial's components, or (Clr) a new scan
    Go: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.__Go === 'Go') {
          if (v.TBBarcode.trim() === '') return out;
          out.set.GvDetails = { rows: await fgComponents(v.TBBarcode.trim()) };
          out.set.Go = { text: 'Clr' };
          out.viewState.__Go = 'Clr';
        } else {
          Object.assign(out.set, { TBBarcode: { value: '', enabled: true }, Go: { text: 'Go' }, GvDetails: { rows: [] } });
          out.viewState.__Go = 'Go';
        }
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        out.set.TBBarcode = { value: '', enabled: true };
      }
      return out;
    },
    // btnSave_Click1: AVProductionCapture.FGScrap
    btnSave: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      if (v.TBRemark === '') return { alert: errorMsg('Please Enter Remark') };
      try {
        await fgScrap(v.TBBarcode.trim(), v.TBRemark.trim(), v.DDLScrapCategory, h.ctx);
        out.success = true;
        Object.assign(out.set, { TBBarcode: { value: '', enabled: true }, TBRemark: { value: '' }, Go: { text: 'Go' }, GvDetails: { rows: [] } });
        out.viewState.__Go = 'Go';
      } catch (e) {
        Object.assign(out.set, { TBBarcode: { value: '' }, TBRemark: { value: '' } });
        out.alert = exceptionAlert(e.message);
      }
      return out;
    },
  },
});

// ---- RMReplacementForm: a scanned component of a serial replaced by a new one -----------------------------------------
// ViewState: __Go / __ExistGo / __NewGo (the buttons' texts) and Data (the chosen grid row, as its cells' text).

const RM_REPLACE = 'View/Production/RMReplacementForm.aspx';
Object.assign(PAGE_INIT, { [RM_REPLACE]: async (controls, vs) => Object.assign(vs, { __Go: 'Go', __ExistGo: 'Go', __NewGo: 'Go' }) });
const htmlCell = (x) => (netString(x) === '' ? '&nbsp;' : netString(x).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')); // a BoundField cell's Text
/** Go_Click (no try/catch): the serial's components, unless it is scrapped */
async function rmGo(v, h, out) {
  if ((out.viewState.__Go ?? h.vs.__Go) === 'Go') {
    const barcode = netString(out.set.TBBarcode?.value ?? v.TBBarcode).trim();
    if (barcode === '') return;
    out.set.GvDetails = { rows: await fgComponents(barcode) };
    if ((await componentStatus(barcode)) === 99) {
      out.alert = errorMsg('This Serial No. is Scrapped');
      out.set.TBBarcode = { value: '', enabled: true };
    } else {
      out.set.Go = { text: 'Clr' };
      out.viewState.__Go = 'Clr';
    }
  } else {
    Object.assign(out.set, { TBBarcode: { value: '', enabled: true }, TBExistingRM: { value: '', enabled: true }, TBNewRM: { value: '', enabled: true }, btnexistScan: { text: 'Go' }, btnNewScan: { text: 'Go' }, Go: { text: 'Go' }, GvDetails: { rows: [] } });
    Object.assign(out.viewState, { __ExistGo: 'Go', __NewGo: 'Go', __Go: 'Go' });
  }
}
const RM_COLS = ['Category', 'Material', 'Process', 'Serial', 'PsNo', 'RowID', 'ProcessCode', 'matCode'];
Object.assign(PAGE_EVENTS, {
  [RM_REPLACE]: {
    Go: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      await rmGo(v, h, out);
      return out;
    },
    // btnRxistScan_Click: the grid row of the scanned existing component
    btnexistScan: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.__ExistGo !== 'Go') {
          Object.assign(out.set, { TBExistingRM: { value: '', enabled: true }, btnexistScan: { text: 'Go' } });
          out.viewState.__ExistGo = 'Go';
          return out;
        }
        const rows = Array.isArray(v.GvDetails) ? v.GvDetails : [];
        const row = rows.find((r) => htmlCell(r.Serial) === v.TBExistingRM);
        if (!row) return { ...out, alert: errorMsg('Serial No not found') };
        out.viewState.Data = Object.fromEntries(RM_COLS.map((c) => [c, htmlCell(row[c])]));
        Object.assign(out.set, { TBNewRM: { value: '' }, btnexistScan: { text: 'Clr' }, TBExistingRM: { enabled: false } });
        out.viewState.__ExistGo = 'Clr';
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        Object.assign(out.set, { btnexistScan: { text: 'Go' }, TBExistingRM: { enabled: true } });
        out.viewState.__ExistGo = 'Go';
      }
      return out;
    },
    // btnNewScan_Click: the chosen component replaced (AVProductionCapture.ReplaceRMScanValidate), the list again
    btnNewScan: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.__NewGo !== 'Go') {
          Object.assign(out.set, { TBNewRM: { value: '', enabled: true }, btnNewScan: { text: 'Go' } });
          out.viewState.__NewGo = 'Go';
          return out;
        }
        if (v.TBNewRM.trim() === '') return out;
        if (!h.vs.Data) throw new Error('There is no row at position 0.');
        const data = { ...h.vs.Data, NewSerialNo: v.TBNewRM.trim() };
        out.viewState.Data = data;
        await replaceRMScan(data, h.ctx);
        out.success = true;
        Object.assign(out.set, { TBExistingRM: { value: '', enabled: true }, TBNewRM: { value: '', enabled: true }, btnexistScan: { text: 'Go' }, btnNewScan: { text: 'Go' }, Go: { text: 'Go' } });
        Object.assign(out.viewState, { __ExistGo: 'Go', __NewGo: 'Go', __Go: 'Go' });
        await rmGo(v, h, out);
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        Object.assign(out.set, { TBNewRM: { value: '', enabled: true }, btnNewScan: { text: 'Go' } });
        out.viewState.__NewGo = 'Go';
      }
      return out;
    },
  },
});

// ---- ProductionOrderForm (WRL: the non-HIMILE branches) -------------------------------------------------------------

const PROD_ORDER = 'View/Production/ProductionOrderForm.aspx';
CUSTOM_DISPLAY.add(PROD_ORDER);
const PO_MATERIALS = "Select MatCode, CONCAT(Name, ' - ', Alias) as Name From Material where status =1 and (Type>=100 and Type<200) or (Type>=400 and Type<500) order by Name";
const soOrders = (bu) => `Select so.SONo,CONCAT(so.alias,' - ',l.Name,'-',so.Remark)[Name] from SOHeader so left Join Ledger l on so.Customer =l.LedgerCode where so.BusinessUnit =${digitsOrEmpty(bu)}  and so.Status=1`;
const srOrders = (bu, material) => `Select so.SONo,CONCAT(so.alias,'-',so.QuoteRef,' - ',l.Name)[Name] from SRHeader so inner join SRMaterial sr on so.SONO=sr.SONo and sr.Material=${netLong(material)} left Join Ledger l on so.Customer =l.LedgerCode where so.BusinessUnit =${digitsOrEmpty(bu)}  and so.Status=1`;
/** AVProcess.GetID(bu): a serial counter taken (GenerateMaterialSerialNo) with the session BU's GS1 prefix */
async function processGetID(bu, ctx) {
  const [, serial] = await generateMaterialSerialNo('0', bu, '0');
  return parseString(await scalar(`select GS1Prefix from BusinessUnit where BUCode=${digitsOrEmpty(ctx.businessUnit)}`)) + serial;
}
/** DDLMaterial_SelectedIndexChanged: base UOM, BOM list (one BOM chosen), serial material -> Track shown with a new ID */
async function prodOrderMaterial(material, h, out) {
  if (material === '') {
    out.set.DdlBOM = { options: [] };
    return;
  }
  const m = digitsOrEmpty(material);
  const uom = parseString(await scalar(`select BaseUom from Material where MatCode = ${m}`));
  await select(h, out, 'DDLUom', uom);
  const boms = await h.fill(`Select BOMCode, Alias from BOMHeader where material=${m}`);
  out.set.DdlBOM = { options: boms, index: boms.length === 2 ? 1 : 0 };
  await select(h, out, 'DdlTotalUom', uom);
  if (netBool(await scalar(`select  Serial from Material where MatCode=${m}`))) {
    out.set.Track = { visible: true };
    out.set.TBTrackID = { value: await processGetID('999', h.ctx) };
  } else out.set.Track = { visible: false };
}
PAGE_LISTS[PROD_ORDER] = {
  // DDLOrder is only filled by DDLOrderType_SelectedIndexChanged
  DDLOrder: (v, h) => (v.DDLOrderType === '1' ? h.fill(soOrders(v.DDLBU)) : v.DDLOrderType === '4' ? h.fill(srOrders(v.DDLBU, v.DDLMaterial)) : []),
};
Object.assign(PAGE_DISPLAY, {
  // display(key): DDLMaterial_SelectedIndexChanged on the (fresh) form's material, then AU.Display
  [PROD_ORDER]: {
    async before(controls) {
      if (netString(controls.find((c) => c.id === 'DDLMaterial').value) === '') controls.find((c) => c.id === 'DdlBOM').options = [];
    },
  },
});
Object.assign(PAGE_EVENTS, {
  [PROD_ORDER]: {
    DDLMaterial: async (v, h) => {
      const out = { set: {} };
      return guard(out, () => prodOrderMaterial(netString(v.DDLMaterial), h, out));
    },
    DDLOrderType: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLOrderType === '1') {
          Object.assign(out.set, { SalesOrderPanel: { visible: true }, OrderQtyPanel: { visible: true } });
          out.set.DDLSO = { options: await h.fill(soOrders(v.DDLBU)), index: 0 };
          out.set.DDLOrder = { options: await h.fill(soOrders(v.DDLBU)), index: 0 };
          out.set.Track = { visible: true };
          out.set.DDLMaterial = { options: await h.fill(PO_MATERIALS), index: 0 };
          out.set.TBQty = { enabled: true };
        } else if (v.DDLOrderType === '4') {
          out.set.DDLMaterial = { options: await h.fill("Select MatCode, CONCAT(Name, ' - ', Alias) as Name From Material where status =1 and Type=300  order by Name"), index: 0 };
          Object.assign(out.set, { SalesOrderPanel: { visible: false }, OrderQtyPanel: { visible: false } });
          out.set.DDLOrder = { options: await h.fill(srOrders(v.DDLBU, '')), index: 0 }; // the list was just refilled: nothing selected
          Object.assign(out.set, { Track: { visible: false }, TBQty: { value: '1', enabled: false } });
        } else {
          Object.assign(out.set, { SalesOrderPanel: { visible: false }, OrderQtyPanel: { visible: false }, DDLSO: { options: [] }, Track: { visible: false } });
          out.set.DDLMaterial = { options: await h.fill(PO_MATERIALS), index: 0 };
          out.set.TBQty = { enabled: true };
        }
      });
    },
    DDLSO: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.DDLSO !== '') {
          const opts = await h.fill(`select s.Material,CONCAT(m.Name,'-',m.Alias) as Name  from SOMaterial s left join Material m on s.Material =m.MatCode  where s.SONO=${digitsOrEmpty(v.DDLSO)}`);
          out.set.DDLMaterial = { options: opts, index: 0 };
          if (opts.length === 2) {
            out.set.DDLMaterial.index = 1;
            await prodOrderMaterial(opts[1].value, h, out);
          }
        } else out.set.DDLMaterial = { options: await h.fill("Select MatCode,CONCAT(Name, '|', Alias) from Material Where Status=1"), index: 0 };
      });
    },
    // BtnAdd_Click: the chosen order added to the grid, TBTrackID from its SRMaterial row
    BtnAdd: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (netString(v.DDLOrder) === '') {
          out.alert = alertMsg('Kindly select a Order');
          return;
        }
        const t = await h.table('GVTransData');
        const row = t.newRow();
        t.set(row, 'PRODNo', netInt(v.PrimaryKey));
        t.set(row, 'SeqNo', t.max('SeqNo') + 1);
        t.set(row, 'OrderCode', v.DDLOrder);
        t.set(row, 'OrderNo', await selectedText(h, 'DDLOrder', v.DDLOrder));
        // ponytail: the original added the row to its ViewState table before this lookup, so it survived a failure here
        const track = await scalar(`Select HMICode from SRMaterial where SONO=${digitsOrEmpty(v.DDLOrder)}`);
        if (track === null || track === undefined) throw NRE();
        out.set.TBTrackID = { value: netString(track) };
        out.set.GVTransData = { rows: [...t.rows, row] };
        await select(h, out, 'DDLOrder', '');
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

// ---- ModelToModelTransferForm: serial-number ranges moved from one model (material) to another, labels reprinted ----

const MODEL_TO_MODEL = 'View/Production/ModelToModelTransferForm.aspx';
const blankCells = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x ?? ''])));
// Page_Load: AU.FillBarcodePrinterList (every printer; the only one chosen)
PAGE_INIT[MODEL_TO_MODEL] = async (controls, vs, h) => {
  const ddl = controls.find((c) => c.id === 'DDLPrinter');
  ddl.options = await h.fill('Select ROWID,Name from BarcodePrinter');
  if (ddl.options.length === 2) ddl.value = ddl.options[1].value;
};
const wholeTyped = (s) => /^\s*[+-]?\d+\s*$/.test(netString(s)); // long.TryParse would take it
Object.assign(PAGE_EVENTS, {
  [MODEL_TO_MODEL]: {
    // DDLSourceMaterial_SelectedIndexChanged (no try/catch): the serial-number length limits the range boxes
    DDLSourceMaterial: async (v) => {
      const n = netInt(await scalar(`Select Length from  SerialGenerationLogicDetail where serialCode=(select TrackNoType from Material where matcode=${digitsOrEmpty(v.DDLSourceMaterial)}) and VariantCode=10`));
      return { set: { TbStart: { maxLength: n }, TbEnd: { maxLength: n } } };
    },
    btnShow: async (v) => {
      const out = { set: {} };
      return guard(out, async () => {
        out.set.GvDetails = { rows: blankCells(await showModelDetails(netString(v.DDLSourceMaterial), netString(v.TbStart), netString(v.TbEnd))) };
      });
    },
    btnPrint: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        const [start, end] = [netLong(v.TbStart), netLong(v.TbEnd)];
        if (netString(v.DDLSourceMaterial) === '' || netString(v.DDLDestiMaterial) === '' || !(start > 0) || !(start <= end) || netString(v.DDLPrinter) === '' || !wholeTyped(v.TbStart) || !wholeTyped(v.TbEnd)) {
          out.alert = errorMsg('Wrong data. Please check all data');
          return;
        }
        out.set.GVPrint = { rows: blankCells(await modelToModelTransfer(netString(v.DDLSourceMaterial), netString(v.DDLDestiMaterial), netString(v.TbStart), netString(v.TbEnd), netString(v.DDLPrinter), h.ctx)) };
      });
    },
  },
});

// ---- ProcessGuideForm: a station's job-card guide (instructions, guide file) and the station operators' login --------
// ViewState: ProcessCode (the scanned station's process), StationTag (TBWorkStation's Tag), __CardGo / __StationGo
// (BtnWorderScan / btnStation texts).

const PROCESS_GUIDE = 'View/Production/ProcessGuideForm.aspx';
const LOGGED_IN = 'Select w.Name[Station],u.UserName,pl.Login,pl.UserCode from ProcessUserLogin pl inner join WorkCenter w on pl.Station =w.StationCode inner join users u on pl.UserCode=u.UserCode where pl.Status =1';
const loggedIn = async () => blankCells(await dataTable(LOGGED_IN));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// DateTime.Now.ToString("dd-MMM-yyyy HH:mm:ss")
const nowStamp = (d = new Date()) => `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${[d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')}`;
PAGE_INIT[PROCESS_GUIDE] = async (controls, vs) => Object.assign(vs, { __CardGo: 'Go', __StationGo: 'Go' });
// Page_Load: BU and department of the session (department fixed), the user, the logged-in operators. A value not in
// its list throws there (the rest of the load is skipped).
PAGE_LOAD[PROCESS_GUIDE] = async (controls, ctx) => {
  const byId = (id) => controls.find((c) => c.id === id);
  const pickIn = (id, value) => {
    const c = byId(id);
    if (!c.options.some((o) => o.value === value)) throw notInList(id);
    c.value = value;
    return c;
  };
  try {
    pickIn('DDLBusinessUnit', netString(ctx.businessUnit));
    const dept = byId('DDLDepartment');
    if (dept.options.length === 2) dept.value = dept.options[1].value;
    if (netString(ctx.department) !== '') pickIn('DDLDepartment', netString(ctx.department)).enabled = false;
    pickIn('DDLUser', netString(ctx.userCode));
    byId('GvUsers').rows = await loggedIn();
  } catch (e) {
    return { alert: exceptionAlert(e.message) };
  }
};
/** LBGuideFiles_SelectedIndexChanged: the file shown in GuideFileDisplayPanel (pdf / dwg viewer / png) */
function guideFile(value) {
  const url = value.startsWith('~/') ? value.slice(1) : /^([a-z]+:|\/)/i.test(value) ? value : `/View/Production/${value}`; // Page.ResolveUrl
  const kind = value.toLowerCase().includes('.pdf') ? 'pdf' : value.includes('.dwg') ? 'dwg' : value.toLowerCase().includes('.png') ? 'png' : null;
  return { guide: kind ? { kind, url } : null };
}
/** AVProductionCapture.ValidateWorkStation(ws, DDLDepartment, ...): WorkStationScan 1 finds the station in the BU
 *  (and selects its department), otherwise in the chosen department */
async function guideStation(ws, v, h, out) {
  const bu = digitsOrEmpty(h.ctx.businessUnit);
  if (netInt(settingText('WorkStationScan', '1')) === 1) {
    const r = await validateWorkStation(ws, h.ctx.businessUnit);
    if (r.ok) await select(h, out, 'DDLDepartment', parseString(await scalar(`select Department from WorkCenter where stationcode=${digitsOrEmpty(r.rtn.split('~')[0])}`)));
    return r;
  }
  const dept = digitsOrEmpty(v.DDLDepartment);
  const digits = /^\d*$/.test(ws);
  const code = digits
    ? await scalar(`select Alias from WorkCenter where stationcode=${ws} and Department=${dept} and BusinessUnit=${bu}`)
    : await scalar(`select StationCode from WorkCenter where Alias=${lit(ws)} and Department=${dept} and BusinessUnit=${bu}`);
  if (parseString(code) === '') return { ok: false };
  const rtn = digits ? `${ws}~${parseString(code)}` : `${parseString(code)}~${ws}`;
  return { ok: true, rtn, process: parseString(await scalar(`select ProcessCode from WorkCenterProcesses where stationcode=${digitsOrEmpty(rtn.split('~')[0])}`)) };
}
Object.assign(PAGE_EVENTS, {
  [PROCESS_GUIDE]: {
    BtnWorkStationScan: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (netInt(settingText('WorkStationScan', '1')) === 0 && netString(v.DDLDepartment) === '') {
          out.alert = errorMsg('Select Departmet');
          return out;
        }
        const ws = netString(v.TBWorkStation);
        if (ws === '') return out;
        out.viewState.ProcessCode = '';
        const r = await guideStation(ws, v, h, out);
        if (r.ok) {
          const [code, alias] = r.rtn.split('~');
          Object.assign(out.viewState, { ProcessCode: r.process, StationTag: code });
          out.set.TBWorkStation = { value: alias };
        } else {
          out.alert = errorMsg('Invalid Work Center');
          out.set.TBWorkStation = { value: '' };
        }
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        out.set.TBWorkStation = { value: '' };
      }
      return out;
    },
    BtnWorderScan: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (h.vs.__CardGo === 'Clr') {
          Object.assign(out.set, { TBJobCoard: { value: '', enabled: true }, BtnWorderScan: { text: 'Go' }, WorkStationPanel: { visible: true }, JobCardPanel: { visible: true }, RightTopPanel: { visible: false } });
          out.viewState.__CardGo = 'Go';
          return out;
        }
        const ps = await getPSNo(netString(v.TBJobCoard));
        if (ps === '') {
          out.alert = errorMsg('Invalid Barcode');
          out.set.TBJobCoard = { value: '' };
          return out;
        }
        if (h.vs.ProcessCode === undefined) throw NRE(); // ViewState["ProcessCode"].ToString()
        const g = await guideData(ps, netString(h.vs.ProcessCode));
        // FillGuide, then BtnGuide_Click: the list always holds its blank item, so the guide panels open
        Object.assign(out.set, {
          GVInstruction: { rows: blankCells(g.instructions), visible: g.instructions.length > 0 },
          LBGuideFiles: { options: g.files, index: 0 },
          RightTopPanel: { visible: true },
          RightPanel: { visible: true },
          RightTop: { visible: true },
          RightBottom: { visible: true },
        });
        if (g.files.length > 1) {
          out.set.LBGuideFiles.index = 1;
          out.set.GuideFileDisplayPanel = guideFile(g.files[1].value);
        }
        out.set.BtnWorderScan = { text: 'Clr' };
        out.viewState.__CardGo = 'Clr';
        out.set.GV = { rows: blankCells(await orderMaterial(ps)) };
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        out.set.TBJobCoard = { value: '' };
      }
      return out;
    },
    LBGuideFiles: async (v) => ({ set: { GuideFileDisplayPanel: guideFile(netString(v.LBGuideFiles)) } }),
    IMBGuideClose: async () => ({ set: { RightTopPanel: { visible: false } } }),
    btnLogin: async (v, h) => {
      const out = { set: {} };
      try {
        let [userCode, pass] = [netString(v.DDLUserCode), netString(v.TbPass)];
        if (netString(v.TbScanQrCode) !== '') {
          const up = netString(v.TbScanQrCode).trim().split('|');
          if (up.length > 1) {
            await select(h, out, 'DDLUserCode', up[0]);
            [userCode, pass] = [up[0], up[1]];
            out.set.TbPass = { value: pass };
          }
        }
        if (netString(v.DDLStation) === '') {
          out.set.TbScanQrCode = { value: '' };
          out.alert = errorMsg('Select a Station');
          return out;
        }
        if (userCode === '') {
          out.set.TbScanQrCode = { value: '' };
          out.alert = errorMsg('Select a user');
          return out;
        }
        const [station, user] = [digitsOrEmpty(v.DDLStation), digitsOrEmpty(userCode)];
        // whoever is logged in at the station, and this user anywhere, logged out first
        for (const where of [`Station=${station}`, `UserCode=${user}`]) {
          const open = parseString(await scalar(`Select top 1 UserCode from ProcessUserLogin where Status=1 and ${where}`));
          if (netInt(open) > 0) await execute(`Update ProcessUserLogin set Status=2, Logout='${nowStamp()}' where UserCode=${digitsOrEmpty(open)}`);
        }
        if (parseString(await scalar(`Select Password from Users where userCode=${user}`)) === pass) {
          await execute(`Insert into ProcessUserLogin(Station,UserCode,Login,Status) values(${station},${user},'${nowStamp()}',1)`);
          out.success = true;
          Object.assign(out.set, { TbPass: { value: '' }, GvUsers: { rows: await loggedIn() }, TbScanQrCode: { value: '' } });
          await select(h, out, 'DDLStation', '');
        } else out.alert = errorMsg('Wrong Password');
      } catch (e) {
        out.set.TbScanQrCode = { value: '' };
        out.alert = exceptionAlert(e.message);
      }
      return out;
    },
    // GvUsers_RowCommand "Logout": the row's operator logged out (Cells[4]: UserCode)
    'GvUsers:Logout': async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        const row = (Array.isArray(v.GvUsers) ? v.GvUsers : [])[h.index];
        if (!row) throw NRE();
        await execute(`Update ProcessUserLogin set Status=2, Logout='${nowStamp()}' where UserCode=${digitsOrEmpty(htmlCell(row.UserCode))}`);
        out.set.GvUsers = { rows: await loggedIn() };
      });
    },
    btnStation: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      try {
        if (netString(v.TbUserStation) === '') return out;
        if (h.vs.__StationGo === 'Go') {
          const want = netString(v.TbUserStation).trim();
          if (!(await h.options('DDLStation')).some((o) => o.value === want)) {
            out.alert = errorMsg('Invalid Station');
            out.set.TbUserStation = { value: '' };
            return out;
          }
          Object.assign(out.set, { DDLStation: { value: want }, TbScanQrCode: { value: '' }, btnStation: { text: 'Clr' } });
          out.viewState.__StationGo = 'Clr';
        } else {
          Object.assign(out.set, { btnStation: { text: 'Go' }, TbUserStation: { value: '', enabled: true } });
          out.viewState.__StationGo = 'Go';
          await select(h, out, 'DDLStation', '');
        }
      } catch (e) {
        out.alert = exceptionAlert(e.message);
        out.set.TbUserStation = { value: '' };
      }
      return out;
    },
  },
});

// ---- ProductionAssignmentForm: a production order started stage-wise (one job card + barcode + label per piece) -----
// ViewState: Qty (what is left to assign at the chosen stage, as text).

const PROD_ASSIGN = 'View/Production/ProductionAssignmentForm.aspx';
/** AU.FillBarcodePrinterList(ddl, dept): the department's printers (the only one chosen) */
async function deptPrinters(h, dept) {
  const options = await h.fill(`Select ROWID,Name from BarcodePrinter Where  Department=${netInt(dept)}`);
  return { options, index: options.length === 2 ? 1 : 0 };
}
/** DDLDept_SelectedIndexChanged */
async function assignDept(dept, h, out) {
  if (dept !== '') {
    out.set.DDlProdOrder = { options: await h.fill(`Select ph.PRODNo, CONCAT(m.Name , ' - ', ph.PRODNo) as Name from PRODHeader ph inner join Material m on ph.Material=m.MatCode where ph.Qty>isnull(ph.AssignedQty,0) and ph.Status=1 and ph.Department =${digitsOrEmpty(dept)} order by PRODNo Desc`), index: 0 };
    out.set.DDLPrinter = await deptPrinters(h, dept);
  } else Object.assign(out.set, { DDlProdOrder: { options: [], value: '' }, DDLPrinter: { options: [], value: '' } });
}
// Page_Load (no try/catch there): the session department, then its orders and printers
PAGE_LOAD[PROD_ASSIGN] = async (controls, ctx) => {
  const byId = (id) => controls.find((c) => c.id === id);
  const dept = byId('DDLDepartment');
  if (!dept.options.some((o) => o.value === netString(ctx.department))) return { alert: exceptionAlert(notInList('DDLDepartment').message) };
  dept.value = netString(ctx.department);
  const out = { set: {} };
  await assignDept(dept.value, { fill: (sql, params) => fill(sql, 'Select A Value', params) }, out);
  for (const [id, p] of Object.entries(out.set)) Object.assign(byId(id), { options: p.options, value: p.options[p.index ?? 0]?.value ?? '' });
};
/** AVProcess.GetBOM(bom, qty): the BOM's input / output lines for qty (spliced as the original did) */
async function bomGrids(bom, qty) {
  const b = digitsOrEmpty(bom);
  const base = netDouble(await scalar(`select BaseQty from BOMHeader where BOMCode=${b}`));
  const per = `Qty*${netNum(qty)}/${netNum(base)}[Qty]`;
  return {
    input: blankCells(await dataTable(`Select '0' as PSNo, BOMCode, RowID, Material, ${per}, Uom,bi.ProcessCode,m.Name[MaterialDesc],um.Name[UomDesc],p.Name[ProcessDesc],ScanReq,OutputScan,'0' as ConsumedQty,'0' as Status,'0' as Parameters,'0' as Task from BOMInput bi left join Material m on m.MatCode = bi.Material left join UnitOfMeasure um on um.UomCode = bi.Uom left join ProductionProcess p on p.ProcessCode = bi.ProcessCode where bi.BomCode=${b}`)),
    output: blankCells(await dataTable(`Select '0' as PSNo, BOMCode, RowID, Material, ${per}, Uom,bi.ProcessCode,m.Name[MaterialDesc],um.Name[UomDesc],p.Name[ProcessDesc],'0' as YieldQty,'0' as Status  from BOMOutput bi left join Material m on m.MatCode = bi.Material left join UnitOfMeasure um on um.UomCode = bi.Uom left join ProductionProcess p on p.ProcessCode = bi.ProcessCode where bi.BomCode=${b}`)),
  };
}
/** AVProcess.GetRoutingWithStationLine: the routing with each process' station (the chosen station's line, else the
 *  department, else any) */
async function routeWithStations(route, dept, station) {
  const line = netInt(await scalar(`Select ManfLine  from WorkCenter where StationCode=${digitsOrEmpty(station)}`));
  const rows = blankCells(await dataTable(`select '0' as PSNo, RouteCode,SeqNo,pp.ProcessCode,'0' as StationCode,'' as StartedOn,'' as CompletedOn,pp.Name as Process,'' as Station,'0' as Status,rt.InspectionCheckList as ParameterCode,rt.SetupCheckList as SetupParameter from RoutingTrans rt left join ProductionProcess pp on rt.ProcessCode=pp.ProcessCode where RouteCode=${digitsOrEmpty(route)} order by SeqNo asc`));
  const first = async (where) => netInt(await scalar(`Select top 1 wp.StationCode from WorkCenterProcesses  wp inner join WorkCenter w on wp.StationCode=w.StationCode where ${where}`));
  for (const r of rows) {
    const p = digitsOrEmpty(r.ProcessCode);
    let code = 0;
    if (line > 0) code = await first(`wp.ProcessCode=${p}   and w.ManfLine=${line}`);
    if (code === 0) code = await first(`wp.ProcessCode=${p}   and w.Department=${digitsOrEmpty(dept)}`);
    if (code === 0) code = await first(`wp.ProcessCode=${p}`);
    r.StationCode = String(code);
    r.Station = parseString(await scalar(`Select Name from WorkCenter where StationCode=${code}`));
  }
  return rows;
}
/** DDLRouting_SelectedIndexChanged: the routing's first stage-label process (and its stations), the BOM for one */
async function assignRouting(v, h, out) {
  const route = netString(out.set.DDLRouting?.value ?? v.DDLRouting);
  if (route === '') {
    out.set.DDLProcessCode = { options: [], value: '' };
    return;
  }
  const procs = await h.fill(`Select top 1 pp.ProcessCode,pp.Name from RoutingTrans rt inner join ProductionProcess pp on rt.ProcessCode=pp.ProcessCode  where  rt.RouteCode=${digitsOrEmpty(route)} and  rt.StageLabel=1 order by rt.SeqNo Asc`);
  out.set.DDLProcessCode = { options: procs, index: procs.length >= 2 ? 1 : 0 };
  if (procs.length >= 2) await assignProcess({ ...v, DDLRouting: route, DDLProcessCode: procs[1].value }, h, out);
  out.set.ContentPanel = { visible: true };
  const g = await bomGrids(netString(out.set.DDLBom?.value ?? v.DDLBom), 1);
  Object.assign(out.set, { GVBOMInput: { rows: g.input }, GVOutput: { rows: g.output } });
}
/** DDLProcessCode_SelectedIndexChanged: its stations; the quantity left to assign at that stage */
async function assignProcess(v, h, out) {
  const [process, route] = [netString(v.DDLProcessCode), netString(v.DDLRouting)];
  if (process !== '' && route !== '') {
    out.set.DDLStationCode = { options: await h.fill(`select wc.StationCode,wc.Name   from WorkCenter wc left join WorkCenterProcesses wp on wc.StationCode =wp.StationCode  where wp.ProcessCode=${digitsOrEmpty(process)} and wc.Department =${digitsOrEmpty(v.DDLDepartment)}`), index: 0 };
    const assigned = netDouble(await scalar(`Select sum(po.qty) from ProcessOrder po inner join ProcessStageLabel psl on po.PSNo=psl.PSNo where po.PRODNo=${digitsOrEmpty(v.DDlProdOrder)} and psl.ProcessCode=${digitsOrEmpty(process)}`));
    const left = netNum(netDouble(out.set.TBTotalQty?.value ?? v.TBTotalQty) - assigned);
    out.set.TBQty = { ...out.set.TBQty, value: left };
    out.viewState.Qty = left;
  } else {
    out.viewState.Qty = '0';
    out.set.DDLStationCode = { options: [], value: '' };
  }
}
const nowMinute = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d;
}; // DateTime.Now.ToString("dd-MMM-yyyy HH:mm") read back as a date
const nowSecond = () => {
  const d = new Date();
  d.setMilliseconds(0);
  return d;
};
/** a row of a table as the original's NewRow + assignments (columns not given stay DBNull) */
async function newRow(table, values) {
  const schema = await tableSchema(table);
  return { schema, row: new Map(Object.entries(values).map(([k, x]) => [schema.col(k)?.name ?? k, x])) };
}
const insertRow = (t, ctx, tx) => insert(null, { tables: [{ schema: t.schema, prefix: '', rows: [t.row] }] }, ctx, { wrl: true, tx });

Object.assign(PAGE_EVENTS, {
  [PROD_ASSIGN]: {
    DDLDepartment: async (v, h) => {
      const out = { set: {} };
      return guard(out, () => assignDept(netString(v.DDLDepartment), h, out));
    },
    DDlProdOrder: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, async () => {
        const order = netString(v.DDlProdOrder);
        out.set.ContentPanel = { visible: false };
        if (order === '') {
          Object.assign(out.set, { DDLMaterial: { options: [], value: '' }, DDLRouting: { options: [], value: '' }, DDLBom: { options: [], value: '' } });
          return;
        }
        const dt = (await query(`Select Material,Uom,Qty,BOMCode from PRODHeader where PRODNo = ${digitsOrEmpty(order)}`))[0];
        const mats = await h.fill(`Select MatCode, CONCAT(Name, ' - ', Alias) as Name From Material where Matcode in(SELECT Material FROM PRODHeader where PRODNo=${digitsOrEmpty(order)} UNION SELECT Material  FROM BOMInput where BOMCode=(Select BOMCode from PRODHeader where PRODNo=${digitsOrEmpty(order)} ) and RoutingCode>0)`);
        out.set.DDLMaterial = { options: mats };
        if (!dt) throw new Error('There is no row at position 0.');
        await select(h, out, 'DDLMaterial', netString(dt.Material));
        await select(h, out, 'DDLUom', netString(dt.Uom));
        await select(h, out, 'DDLBom', netString(dt.BOMCode));
        const total = netNum(netDouble(dt.Qty));
        out.set.TBTotalQty = { value: total };
        out.viewState.Qty = total;
        out.set.TBQty = { value: '' };
        const uom = parseString(await scalar(`select BaseUom from Material where MatCode = ${digitsOrEmpty(dt.Material)}`));
        await select(h, out, 'DDLUom', uom);
        await select(h, out, 'DdlTotalUom', uom);
        out.set.DDLVariant = { options: await h.fill(`Select VariantCode,Name from VariantHeader where Type=3 and Status=1 and Material=${netLong(dt.Material)}`), index: 0 };
        out.set.DDLMaterial.enabled = mats.length !== 2;
        out.set.TBQty.enabled = true;
        const routes = await h.options('DDLRouting');
        if (routes.length === 2) {
          out.set.DDLRouting = { value: routes[1].value };
          await assignRouting({ ...v, DDLBom: netString(dt.BOMCode), TBTotalQty: total }, h, out);
        }
      });
    },
    DDLRouting: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, () => assignRouting(v, h, out));
    },
    DDLProcessCode: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      return guard(out, () => assignProcess(v, h, out));
    },
    DDLStationCode: async (v, h) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (netString(v.DDLStationCode) !== '') out.set.GVRoute = { rows: await routeWithStations(netString(v.DDLRouting), netString(v.DDLDepartment), netString(v.DDLStationCode)) };
      });
    },
    // btnPrint_Click: one job card (with its stage label row), barcode (+ inspection lot when the stage is
    // auto-processed) and label per piece, each in its own transaction. A failure ends the page with an error (the
    // original's catch block itself fails), keeping the pieces already done.
    btnPrint: async (v, h) => {
      const out = { set: {}, viewState: { ...h.vs } };
      const stop = (m) => ({ ...out, alert: errorMsg(m) });
      if (netString(v.DDLDepartment) === '') return stop(' Select A Department');
      if (netString(v.DDlProdOrder) === '') return stop(' Select A Order');
      if (netString(v.DDLRouting) === '') return stop(' Select A Routing');
      if (netString(v.DDLProcessCode) === '') return stop(' Select A Process');
      if (netString(v.DDLStationCode) === '') return stop(' Select A Station');
      if (netDouble(v.TBQty) <= 0) return stop('Enter Positive Qty');
      if (netDouble(v.TBQty) > netDouble(h.vs.Qty)) {
        if (h.vs.Qty === undefined) throw NRE();
        return stop(`Quantity Can not be greater Than ${netString(h.vs.Qty)}`);
      }
      if (netString(v.DDLPrinter) === '') return stop(' Select A Printer');
      if (!(await printerOnline(v.DDLPrinter))) return stop('Printer is Offline');
      const t = netInt(v.TBQty);
      const alerts = [];
      if (netString(v.DDLBom) === '') alerts.push(errorMsg('Select a BOM')); // CreateProcessOrder: alerts, carries on
      const [route, process, bom] = [digitsOrEmpty(v.DDLRouting), digitsOrEmpty(v.DDLProcessCode), digitsOrEmpty(v.DDLBom)];
      const bp = await printerDetail(v.DDLPrinter);
      await scalar(`Select SeqNo from RoutingTrans where RouteCode=${route} and ProcessCode=${process} and SeqNo=( Select Min(SeqNo) from RoutingTrans where RouteCode=${route} and StageLabel=1 )`); // isFirstStage (unused)
      const stageMat = parseString(await scalar(`Select top 1 Material from BOMINPUT where BOMCODE=${bom} and ProcessCode=${process}`));
      const auto = netInt(await scalar(`Select AutoProcessing from RoutingTrans where routecode=${route} and ProcessCode=${process}`));
      const copies = auto < 0 ? 1 : netInt(await scalar(`Select top 1 NoofCopy from RoutingTrans where routecode=${route} and ProcessCode=${process}`));
      const spec = { ...h.spec, top: { tag: `${h.spec.top.tag}|MaterialBarcode` } }; // AVProcess.CollectData(TopPanel, stage)
      await scalar(`Select Top 1 Material from BOMInput  where BOMCode=${bom} and ProcessCode=${process} and ScanReq=1 `);
      const bu = netString(v.DDLBU);
      let serial = '';
      let firstBarcode = '';
      let bar = null;
      let insp = null;
      let label = null;
      for (let i = 1; i <= t; i++) {
        await transaction(async (tx) => {
          const s = i === 1 ? await generateSerialNo(v.DDLMaterial, stageMat, bu, v.DDLDepartment, v.DDLProcessCode, 1, tx) : await generateSerialNoWRL(v.DDLProcessCode, stageMat, bu, serial, tx);
          serial = s.keyNo;
          // SaveStageWiseProcessOrderWRLNoBarcode: the job card for one piece with its stage label row
          const ds = await collect(spec, h.raw ?? v, h.ctx);
          const tbl = (n) => ds.tables.find((x) => x.schema.name.toLowerCase() === n.toLowerCase());
          const po = tbl('ProcessOrder');
          const col = (x, c) => x.schema.col(c)?.name ?? c;
          if (!po.rows[0]) throw new Error('There is no row at position 0.');
          po.rows[0].set(col(po, 'Qty'), 1);
          po.rows[0].set(col(po, 'MainPSNO'), netInt(v.DDLVariant));
          const psl = tbl('ProcessStageLabel');
          if (!psl.rows[0]) throw new Error('There is no row at position 0.');
          for (const [c, x] of [['PsNo', 0], ['SeqNo', 0], ['ProcessCode', v.DDLProcessCode], ['StationCode', netLong(v.DDLStationCode)], ['BarcodeNo', serial]]) psl.rows[0].set(col(psl, c), x);
          psl.prefix = 'PsNo';
          const head = po.rows[0];
          const [hBu, hDept, hUom] = ['BusinessUnit', 'Department', 'UOM'].map((c) => head.get(col(po, c)));
          const psNo = await insert(spec, ds, h.ctx, { wrl: true, tx });
          if (i === 1) {
            // SaveMaterialBarcodeWRLProdcutionPrintWithoutAllData
            if (auto < 0) {
              const { key, prefix } = await generateKey('InspectionHeader', t, netInt(hBu), tx);
              insp = await newRow('InspectionHeader', { InspectionLotNo: key, Alias: `${prefix}${key}`, DocType: 4001, DocDate: nowMinute(), DocNo: psNo, Process: 0, Material: netLong(stageMat), Qty: 1, Uom: hUom, DocLine: 0, Department: hDept, BusinessUnit: hBu, Status: 1 });
              await insertRow(insp, h.ctx, tx);
            }
            const { key, prefix } = await generateKey('MaterialBarcode', t, netInt(hBu), tx);
            firstBarcode = key;
            bar = await newRow('MaterialBarcode', {
              BarcodeNo: key, Alias: `${prefix}${key}`, DocType: 4001, DocNo: psNo, DocLine: 0, Material: netLong(stageMat), Serial: serial, PackQty: 1, CurrentQty: 1, Uom: hUom, IssuedQty: 0,
              BusinessUnit: hBu, Department: hDept, ABusinessUnit: hBu, ADepartment: hDept, Area: 0, StockID: 0, ProcessCode: v.DDLProcessCode, WorkCenter: v.DDLStationCode, CreatedOn: nowSecond(),
              PrintStatus: 1, LooseStatus: 0, Sample: 0, ...(auto < 0 ? { InspectionLotNo: insp.row.get(insp.schema.col('InspectionLotNo').name), QCStatus: 11 } : { QCStatus: 12 }), Status: 1, Project: netInt(v.DDLVariant),
            });
            await insertRow(bar, h.ctx, tx);
            label = await prodStartLabelData(psNo, firstBarcode, tx);
          } else {
            // SaveMaterialBarcodeWRLProdcutionPrintWithAllData: the first piece's rows again, numbers + 1
            const c = (x, n) => x.schema.col(n).name;
            bar.row.set(c(bar, 'DocNo'), psNo);
            if (insp) {
              insp.row.set(c(insp, 'DocNo'), psNo);
              const lot = String(BigInt(netString(insp.row.get(c(insp, 'InspectionLotNo')))) + 1n);
              insp.row.set(c(insp, 'InspectionLotNo'), lot);
              insp.row.set(c(insp, 'Alias'), lot);
              await insertRow(insp, h.ctx, tx);
            }
            const no = String(BigInt(netString(bar.row.get(c(bar, 'BarcodeNo')))) + 1n);
            bar.row.set(c(bar, 'BarcodeNo'), no);
            bar.row.set(c(bar, 'InspectionLotNo'), insp ? insp.row.get(c(insp, 'InspectionLotNo')) : 0);
            bar.row.set(c(bar, 'Alias'), no);
            bar.row.set(c(bar, 'Serial'), serial);
            await insertRow(bar, h.ctx, tx);
            // the label keeps the first piece's header and barcode number; only the serial changes
            label.mat.rows[0].BarcodeNo = firstBarcode;
            label.mat.rows[0].Serial = serial;
          }
        });
        await printProdStart(label, v.DDLPrinter, bp, copies);
        await execute(`Update MaterialBarcode set PrintStatus=1 where BarcodeNo=${digitsOrEmpty(firstBarcode)}`);
        out.viewState.Qty = netNum(netDouble(out.viewState.Qty) - 1);
      }
      Object.assign(out.set, { ContentPanel: { visible: false }, TBQty: { value: '', enabled: true } });
      if (netDouble(out.viewState.Qty) <= 0) {
        await select(h, out, 'DDlProdOrder', '');
        Object.assign(out.set, { DDLMaterial: { options: [], value: '' }, DDLRouting: { options: [], value: '' }, DDLBom: { options: [], value: '' } });
      }
      const now = new Date();
      await logEvent({ businessUnit: 12201, user: 0, module: 'Last Status', action: 1, ok: true, message: 'Event End', refId: 0, data: 'Label Printing', at: now, time: [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':') }); // AVMachineIntegration.CaptureEventLog
      return { ...out, alerts, success: true, message: 'Assigned Succefully' };
    },
  },
});

// ---- WIPCaptureForm: the shop-floor stage-label scan (WRL: every department is ControlIndicator 10000) -----------
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

// ---- WIPCaptureForm QC (scan result 30: QC stage) ------------------------------------------------------------------
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
        return { ud: Array.isArray(h.vs.QCDataTable) ? h.vs.QCDataTable : null, defects, status, nextAction: netString(v.DDLNextAction), barcode: netString(v.TBBarcode), ps: order, rowID: netString(h.vs.LineCode), process: netString(h.vs.ProcessCode), lot: netString(h.vs.InspectionLotNo), parameterCode: '0', station: tagOf(h, out, 'TBWorkStation'), controlId: netInt(h.vs.ControlID), printer: netString(v.DDLQCPrinter), bee: netString(v.TbBEENo).trim(), dept: netString(v.DDLDepartment) };
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

// ---- ReworkConfirmationNew: a rework (next action 1) confirmed at the QC desk -------------------------------------
// ViewState: Qty (the inspection's quantity), PendingQty, UDDataTable, __Go / __BarcodeEnabled (Go's text, TBBarcode
// enabled). The record list follows the department (DDLDepartment_SelectedIndexChanged rewrites its Tag).

const REWORK_NEW = 'View/Quality/ReworkConfirmationNew.aspx';
Object.assign(PAGE_INIT, { [REWORK_NEW]: async (controls, vs) => Object.assign(vs, { Qty: '0', __Go: 'Go', __BarcodeEnabled: '1' }) });
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
