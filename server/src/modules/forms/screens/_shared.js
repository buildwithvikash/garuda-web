// Helpers used by several screens (ported from the original pages' shared code).
import { execute } from '../../../db/pool.js';
import { netString, netInt, exceptionAlert } from '../../../shared/net.js';
import { QC_EVENTS } from '../qc.js';
import { PAGE_EVENTS } from './registry.js';

// WrapperAvatar.Alert puts the text in alert('…') with "," written as "&#44" (shown as such) and "\" doubled.
export const alertMsg = (m) => m.replaceAll(',', '&#44');

// WrapperAvatar.ErrorAlert: , . ' " ; removed, cut to 250.
export const errorMsg = (m) => m.replace(/[,.'";]/g, '').slice(0, 250);

// "try { … } catch (ex) { WrapperAvatar.ExceptionAlert(Page, ex); }": what ran before the throw stays.
export async function guard(out, fn) {
  try {
    await fn();
  } catch (e) {
    out.alert = exceptionAlert(e.message);
  }
  return out;
}

export const parseString = (v) => (netString(v) === '&nbsp;' ? '' : netString(v));

export const parseStringZero = (v) => (netString(v) === '' || netString(v) === '0' ? '' : netString(v));

export const notInList = (id) => new Error(`'${id}' has a SelectedValue which is invalid because it does not exist in the list of items.\r\nParameter name: value`);

export const NRE = () => new Error('Object reference not set to an instance of an object.');

export const noKey = () => {
  throw NRE();
};

/** DropDownList.SelectedValue = value (throws when the value is not listed). */
export async function select(h, out, id, value) {
  const opts = out.set[id]?.options ?? (await h.options(id));
  if (!opts.some((o) => o.value === value)) throw notInList(id);
  out.set[id] = { ...out.set[id], value };
}

/** DropDownList.SelectedItem.Text (null reference when the list is empty). */
export async function selectedText(h, id, value) {
  const opts = await h.options(id);
  const o = opts.find((x) => x.value === value) ?? opts[0];
  if (!o) throw NRE();
  return o.text;
}

/** AU.GridViewRowDeleting(sender, e, grid, dt): a row already saved (FK > 0) is deleted from the table at once.
 *  given: the ViewState table when the page keeps its own (default: the rows shown) */
export async function gridDelete(h, gridId, keyValue, given) {
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

/** The QC popup's own events ("QC:<name>") on a page; close(rows, values, helpers) is the page's btncloseHandler. */
export function withQC(file, close, id = 'QC') {
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

/** DDLStatus_SelectedIndexChanged: the defect panel for a rejection when there are defect codes */
export async function qiStatusChanged(v, h, out) {
  const defects = out.set.DDLDefectCodes?.options ?? (await h.options('DDLDefectCodes'));
  const status = out.set.DDLStatus?.value ?? v.DDLStatus;
  if (defects.length === 0) out.set.DefectPanel = { visible: false };
  else {
    out.set.DDLNextAction = { index: 0 };
    out.set.DefectPanel = { visible: status !== '12' };
  }
}
