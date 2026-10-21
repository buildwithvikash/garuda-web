// Parity for the Excel-upload pages (AssetTagIDReplacement, ProdPlanUpload, MRPUpdate) on the test copy:
//  - the sheet reader: generated workbooks read by the original AExcelWrapper.ImportExcel and by the new app;
//  - BtnUpdate: the imported table in ViewState (and on the grid), each page's rows applied on the original then the new
//    app; alerts, the grid's row colours and the touched rows compared, everything put back after each run.
// Usage: node --env-file=.env scripts/parity/upload-parity.mjs <originalBinDir>
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { query, execute } from '../../src/db/index.js';
import { loadSettings } from '../../src/modules/settings/service.js';
import { toText } from '../../src/modules/forms/values.js';
import { PAGE_EVENTS, eventHelpers, importExcel } from '../../src/modules/forms/pages.js';

const [bin] = process.argv.slice(2);
const SPECS = JSON.parse(readFileSync(new URL('../../src/modules/forms/forms.json', import.meta.url), 'utf8'));
await loadSettings();
const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
const specOf = (spec) => ({ top: spec.top, view: spec.view, controls: spec.controls, formModuleId: spec.formModuleId, file: spec.file, titleBar: spec.titleBar, inherits: spec.inherits });
const dir = mkdtempSync(join(tmpdir(), 'parity-xl-'));
function original(cases) {
  const file = join(dir, 'cases.json');
  writeFileSync(file, JSON.stringify(cases));
  const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-forms.ps1', import.meta.url)), bin, file], {
    env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
    maxBuffer: 256 * 1024 * 1024,
  }).toString();
  return JSON.parse(raw.slice(raw.indexOf('[')));
}
const results = [];

// ---- the sheet reader ----------------------------------------------------------------------------------------------
const books = {
  'mixed cells': (ws) => {
    ws.addRow(['Sr', 'Material', 'Serial', 'AssetTag']);
    ws.addRow([1, 'D525H223', '42670260800918', 'TAG-1']);
    ws.addRow([2.5, 'X', 1234567890123, true]);
    ws.addRow([3, new Date(Date.UTC(2026, 9, 20)), { formula: '1+2', result: 3 }, 'F']);
    const r = ws.addRow([4]);
    r.getCell(3).value = 'skips B'; // a cell missing in the middle: values shift left, as in the original
    ws.addRow([5, 'a', 'b', 'c', 'extra']);
  },
  'duplicate header': (ws) => {
    ws.addRow(['A', 'B', 'a']);
    ws.addRow([1, 2, 3]);
  },
};
for (const [name, build] of Object.entries(books)) {
  const wb = new ExcelJS.Workbook();
  build(wb.addWorksheet('Sheet1'));
  const path = join(dir, `${name.replaceAll(' ', '_')}.xlsx`);
  await wb.xlsx.writeFile(path);
  const [o] = original([{ id: 0, mode: 'excel', path, ctx, spec: specOf(SPECS['/production/mrpupdateform']) }]);
  const n = await importExcel({ name: 'x.xlsx', data: readFileSync(path).toString('base64') }).catch((e) => ({ error: e.message }));
  const same = o.ok ? !n.error && JSON.stringify(o.result) === JSON.stringify(n) : n.error === o.error;
  results.push([`ImportExcel ${name}`, same ? `IDENTICAL${o.ok ? ` (${o.result.rows.length} rows)` : ` (both fail: ${o.error})`}` : `${o.ok ? JSON.stringify(o.result) : o.error} vs ${n.error ?? JSON.stringify(n)}`]);
}

