// production/prod-plan-upload.js: the original page's code-behind, ported (registered in registry.js).
import { scalar, execute, query } from '../../../../db/pool.js';
import { netString, netInt } from '../../../../shared/net.js';
import { generateKey } from '../../write.js';
import { NRE, errorMsg, guard } from '../_shared.js';
import { PAGE_EVENTS, PAGE_LOAD } from '../registry.js';

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
