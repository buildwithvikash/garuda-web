// QCValueCaptureControl: the checklist popup (one parameter at a time: value by input type, remark, pass/fail, tool
// scan; a grid of all with Pass/Fail buttons for yes/no items). Its state travels as the "QC" control's value:
// { rows (its ViewState DataTable: cell text, null = DBNull), index, f (the child controls) }.
import { queryTable, query } from '../../db/pool.js';
import { netInt, netDouble, exceptionAlert } from '../../shared/net.js';
import { toText } from '../../shared/values.js';
import { fill } from '../../db/options.js';
import { dataTable } from '../../db/tables.js';

/** DataRow[name] (column names are case-insensitive) */
export const cell = (row, name) => {
  const k = Object.keys(row).find((x) => x.toLowerCase() === name.toLowerCase());
  return k === undefined ? undefined : row[k];
};
export const setCell = (row, name, v) => {
  const k = Object.keys(row).find((x) => x.toLowerCase() === name.toLowerCase()) ?? name;
  row[k] = v;
};
const str = (v) => (v === null || v === undefined ? '' : String(v)); // WrapperAvatar.ParseString
const NRE = () => new Error('Object reference not set to an instance of an object.');
const notInList = (id) => new Error(`'${id}' has a SelectedValue which is invalid because it does not exist in the list of items.\r\nParameter name: value`);
const outOfRange = (i) => new Error(`There is no row at position ${i}.`);

/** The control as the markup creates it (TopDataPanel and InstrumentPanel hidden) plus Page_Load's UOM list. */
export async function qcInitial(title = null) {
  const uoms = (await fill('Select UomCode, Alias from UnitOfMeasure where Status=1')) ?? [];
  return {
    rows: null,
    index: null,
    f: {
      lblTitle: title === '' ? 'Usage Desicion' : str(title), // Title (null unless set) replaces the caption when not ""
      TopDataPanel: false, DataPanel: true, Label2: true, LblValue: true, LblList: true, PnlImage: true, InstrumentPanel: false,
      LblDescription: 'Description', GuideImage: { visible: true, url: '~/Assets/Images/QualityInspection.jpg' },
      LblMaxMin: { visible: true, text: 'Min-Max' },
      TBValue: { visible: true, mode: 'Number', text: '' },
      DDLUom: { visible: true, options: uoms, value: uoms[0]?.value ?? '' },
      DDLList: { visible: true, options: [], value: '' },
      TBImage: '', Image: '', TBRemark: '',
      DdlQCStatus: { visible: true, value: '1' },
      TBBarcode: { text: '', tag: '|||' },
      BtnPrevious: { enabled: true, text: '« Previous' },
      BtnNext: { enabled: true, text: 'Next »' },
    },
  };
}

const select = (ctl, value, id) => {
  if (!ctl.options.some((o) => o.value === value)) throw notInList(id);
  ctl.value = value;
};

/** Display(dr): the parameter's description, guide image and the input its type needs */
async function display(s, dr) {
  const f = s.f;
  Object.assign(f, { TopDataPanel: true, DataPanel: true, Label2: true });
  f.DdlQCStatus.visible = true;
  f.LblDescription = str(cell(dr, 'Description'));
  const guide = str(cell(dr, 'GuideImage')).trim();
  f.GuideImage = guide !== '' ? { visible: true, url: str(cell(dr, 'GuideImage')) } : { ...f.GuideImage, visible: false };
  f.LblMaxMin.visible = false;
  const type = str(cell(dr, 'InputType')).toLowerCase();
  const noImage = () => Object.assign(f, { PnlImage: false, TBImage: '', Image: '' });
  if (type === 'text') {
    Object.assign(f, { LblValue: true, LblList: false, TBRemark: str(cell(dr, 'remark')) });
    f.TBValue = { visible: true, mode: 'SingleLine', text: str(cell(dr, 'qcvalue')) };
    f.DDLUom.visible = false;
    f.DDLList.visible = false;
    noImage();
  } else if (type === 'numeric') {
    f.LblMaxMin = { visible: true, text: `Max - Min Limit : ${str(cell(dr, 'MinValue'))} -${str(cell(dr, 'MaxValue'))}` };
    f.LblValue = true;
    f.TBValue = { visible: true, mode: 'Number', text: f.TBValue.text };
    f.DDLUom.visible = true;
    if (netInt(cell(dr, 'Uom')) > 0) select(f.DDLUom, str(cell(dr, 'Uom')), 'DDLUom');
    f.DDLList.visible = false;
    f.LblList = false;
    f.TBValue.text = str(cell(dr, 'qcvalue'));
    f.TBRemark = str(cell(dr, 'remark'));
    noImage();
  } else if (type === 'bit') {
    Object.assign(f, { TopDataPanel: true, DataPanel: false, InstrumentPanel: false, LblList: true, LblValue: false });
    f.TBValue.visible = false;
    f.DDLUom.visible = false;
    f.DDLList = { visible: true, options: [{ value: '', text: '' }, { value: '1', text: 'Yes' }, { value: '0', text: 'No' }], value: '' };
    select(f.DDLList, str(cell(dr, 'qcvalue')), 'DDLList');
    f.TBRemark = str(cell(dr, 'remark'));
    noImage();
    f.DdlQCStatus.visible = false;
    f.Label2 = false;
  } else if (type === 'image') {
    Object.assign(f, { LblValue: false, LblList: false, PnlImage: true });
    f.TBValue.visible = false;
    f.DDLUom.visible = false;
    f.DDLList.visible = false;
    f.TBImage = str(cell(dr, 'qcvalue'));
    f.Image = f.TBImage;
    f.TBRemark = str(cell(dr, 'remark'));
  } else if (type === 'list') {
    Object.assign(f, { LblList: true, LblValue: false });
    f.TBValue.visible = false;
    f.DDLUom.visible = false;
    noImage();
    f.DDLList = { visible: true, options: (await fill(`select Value from ParameterListTran where Code= ${netInt(cell(dr, 'List'))}`)) ?? [], value: '' };
    if (f.DDLList.options.length > 1 && str(cell(dr, 'qcvalue')) !== '') select(f.DDLList, String(netInt(cell(dr, 'qcvalue'))), 'DDLList');
  }
  if (netInt(cell(dr, 'Instrument')) > 0) {
    f.InstrumentPanel = true;
    f.TBBarcode = { text: str(cell(dr, 'InstrumentID')), tag: str(cell(dr, 'InstrumentID')) };
  } else {
    f.InstrumentPanel = false;
    f.TBBarcode = { text: str(cell(dr, 'InstrumentID')), tag: '' };
  }
  f.DdlQCStatus.value = String(netInt(cell(dr, 'qcstatus')));
  if (!['1', '0'].includes(f.DdlQCStatus.value)) throw notInList('DdlQCStatus');
}

