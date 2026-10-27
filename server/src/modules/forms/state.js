// Port of ControlA.InitalizeForm / SetTextBox / SetDropDown / ClearForm / AssignData: given a form spec, produce the
// state the original page showed (options, values, required/enabled/visible, captions). Only controls whose Tag has
// at least 4 segments take part, as in the original.
import { query, scalar } from '../../db/pool.js';
import { netString, netBool } from '../../shared/net.js';
import { num } from '../../shared/sql.js';
import { setting } from '../settings/settings.service.js';
import { formTables } from './schema.js';
import { toText } from '../../shared/values.js';
import { gridInitial, gridRows, roleTree } from './children.js';
import { PAGE_INIT, PAGE_DISPLAY } from './pages.js';
import { qcInitial } from './qc.js';
import { fill } from '../../db/options.js';

const pad = (n) => String(n).padStart(2, '0');
const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowS = (d = new Date()) => `${today(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** Controls taking part in the engine, with their Tag split out. */
const IMAGE_UC = new Set(['UserControl:uimg:uploadimage', 'UserControl:uimg:captureimage']);
const COMBO_UC = 'UserControl:cbc:comboboxcontrol'; // search picker: one item, the row picked

export function engineControls(spec) {
  return spec.controls
    // the image user controls (UploadImage / CaptureImage: a hidden TBImage) take part as "Image"; the other user
    // controls (ComboBox, GridHeader) are handled by the page ports
    .filter((c) => c.tag && c.tag.length >= 4 && (!c.type.startsWith('UserControl:') || IMAGE_UC.has(c.type) || c.type === COMBO_UC))
    .map((c) => ({ ...c, type: IMAGE_UC.has(c.type) ? 'Image' : c.type === COMBO_UC ? 'ComboBox' : c.type, table: c.tag[0], column: c.tag[1], cond: c.tag[2], query: c.tag[3] }));
}

/** InitalizeForm (+ captions/title) then ClearForm: the "Add" state of a form. */
export async function newFormState(spec, ctx) {
  const tables = await formTables(spec);
  const tableOf = (n) => tables.find((t) => t.name.toLowerCase() === n.toLowerCase().trim());
  const bu = netString(ctx.businessUnit);
  const buVisible = setting('BusinessUnitVisible') === 0 ? false : true; // Settings default 1
  const captions = spec.formModuleId ? await query('Select Tag,Caption from Caption where Module=@m', { m: spec.formModuleId }).catch(() => []) : [];
  const title = spec.formModuleId ? netString(await scalar('select Caption from modules where moduleID=@m', { m: spec.formModuleId }).catch(() => '')) : '';

  const out = [];
  for (const c of engineControls(spec)) {
    const s = { id: c.id, type: c.type, table: c.table, column: c.column, cond: c.cond, parent: spec.controls.find((x) => x.id === c.id)?.parent ?? null, visible: c.attrs.visible?.toLowerCase() !== 'false', enabled: c.attrs.enabled?.toLowerCase() !== 'false', readOnly: c.attrs.readonly?.toLowerCase() === 'true' };
    const t = tableOf(c.table);
    const col = t?.col(c.column) ?? null;
    const cond = c.cond.replaceAll('$', '');

    if (c.type === 'Label') {
      s.text = c.text;
      const cap = captions.find((x) => netString(x.Tag).trim().toLowerCase() === c.column.toString().trim().toLowerCase());
      if (cap) s.text = netString(cap.Caption);
      if (c.column.toUpperCase() === 'BUSINESSUNIT') s.visible = buVisible;
    } else if (c.type === 'TextBox') {
      // SetTextBox
      s.inputType = c.attrs.textmode?.toLowerCase() === 'multiline' ? 'textarea' : c.attrs.textmode?.toLowerCase() === 'password' ? 'password' : c.attrs.type?.toLowerCase() || 'text'; // markup type (e.g. "time") unless the engine sets one
      s.value = '';
      if (col) {
        if (col.type === 'string' && col.name.toLowerCase() !== 'alias') s.maxLength = col.maxLength;
        else if (col.type === 'integer') Object.assign(s, { inputType: 'number', step: '1' });
        else if (col.type === 'decimal') Object.assign(s, { inputType: 'number', step: '0.01' });
        else if (col.type === 'datetime' && cond === 'D') s.inputType = 'date';
        else if (col.type === 'datetime' && cond === 'DT') s.inputType = 'datetime-local';
        else if (col.type === 'datetime' && (cond === 'CD' || cond === 'CDW')) Object.assign(s, { inputType: 'date', value: today(), enabled: false });
        else if (col.type === 'datetime' && cond === 'CDT') Object.assign(s, { inputType: 'datetime-local', value: nowS(), enabled: false });
        else if (col.type === 'datetime') s.inputType = 'date';
        if (!col.nullable) s.required = true;
        if (cond.toUpperCase().includes('DV=')) s.value = cond.split('=')[1];
        if (tables[0]?.pk && tables[0].pk.toUpperCase() === c.column.toUpperCase() && t?.pk) s.value = '0';
      } else if (cond === 'D') s.inputType = 'date';
      else if (cond === 'DT') s.inputType = 'datetime-local';
      else if (cond === 'CD') Object.assign(s, { inputType: 'date', value: today() });
      else if (cond === 'CDT') Object.assign(s, { inputType: 'datetime-local', value: nowS() });
    } else if (c.type === 'DropDownList') {
      // SetDropDown
      s.options = c.items?.length ? c.items.map(({ value, text }) => ({ value, text })) : [];
      let q = c.query;
      if (t) {
        if (col) {
          if (cond.toUpperCase().trim() === 'ST') s.enabled = true;
          if (cond !== 'X') {
            if (cond === 'RESET') s.options = (await fill(q)) ?? s.options;
            else if (cond.toLowerCase().includes('where') && cond.toUpperCase().includes('BU')) {
              if (!s.options.length) s.options = (await fill(`${q} ${cond.replace('<BUC>', '<BU>').replace('<BUR>', '<BU>').replaceAll('<BU>', bu)}`)) ?? s.options;
            } else if ((!cond.toLowerCase().includes('where') || cond.toUpperCase().includes('BU')) && !s.options.length) s.options = (await fill(q)) ?? s.options;
          }
          if (cond.trim() === 'BU') Object.assign(s, { value: bu, enabled: false });
          else if (cond.trim() === 'BUR') s.options = s.options.filter((o, i) => i !== s.options.findIndex((x) => x.value === bu));
          if (cond.trim().includes('Index')) s.value = s.options[Number(cond.split('-')[1])]?.value;
          if (!col.nullable) s.required = true;
          // SelectedValue = the session's department: selects it only when listed (a first load does not throw)
          if (c.column.toUpperCase().trim() === 'DEPARTMENT' && ctx.department != null && s.options.some((o) => o.value === netString(ctx.department))) s.value = netString(ctx.department);
        }
      } else if (c.table.trim() === '' && c.column.trim() === '') {
        let cn = cond;
        if (cn.toLowerCase().includes('where') && cn.toUpperCase().includes('BU')) {
          if (q.toLowerCase().includes('where')) cn = cn.replace('where', ' and ');
          cn = cn.replace('<BUC>', '<BU>').replace('<BUR>', '<BU>');
          if (!s.options.length) s.options = (await fill(`${q} ${cn.replaceAll('<BU>', bu)}`, 'Select A Value')) ?? s.options;
        } else if (cn.toUpperCase().includes('BU')) {
          s.options = (await fill(q)) ?? s.options;
          Object.assign(s, { value: bu, enabled: false });
        } else if (q !== '' && cn !== 'X') s.options = (await fill(q)) ?? s.options;
      } else if (c.column.trim() !== '' && cond !== 'X') {
        if (cond.toLowerCase().includes('where') && cond.toUpperCase().includes('BU')) {
          if (!s.options.length) s.options = (await fill(`${q} ${cond.replace('<BUC>', '<BU>').replace('<BUR>', '<BU>').replaceAll('<BU>', bu)}`)) ?? s.options;
        } else if (cond.toUpperCase().includes('BU')) {
          s.options = (await fill(q)) ?? s.options;
          Object.assign(s, { value: bu, enabled: false });
        }
      }
      if (c.column.toUpperCase() === 'BUSINESSUNIT') s.visible = buVisible;
      if (s.value === undefined) s.value = s.options.find((o) => c.items?.find((i) => i.selected && i.value === o.value))?.value ?? s.options[0]?.value ?? '';
    } else if (c.type === 'CheckBox') {
      s.text = c.text;
      s.value = false;
    } else if (c.type === 'CheckBoxList') {
      const opts = (c.query.replaceAll('$', '').trim() !== '' ? await fill(c.query.replaceAll('$', '')) : null)?.slice(1) ?? c.items ?? [];
      s.options = opts;
      s.value = opts.length > 1 ? [opts[0].value] : [];
    } else if (c.type === 'GridView') {
      Object.assign(s, {
        childTable: c.tag[1],
        fk: c.tag[2],
        keyName: (c.attrs.datakeynames ?? '').split(',')[0].trim() || null,
        columns: c.columns.filter((x) => x.kind !== 'commandfield'),
        rows: await gridInitial(c),
      });
    } else if (c.type === 'TreeView') {
      if (c.column === 'Role') Object.assign(s, { nodes: await roleTree(), value: [] });
    } else if (c.type === 'Panel' || c.type === 'Button') {
      if (c.type === 'Button') s.text = spec.controls.find((x) => x.id === c.id)?.text ?? '';
      if (c.cond.trim() === '0') s.visible = false;
      if (c.cond.trim() === '1') s.visible = true;
    }
    out.push(s);
  }

  // Page-level controls (no engine Tag): editors, panels, buttons, the image upload; only page code touches them.
  out.push(...pageControls(spec));
  // QCValueCaptureControl: hidden until the page opens it; its state (checklist rows, shown item, inputs) is its value
  for (const s of out) if (s.type === 'QC') s.value = await qcInitial();
  for (const s of out) Object.assign(s, { caption: captionOf(spec, s.id), order: spec.controls.findIndex((c) => c.id === s.id) });
  const viewState = {};
  await PAGE_INIT[spec.file]?.(out, viewState, { fill });

  // ClearForm
  for (const s of out) {
    if (s.page) continue;
    if (s.cond.includes('VFALSE')) s.visible = false;
    if (s.cond.includes('$')) continue;
    if (s.type === 'TextBox') {
      if (s.cond === 'CD') Object.assign(s, { inputType: 'date', value: today() });
      else if (s.cond === 'CDT') Object.assign(s, { inputType: 'datetime-local', value: nowS() });
      else if (s.cond === '*') s.value = '0';
      else s.value = '';
      if (s.cond.toUpperCase().includes('DV=')) s.value = s.cond.split('=')[1];
    } else if (s.type === 'DropDownList') {
      if (!s.cond.includes('BU') && !s.cond.includes('NC')) {
        s.value = s.cond.includes('Index') ? s.options[Number(s.cond.split('-')[1])]?.value ?? '' : s.options[0]?.value ?? '';
      } else if (s.cond.includes('Index')) s.value = s.options[Number(s.cond.split('-')[1])]?.value ?? s.value;
    } else if (s.type === 'CheckBox') s.value = false;
    else if (s.type === 'Image') s.value = ''; // TBImage.Text = ""
    else if (s.type === 'ComboBox') Object.assign(s, { options: [], value: '' }); // its list emptied; Display does not fill it
    else if (s.type === 'CheckBoxList' && s.options.length > 1) s.value = [];
    else if (s.type === 'GridView') {
      const c = spec.controls.find((x) => x.id === s.id);
      s.rows = s.cond.includes('CLEAR') ? [] : await gridInitial(c);
    } else if (s.type === 'TreeView') s.value = [];
    else if (s.type === 'Label' && (s.cond.trim() === '0' || s.cond.trim() === '1')) s.visible = s.cond.trim() === '1';
  }
  return { title: title || spec.title, controls: out, tables, viewState };
}

const PAGE_TYPES = new Set(['TextBox', 'DropDownList', 'CheckBox', 'Panel', 'Button', 'ImageButton', 'FileUpload', 'GridView', 'UserControl:qc:qc', 'UserControl:ff:footer', 'Image', 'UserControl:uimg:uploadimage', 'Label', 'ListBox']);
const SKIP_IDS = new Set(['TitleControl', 'StatusBar', 'TopPanel', 'ViewPanel']);

/** Controls the engine ignores (Tag missing or under 4 parts) but the page code uses. */
export function pageControls(spec) {
  return spec.controls
    // Labels only when empty in the markup (the page writes them, e.g. a UOM beside a quantity); others are captions
    .filter((c) => c.id && !c.inGrid && PAGE_TYPES.has(c.type) && !SKIP_IDS.has(c.id) && !(c.type === 'Label' && (c.tag || netString(c.text) !== '')) && !(c.tag && c.tag.length >= 4 && (!c.type.startsWith('UserControl:') || IMAGE_UC.has(c.type) || c.type === COMBO_UC)))
    .map((c) => {
      const s = { id: c.id, type: c.type === 'UserControl:uimg:uploadimage' ? 'Image' : c.type === 'UserControl:qc:qc' ? 'QC' : c.type === 'UserControl:ff:footer' ? 'Footer' : c.type === 'Image' ? 'Picture' : c.type === 'ListBox' ? 'DropDownList' : c.type, ...(c.type === 'ListBox' ? { listBox: true } : {}), page: true, table: '', column: '', cond: '', parent: c.parent ?? null, visible: c.attrs.visible?.toLowerCase() !== 'false', enabled: c.attrs.enabled?.toLowerCase() !== 'false' };
      if (c.type === 'TextBox') {
        const mode = { multiline: 'textarea', password: 'password', date: 'date', time: 'time', number: 'number' }[c.attrs.textmode?.toLowerCase()];
        Object.assign(s, { value: '', inputType: mode ?? (c.attrs.type?.toLowerCase() || 'text') });
      }
      if (c.type === 'DropDownList' || c.type === 'ListBox') {
        s.options = (c.items ?? []).map((i) => ({ value: i.value, text: i.text }));
        s.value = (c.items ?? []).find((i) => i.selected)?.value ?? s.options[0]?.value ?? '';
      }
      if (c.type === 'CheckBox') s.value = false;
      if (c.type === 'Button' || c.type === 'ImageButton' || c.type === 'Label') s.text = c.text ?? '';
      if (c.type === 'Image') s.value = ''; // asp:Image: its ImageUrl, shown only
      if (c.type === 'FileUpload') s.value = null; // { name, data(base64) } once picked
      // a grid with no Tag: filled by page code only
      if (c.type === 'GridView') Object.assign(s, { columns: c.columns ?? [], rows: [], keyName: (c.attrs.datakeynames ?? '').split(',')[0].trim() });
      if (s.type === 'Image') s.value = '';
      return s;
    });
}

/** The Label just before a control in the markup ("<div class=item><Label/><Control/></div>"). */
function captionOf(spec, id) {
  const i = spec.controls.findIndex((c) => c.id === id);
  const prev = i > 0 ? spec.controls[i - 1] : null;
  return prev?.type === 'Label' && (prev.parent ?? null) === (spec.controls[i].parent ?? null) ? (prev.text ?? '').replace(/\s*:\s*$/, '') : null;
}

/** ViewControl selection: ClearForm then AActions.Display (ExecuteDataSet + AssignData). */
/** pageCode: false for Copy (Avctions.Copy fills the form without the page's display(key)) */
export async function displayState(spec, ctx, key, { pageCode = true } = {}) {
  const hooks = pageCode ? PAGE_DISPLAY[spec.file] : null;
  const state = await newFormState(spec, ctx);
  const keyField = (spec.view?.tag ?? '').split('|')[1].split('.').at(-1);
  const data = new Map();
  for (const t of state.tables) {
    // DataWrapper.ExecuteDataSet splices the key unquoted: a number compares as one; anything else is not valid SQL
    const k = netString(key).trim();
    if (!/^-?\d+(\.\d+)?$/.test(k)) throw new Error(`Invalid column name '${k}'.`);
    const rows = await query(`Select * from ${t.name} where ${keyField} = ${k}`);
    data.set(t.name.toLowerCase(), rows);
  }
  const main = data.get(state.tables[0].name.toLowerCase()) ?? [];
  if (!main.length) throw new Error('There is no row at position 0.'); // AssignData reads ds.Tables[0].Rows[0]
  const pkValue = main[0][keyField] ?? Object.entries(main[0]).find(([k]) => k.toLowerCase() === keyField.toLowerCase())?.[1];
  // a page's display(key) code before / after AU.Display (e.g. set the department, refill the area list)
  await hooks?.before?.(state.controls, main[0], ctx, state.viewState);
  for (const s of state.controls) {
    // child tables first (AssignData looks for a tree / grid / checkbox list per table)
    if (s.type === 'GridView' && state.tables.some((t) => t.name.toLowerCase() === s.childTable.toLowerCase().trim())) {
      s.rows = await gridRows(spec.controls.find((x) => x.id === s.id), pkValue);
      continue;
    }
    if (s.type === 'TreeView' && s.nodes) {
      const rows = data.get(s.table.toLowerCase().trim()) ?? [];
      s.value = rows.map((r) => netString(r.ModuleID ?? r.ModuleId));
      continue;
    }
    const t = state.tables.find((x) => x.name.toLowerCase() === s.table.toLowerCase().trim());
    if (s.type === 'Panel') {
      if (s.cond.trim() === '0') s.visible = true;
      continue;
    }
    if (!t) continue;
    const col = t.col(s.column);
    const rows = data.get(t.name.toLowerCase()) ?? [];
    if (!col || !rows.length) continue;
    const v = rows[0][col.name];
    if (s.type === 'TextBox') {
      if (col.type === 'date' || col.type === 'datetime') {
        if (v instanceof Date) s.value = s.cond === 'CDT' ? `${today(v)}T${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}` : today(v);
        else if (v === null) s.value = s.value; // DBNull.ToString() == "" -> left as cleared
      } else if (col.type === 'byte' && Buffer.isBuffer(v)) s.value = `data:image/png;base64,${v.toString('base64')}`;
      else s.value = toText(v, col);
    } else if (s.type === 'DropDownList') {
      const ctl = engineControls(spec).find((x) => x.id === s.id);
      if (s.cond.toLowerCase().includes('where') && !s.cond.toUpperCase().includes('BU')) {
        // cascading list: refill using the value of the control named in <...>
        const ref = s.cond.split('<')[1]?.replace('>', '').split(/\s/)[0] ?? '';
        const other = state.controls.find((x) => x.id === ref);
        const val = other?.type === 'DropDownList' ? netString(other.value) : '0';
        s.options = (await fill(`${ctl.query} ${s.cond.replace(`<${ref}>`, val).replaceAll('$', '')}`).catch(() => null)) ?? s.options;
      }
      const want = toText(v, col).trim();
      // SelectedValue on a list with no items only caches the value; the rebind below then selects it
      const cached = s.options.length === 0;
      if (s.options.some((o) => o.value === want)) s.value = want;
      if (want !== '' && want !== '0' && s.value !== want && ctl.query.trim() !== '') {
        // FillDropDownListDisplay: add the stored (e.g. inactive) value so it shows
        const q = ctl.query.toLowerCase();
        try {
          // the stored value is spliced unquoted as the original did: a number only (anything else failed there too)
          const extra = `${q.split(' where')[0]} where ${q.split(',')[0].replace('select', '')} = ${num(want)}`;
          const base = (await fill(ctl.query)) ?? [];
          const add = ((await fill(extra)) ?? []).slice(1);
          // DataBind rebinds the rows, then throws because the earlier invalid SelectedValue is still cached;
          // the original swallowed that, so the extra row is listed but nothing is selected.
          s.options = [...base, ...add];
          s.value = cached && s.options.some((o) => o.value === want) ? want : (s.options[0]?.value ?? '');
        } catch {
          /* original swallowed errors here */
        }
      }
    } else if (s.type === 'Image') {
      if (col.type === 'byte' && Buffer.isBuffer(v)) s.value = `data:image/png;base64,${v.toString('base64')}`; // only binary columns are shown
    } else if (s.type === 'CheckBox') {
      s.value = netBool(v);
    } else if (s.type === 'CheckBoxList') {
      s.value = rows.map((r) => toText(r[col.name], col)).filter((x) => s.options.some((o) => o.value === x));
    }
  }
  await hooks?.after?.(state.controls, main[0], ctx, state.viewState, state);
  const status = main[0].Status ?? main[0].status;
  const remark = 'CancelRemark' in main[0] ? netString(main[0].CancelRemark) : null;
  return { ...state, recordStatus: status == null ? -1 : Number(status), statusMessage: Number(status) === 200 && remark !== null ? remark || 'Cancelled Record' : null };
}

/** TitleControl copy list: "Select <view key>,<Name|Alias> from <first table>" with "Select To Copy" (hidden if empty). */
export async function copyOptions(spec) {
  if (!spec.titleBar.copybutton || !spec.view?.tag) return null;
  const [t0] = await formTables(spec);
  const field = t0?.col('Name') ? 'Name' : 'Alias';
  const opts = await fill(`Select ${spec.view.tag.replaceAll('|*', '').split('|')[1]},${field} from ${t0.name}`, 'Select To Copy').catch(() => null);
  return opts && opts.length > 1 ? opts : null;
}

/** BtnCopy_Click: ClearForm, AActions.Copy (record loaded as on display, Alias blanked, grid FK = 0,
 *  TextBoxes of UNIQUE columns blanked), PrimaryKey emptied -> saved as a new record. */
export async function copyState(spec, ctx, key) {
  const s = await displayState(spec, ctx, key, { pageCode: false });
  const t0 = s.tables[0];
  const unique = (await query(
    `SELECT cu.COLUMN_NAME c FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc inner join INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE cu
      on cu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME where tc.CONSTRAINT_TYPE = 'UNIQUE' and tc.TABLE_NAME = @t`,
    { t: t0.name },
  )).map((r) => netString(r.c).toUpperCase());
  for (const c of s.controls) {
    const t = s.tables.find((x) => x.name.toLowerCase() === c.table.toLowerCase().trim());
    if (c.type === 'TextBox' && t?.col('Alias') && c.column.trim().toLowerCase() === 'alias') c.value = '';
    if (c.type === 'GridView') c.rows = c.rows.map((r) => (c.fk in r ? { ...r, [c.fk]: '0' } : r));
  }
  for (const u of unique) {
    // the original walks the controls in reverse document order and stops at the first match
    const tb = s.controls.findLast((c) => c.type === 'TextBox' && c.column.trim().toUpperCase() === u);
    if (tb) tb.value = '';
  }
  const pk = s.controls.find((c) => c.id === 'PrimaryKey');
  if (pk) pk.value = '';
  return { ...s, recordStatus: null, statusMessage: null };
}
