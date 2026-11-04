// Production Plan Upload (original View/Production/ProdPlanUpload.aspx): monthly label plans from an Excel sheet. The sheet is
// read and shown first, then each row applied to PlanOrderPrint; a row that cannot be matched is reported, not fatal.
// The rows stay as the original applied them: one statement each, so a failure keeps the rows before it.
import { scalar, execute, query } from '../../../db/pool.js';
import { netString, netInt } from '../../../shared/net.js';
import { generateKey } from '../../forms/write.js';
import { distinctValues, listPage, operatorsFor, OPERATOR_TEXT, searchColumns } from '../../forms/lists.js';
import { FORMS } from '../../forms/specs.js';

export const SCREEN = '/production/prodplanupload';
export const UPLOAD_COLUMNS = 5;

const NRE = () => new Error('Object reference not set to an instance of an object.');

export const list = (ctx, page, search) => listPage(FORMS[SCREEN], ctx, page, search);
export const listColumns = async (ctx) => (await searchColumns(FORMS[SCREEN], ctx)).map((c) => ({ name: c.name, operators: operatorsFor(c.type).map((o) => [o, OPERATOR_TEXT[o]]) }));
export const listValues = async (ctx, column) => (await distinctValues(FORMS[SCREEN], ctx, column)).map((v) => netString(v));

/** AExcelWrapper.ImportExcel on the uploaded .xlsx: row 1 the column names, then each row's cells in document order, as
 *  stored (numbers / dates as their raw values, shared strings as text) */
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

/** a value the original spliced into SQL unquoted: a plain number goes in as such; anything else fails as SQL would */
const bareNumber = (s) => {
  const t = netString(s).trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return t;
  throw new Error(t === '' ? "Incorrect syntax near ','." : `Invalid column name '${t}'.`);
};

/** AVProductionCapture.UploadProdPlanWRL(MMyyyy, material alias, qty, plan type, remark): this or next month only.
 *  false: the row matched nothing */
export async function applyRow(r, ctx) {
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
}

/** each row in order: { applied: [true | false, ...] }, ending at the first row that fails, with its message */
export async function applySheet({ rows }, ctx) {
  const applied = [];
  for (const [i, r] of rows.entries()) {
    try {
      applied.push(await applyRow(r, ctx));
    } catch (e) {
      return { applied, error: `Row ${i + 1}: ${e.message}` };
    }
  }
  return { applied };
}