/** MakeUpCheckBox: a yes/no item with no value counts as Yes (passed); otherwise its status follows the value. The
 *  grid is bound again and its yes/no cells show a (disabled) checkbox; a postback that does not rebind it shows the
 *  cells' bound text instead (s.bound). */
function makeUp(rows, s) {
  if (s) s.bound = true;
  for (const e of rows) {
    if (str(cell(e, 'InputType')).toLowerCase() !== 'bit') continue;
    if (str(cell(e, 'qcvalue')) === '') {
      setCell(e, 'qcvalue', '1');
      setCell(e, 'qcstatus', '1');
    } else setCell(e, 'qcstatus', String(netInt(cell(e, 'qcvalue'))));
  }
}

/** InitializeData(dt) */
export async function qcOpen(s, rows) {
  for (const r of rows) for (const c of ['qcvalue', 'remark', 'qcstatus']) if (cell(r, c) === undefined) r[c] = null;
  s.rows = rows;
  s.index = -1;
  if (rows.length) {
    s.index = 0;
    await display(s, rows[0]);
  }
  makeUp(rows, s);
  s.f.BtnPrevious = { enabled: false, text: ' <<  ' };
  s.f.BtnNext = { enabled: true, text: `  >> ${rows.length - 1}` };
  return s;
}

async function next(s) {
  const dt = s.rows ?? (() => { throw NRE(); })();
  let i = netInt(s.index);
  if (dt.length > i + 1) {
    i++;
    await display(s, dt[i]);
    s.index = i;
    s.f.BtnPrevious = { enabled: true, text: `${i} <<  ` };
    s.f.BtnNext = dt.length === i + 1 ? { enabled: false, text: '  >> ' } : { enabled: true, text: `  >> ${dt.length - (i + 1)}` };
  } else {
    s.f.BtnPrevious = { enabled: true, text: `${i} <<  ` };
    s.f.BtnNext = { enabled: false, text: '  >> ' };
  }
  makeUp(dt, s);
}

async function previous(s) {
  const dt = s.rows ?? (() => { throw NRE(); })();
  let i = netInt(s.index);
  if (i > 0) {
    i--;
    if (!dt[i]) throw outOfRange(i);
    await display(s, dt[i]);
    s.index = i;
    s.f.BtnPrevious = i === 0 ? { enabled: false, text: ' <<  ' } : { enabled: true, text: `${i} <<  ` };
    s.f.BtnNext = dt.length === i + 1 ? { enabled: false, text: '  >> ' } : { enabled: true, text: `  >> ${dt.length - (i + 1)}` };
  }
  makeUp(dt, s);
}

const ALERT = (m) => m.replaceAll(',', '&#44');