// ---- BtnUpdate -------------------------------------------------------------------------------------------------------
const one = async (sql) => (await query(sql))[0] ?? {};
const mat = await query("select top 2 MatCode, Name, SRetailRate from Material where Status=1 and Name not like '%''%' order by MatCode desc");
const tagged = await one("select top 1 mb.BarcodeNo, mb.Serial, m.Name, mb.VSerial from MaterialBarcode mb join Material m on m.MatCode=mb.Material where mb.Serial not like '%[^0-9]%' and mb.VSerial is not null order by mb.BarcodeNo desc");
const lettered = await one("select top 1 mb.BarcodeNo, mb.Serial, m.Name, mb.VSerial from MaterialBarcode mb join Material m on m.MatCode=mb.Material where mb.Serial like 'F%' and mb.VSerial is not null order by mb.BarcodeNo desc");
const aliases = (await query('select top 2 Alias from Material where Status=1 and Type=100 order by MatCode desc')).map((r) => r.Alias);
const p2 = (n) => String(n).padStart(2, '0');
const now = new Date();
const thisMonth = `${p2(now.getMonth() + 1)}${now.getFullYear()}`;
const PAGES = [
  ['/production/mrpupdateform', ['Name', 'Old', 'MRP'], [[mat[0].Name, '', '1999.5'], ['ZZP no such material', '', '10'], [mat[1].Name, '', 'abc']],
    async () => ({ mrp: (await query(`select MatCode, SRetailRate from Material where MatCode in (${mat.map((m) => m.MatCode).join(',')})`)).map((r) => toText(r.SRetailRate)), log: (await query("select Material, MRP, UserCode from MRPUpdate where UserCode=123003 and RefDate > dateadd(hour, -1, getdate())")).map((r) => JSON.stringify(r)).sort() }),
    async () => {
      for (const m of mat) await execute('update Material set SRetailRate=@r where MatCode=@m', { r: m.SRetailRate, m: m.MatCode });
      await execute('delete from MRPUpdate where UserCode=123003 and RefDate > dateadd(hour, -1, getdate())');
    }],
  ['/production/assettagidreplacementform', ['Sr', 'Material', 'Serial', 'AssetTag'], [['1', tagged.Name, tagged.Serial, 'ZZP-TAG'], ['2', 'ZZP none', '1', 'X'], ['3', lettered.Name, lettered.Serial, 'ZZP-TAG2']],
    async () => ({ tags: (await query(`select BarcodeNo, VSerial from MaterialBarcode where BarcodeNo in (${tagged.BarcodeNo},${lettered.BarcodeNo ?? 0})`)).map((r) => JSON.stringify(r)).sort(), log: (await query("select Material, FGSerial, OldAssetTagID, NewAssetTagID from AssetTagIDReplace where NewAssetTagID like 'ZZP%'")).map((r) => JSON.stringify(r)).sort() }),
    async () => {
      for (const b of [tagged, lettered]) if (b.BarcodeNo) await execute('update MaterialBarcode set VSerial=@v where BarcodeNo=@b', { v: b.VSerial, b: b.BarcodeNo });
      await execute("delete from AssetTagIDReplace where NewAssetTagID like 'ZZP%'");
    }],
  ['/production/prodplanupload', ['MonthYear', 'Material', 'Qty', 'Type', 'Remark'], [[thisMonth, aliases[0], '25', 'ZZP', 'r1'], [thisMonth, aliases[0], '30', 'ZZP', 'r2'], ['011999', aliases[1], '5', 'ZZP', 'old'], [thisMonth, 'ZZP-NONE', '5', 'ZZP', 'x'], [thisMonth, aliases[1], 'ten', 'ZZP', 'bad qty']],
    async () => ({ plans: (await query("select PlanMonthYear, PlanMaterial, PlanQty, PlanType, Remark, CreatedBy, Status from PlanOrderPrint where PlanType='ZZP'")).map((r) => JSON.stringify(r)).sort() }),
    async () => execute("delete from PlanOrderPrint where PlanType='ZZP'")],
];
for (const [route, columns, rows, snap, restore] of PAGES) {
  const spec = SPECS[route];
  for (const [name, cols] of [['rows', columns], ['wrong column count', [...columns, 'Extra']]]) {
    const dt = { columns: cols, rows: rows.map((r) => (cols.length > columns.length ? [...r, ''] : r)) };
    try {
      await restore();
      const [o] = original([{ id: 0, mode: 'event', key: null, viewState: {}, dataTables: [{ key: 'DT', grid: 'GvDetails', ...dt }], steps: [{ handler: 'BtnUpdate_Click', control: 'BtnUpdate', values: {} }], ctx, spec: specOf(spec) }]);
      const afterO = await snap();
      await restore();
      const v = { GvDetails: [] };
      const r = await PAGE_EVENTS[spec.file].BtnUpdate(v, eventHelpers(spec, ctx, v, { viewState: { DT: dt } }));
      const afterN = await snap();
      const problems = [];
      if (!o.ok) problems.push(`original ERROR ${o.error}`);
      const oa = (o.result?.alerts ?? []).join('|');
      if (o.ok && oa !== (r.alert ?? '')) problems.push(`alert "${oa}" vs "${r.alert ?? ''}"`);
      const oc = (o.result?.controls?.GvDetails?.colors ?? []).join(',');
      const nc = (r.set?.GvDetails?.rows ?? []).map((x) => x.__color ?? '').join(',');
      if (o.ok && name === 'rows' && oc !== nc) problems.push(`row colours ${oc} vs ${nc}`);
      if (JSON.stringify(afterO) !== JSON.stringify(afterN)) problems.push(`rows ${JSON.stringify(afterO).slice(0, 400)} vs ${JSON.stringify(afterN).slice(0, 400)}`);
      results.push([`${route.split('/')[2]} BtnUpdate (${name})`, problems.length ? problems.join(' | ') : `IDENTICAL (${oa ? `alert "${oa}"` : `colours ${nc}`})`]);
    } finally {
      await restore();
    }
  }
}

for (const [r, m] of results) console.log(`${m.startsWith('IDENTICAL') ? 'OK  ' : 'DIFF'} ${r}: ${m}`.slice(0, 900));
process.exit(0);