/** The QC events of a page: name -> (state, args) -> { state, alert? }. close(state, page) is the page's handler. */
export const QC_EVENTS = {
  next: async (s) => (await next(s), {}),
  prev: async (s) => (await previous(s), {}),
  // btnSave_Click: the shown item takes the inputs, then Next
  save: async (s) => {
    const f = s.f;
    if (f.InstrumentPanel && netInt(f.TBBarcode.tag) === 0) {
      f.TBBarcode.text = '';
      return { alert: ALERT('Please Scan the Tool') };
    }
    const i = netInt(s.index);
    const dt = s.rows ?? (() => { throw NRE(); })();
    if (i < 0) return {};
    const dr = dt[i] ?? (() => { throw outOfRange(i); })();
    setCell(dr, 'qcvalue', f.TBValue.visible ? f.TBValue.text : f.DDLList.visible ? f.DDLList.value : f.TBImage);
    setCell(dr, 'InstrumentID', f.InstrumentPanel ? str(f.TBBarcode.tag) : '0');
    setCell(dr, 'remark', f.TBRemark);
    setCell(dr, 'qcstatus', f.DdlQCStatus.value);
    makeUp(dt, s);
    await next(s);
    return {};
  },
  // TBValue_TextChanged: a system-judged number passes inside its limits
  value: async (s) => {
    try {
      const dr = s.rows[netInt(s.index)] ?? (() => { throw outOfRange(netInt(s.index)); })();
      if (str(cell(dr, 'resultdefined')) === 'System' && str(cell(dr, 'InputType')).toLowerCase() === 'numeric') {
        const v = netDouble(s.f.TBValue.text);
        s.f.DdlQCStatus.value = netDouble(cell(dr, 'MinValue')) <= v && netDouble(cell(dr, 'MaxValue')) >= v ? '1' : '0';
      }
      return {};
    } catch (e) {
      return { alert: exceptionAlert(e.message) };
    }
  },
  // DDLList_SelectedIndexChanged: Yes passes, No fails, anything else passes
  list: async (s) => {
    const item = s.f.DDLList.options.find((o) => o.value === s.f.DDLList.value) ?? s.f.DDLList.options[0];
    if (!item) throw NRE();
    s.f.DdlQCStatus.value = item.text === 'No' ? '0' : '1';
    return {};
  },
  // Go_Click: AVQuality.ValidateMaintainanceTool (its SQL is malformed: it always fails)
  go: async (s) => {
    try {
      const dr = s.rows?.[netInt(s.index)] ?? (() => { throw outOfRange(netInt(s.index)); })();
      const rows = await query(`select BarcodeNo,Alias from MaterialBarcode where and Serial=@b and Material=${netInt(cell(dr, 'Instrument'))}`, { b: s.f.TBBarcode.text });
      if (!rows.length) throw new Error('Invalid barcode');
      s.f.TBBarcode = { tag: str(rows[0].BarcodeNo), text: s.f.TBBarcode.text };
      return {};
    } catch (e) {
      s.f.TBBarcode.tag = '';
      return { alert: exceptionAlert(e.message) };
    }
  },
  // a row's Select: GVDetails_RowCommand("Select") runs first, on the row selected before (none yet: a null
  // reference), then GVDetails_SelectedIndexChanged shows the picked item (via Next / Previous from its neighbour)
  select: async (s, key, index) => {
    const before = netInt(s.sel ?? -1);
    let alert;
    if (before < 0 || !s.rows?.[before]) alert = exceptionAlert(NRE().message);
    else {
      const i = s.rows.findIndex((r) => str(cell(r, 'LineCode')) === str(cell(s.rows[before], 'LineCode')));
      if (i >= 0) s.index = i;
    }
    s.sel = netInt(index);
    try {
      const i = (s.rows ?? []).findIndex((r) => str(cell(r, 'LineCode')) === key);
      if (i >= 0) {
        if (i > netInt(s.index)) {
          s.index = i - 1;
          await next(s);
        } else {
          s.index = i + 1;
          await previous(s);
        }
      }
      return alert ? { alert } : {};
    } catch (e) {
      return { alert: alert ?? exceptionAlert(e.message) };
    }
  },
  // GVDetails_RowCommand Fail / Pass on a yes/no item
  Fail: async (s, key, index) => rowCommand(s, index, '0'),
  Pass: async (s, key, index) => rowCommand(s, index, '1'),
};

async function rowCommand(s, index, value) {
  try {
    const row = s.rows?.[netInt(index)];
    if (!row) throw new Error('Index was out of range. Must be non-negative and less than the size of the collection.\r\nParameter name: index');
    s.sel = netInt(index); // GVDetails.SelectedIndex = the row
    const i = s.rows.findIndex((r) => str(cell(r, 'LineCode')) === str(cell(row, 'LineCode')));
    if (i >= 0) s.index = i;
    if (netInt(s.index) >= 0) {
      const dr = s.rows[netInt(s.index)];
      setCell(dr, 'qcvalue', value);
      setCell(dr, 'remark', s.f.TBRemark);
      setCell(dr, 'qcstatus', value);
      makeUp(s.rows, s);
    }
    return {};
  } catch (e) {
    return { alert: exceptionAlert(e.message) };
  }
}

