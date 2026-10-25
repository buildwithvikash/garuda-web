// WIPCaptureForm parity: a component-scanning stage run end to end on both sides (department, station, the stage
// label scan, every component, then the stage completing), comparing the screen, the alerts and every row the run
// changes; the rows are put back after each side.
// Usage: node --env-file=.env scripts/parity/wip-parity.mjs <originalBinDir>
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { query, execute } from '../../src/db/connection.js';
import { loadSettings } from '../../src/services/settings/settings.service.js';
import { newFormState } from '../../src/services/forms/state.service.js';
import { PAGE_EVENTS, eventHelpers } from '../../src/services/forms/pages.service.js';
import { validateVendorSerialNew } from '../../src/services/production/production.service.js';
import { capture, restore, state, differences } from './rowset.mjs';

const run = promisify(execFile);
const [bin] = process.argv.slice(2);
const SPECS = JSON.parse(readFileSync(new URL('../../src/data/forms/forms.json', import.meta.url), 'utf8'));
await loadSettings();
const route = '/production/wipcaptureform';
const spec = SPECS[route];
const specOf = (s) => ({ top: s.top, view: s.view, controls: s.controls, formModuleId: s.formModuleId, file: s.file, titleBar: s.titleBar, inherits: s.inherits });

async function original(c) {
  const file = join(mkdtempSync(join(tmpdir(), 'parity-')), 'cases.json');
  writeFileSync(file, JSON.stringify([c]));
  const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-forms.ps1', import.meta.url)), bin, file], {
    env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(stdout.slice(stdout.indexOf('[')))[0];
}

/** the new app: the steps as the browser would post them (values, ViewState, the page as shown) */
async function runNew(ctx, steps) {
  const st = await newFormState(spec, ctx);
  const controls = structuredClone(st.controls);
  const byId = (id) => controls.find((c) => c.id === id);
  let vs = { ...st.viewState };
  const alerts = [];
  for (const step of steps) {
    for (const [id, x] of Object.entries(step.values)) if (byId(id)) byId(id).value = x;
    const v = Object.fromEntries(controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : (c.value ?? '')]));
    const ui = Object.fromEntries(controls.filter((c) => c.id).map((c) => [c.id, { visible: c.visible !== false, enabled: c.enabled !== false, text: c.text ?? '', ...((c.page || c.refilled) && c.options ? { options: c.options } : {}) }]));
    const r = await PAGE_EVENTS[spec.file][step.control](v, eventHelpers(spec, ctx, v, { viewState: vs, ui })).catch((e) => ({ alert: `THROW ${e.message} ${e.stack.split('\n').slice(1, 3).join(' ')}` }));
    for (const [k, p] of Object.entries(r.set ?? {})) {
      const c = byId(k);
      if (!c) continue;
      if (p.options) Object.assign(c, { options: p.options, refilled: true });
      if ('index' in p) c.value = c.options?.[p.index]?.value ?? '';
      if ('value' in p) c.value = p.value;
      if (p.rows) c.rows = p.rows;
      for (const a of ['visible', 'enabled', 'text']) if (a in p) c[a] = p[a];
    }
    if (r.viewState) vs = r.viewState;
    if (r.alerts) alerts.push(...r.alerts);
    else if (r.alert) alerts.push(r.alert);
  }
  return { controls, alerts, viewState: vs };
}

// what is compared on screen
const SHOWN = ['MainPanel', 'InputMaterialPanel', 'ScanINbarcodePanel', 'InQtyPanel', 'ButtonPanel', 'PnlHistory', 'PnlModelDetails', 'RightTopPanel', 'OutputMaterialPanel', 'ReworkPanel', 'JobCardPanel', 'WorkStationPanel'];
const VALUES = ['TBWorkStation', 'TBJobCoard', 'TBINItemCode', 'TBInQty', 'tbFG', 'DDLProdOrder'];
const TEXTS = ['BtnWorkStationScan', 'BtnWorderScan', 'BtnINBarcode'];
function screenOrig(snap) {
  const o = {};
  for (const id of SHOWN) o[`${id}.visible`] = !!snap[id]?.visible;
  for (const id of VALUES) o[`${id}.value`] = snap[id]?.value ?? '';
  for (const id of TEXTS) o[`${id}.text`] = snap[id]?.text ?? '';
  o['GVINMaterial.rows'] = (snap.GVINMaterial?.autoRows ?? snap.GVINMaterial?.rows ?? []).length;
  return o;
}
function screenNew(controls) {
  const byId = (id) => controls.find((c) => c.id === id) ?? {};
  const shown = (id) => { for (let c = byId(id); c?.id; c = c.parent ? byId(c.parent) : null) if (c.visible === false) return false; return true; };
  const o = {};
  for (const id of SHOWN) o[`${id}.visible`] = shown(id);
  for (const id of VALUES) o[`${id}.value`] = byId(id).value ?? '';
  for (const id of TEXTS) o[`${id}.text`] = byId(id).text ?? '';
  o['GVINMaterial.rows'] = (byId('GVINMaterial').rows ?? []).length;
  return o;
}

// a printer at 127.0.0.1, where this script listens on 9100: the labels each side prints
let jobs = [];
const server = net.createServer((sock) => {
  const parts = [];
  sock.on('data', (d) => parts.push(d));
  sock.on('end', () => { const b = Buffer.concat(parts); if (b.length) jobs.push(b.toString('latin1').replace(/dd-[A-Z][a-z]{2}-dd dd:dd /g, 'PDATE ')); });
  sock.on('error', () => {});
});
await new Promise((resolve, reject) => server.once('error', reject).listen(9100, '127.0.0.1', resolve));
const settle = () => new Promise((r) => setTimeout(r, 1500));
const PRINTER = 99999904;

// ---- the cases: "comp" a job card waiting at component scanning (its components scanned), "qc" one at a QC stage
// (approved) ----
const scenario = process.argv[3] ?? 'comp';
const FG = scenario === 'fg';
const QC = scenario === 'qc' || FG;
const ps = FG ? '226172196' : QC ? '226173203' : '226173186';
const station = (await query('select StationCode, Alias, Department from WorkCenter where StationCode=@s', { s: FG ? 1220010 : QC ? 1230012 : 1220005 }))[0];
const label = FG ? 'S42670260800935' : QC ? 'F42122260801958' : 'S42741260800510';
const ctx = { businessUnit: '12201', department: String(station.Department), userCode: '123003', userId: '123003', line: '12201', lineName: 'FOW Foaming' };
const inputs = QC ? [] : await query("select RowID, Material, Qty, ConsumedQty from ProcessInputBOM where PSNo=@p and ProcessCode=12203 and ScanReq=1 and Material<>22600141 order by RowID", { p: ps });
/** a serial built from the material's serial logic (date parts of today, a sequence number, fixed values), unused */
async function freeSerial(material, n) {
  const rows = await query('Select * from SerialGenerationLogicDetail where SerialCode =(Select TrackNoType  from Material where Matcode=@m) order by Seq', { m: material });
  const alt = String((await query('select AltName from Material where MatCode=@m', { m: material }))[0]?.AltName ?? '');
  const T = new Date();
  const p2 = (x) => String(x).padStart(2, '0');
  for (let k = 0; k < 50; k++) {
    let s = '';
    for (const r of rows) {
      const c = String(r.VariantCode);
      if (c === '1') s += String(r.Format).toLowerCase() === 'yy' ? String(T.getFullYear()).slice(-2) : String(T.getFullYear());
      else if (c === '2') s += p2(T.getMonth() + 1);
      else if (c === '3') s += p2(T.getDate());
      else if (c === '4') s += '01';
      else if (c === '10') s += String(90000000 + n * 1000 + k).slice(-Number(r.Length)).padStart(Number(r.Length), '9');
      else if (c === '11') s += alt;
      else s += String(r.Value ?? '');
      s += String(r.Seperator ?? '');
    }
    if ((await query('select 1 x from ProcessInputBOMScan where Serial=@s union all select 1 from MaterialBarcode where Serial=@s', { s })).length) continue;
    if ((await validateVendorSerialNew(String(material), s)).ok) return s;
  }
  return null;
}
const serials = [];
for (const r of inputs) for (let n = 0; n < Number(r.Qty) - Number(r.ConsumedQty); n++) {
  const s = await freeSerial(r.Material, serials.length);
  if (!s) throw new Error(`no free serial for ${r.Material}`);
  serials.push(s);
}
console.log(`job card ${ps} at ${station.Alias}; label ${label}; components ${serials.join(', ')}`);

const all = [label, ...serials];
const inList = all.map((_, i) => `@s${i}`).join(',');
const sp = Object.fromEntries(all.map((s, i) => [`s${i}`, s]));
const mats = (await query('select Material from ProcessInputBOM where PSNo=@p union select Material from ProcessOutputBOM where PSNo=@p', { p: ps })).map((r) => Number(r.Material));
const yy = Number(String(new Date().getFullYear()).slice(-2));
const logFloor = Number((await query('select isnull(max(EventID),0) m from EventLog'))[0].m);
const SETS = [
  { table: 'ProcessActivity', where: 'PSNo=@p', params: { p: ps } },
  { table: 'ProcessRouting', where: 'PSNo=@p', params: { p: ps } },
  { table: 'ProcessOrder', where: 'PSNo=@p', params: { p: ps } },
  { table: 'ProcessInputBOM', where: 'PSNo=@p', params: { p: ps } },
  { table: 'ProcessInputBOMScan', where: 'PSNo=@p', params: { p: ps } },
  { table: 'ProcessOutputBOM', where: 'PSNo=@p', params: { p: ps } },
  { table: 'ProcessOutputBOMBarcode', where: 'PSNo=@p', params: { p: ps } },
  { table: 'ProcessYieldPacks', where: 'PSNo=@p', params: { p: ps } },
  { table: 'ProcessYieldSerial', where: 'PSNo=@p', params: { p: ps } },
  { table: 'MaterialBarcode', where: `DocNo=@p or Serial in (${inList})`, params: { p: ps, ...sp } },
  { table: 'MConsumedBarcode', where: `DocNo=@p or Serial in (${inList})`, params: { p: ps, ...sp } },
  { table: 'MaterialStock', where: `Material in (${mats.join(',')}) and StorageCode in (0, -1)` },
  { table: 'InspectionHeader', where: 'DocNo=@p', params: { p: ps } },
  { table: 'WorkCenter', where: 'StationCode=@w', params: { w: station.StationCode } },
  { table: 'WorkCenterCalander', where: 'PSNo=@p', params: { p: ps } },
  { table: 'ProductionPlan', where: 'WorkCenter=@w and PDate >= cast(getdate() as date)', params: { w: station.StationCode } },
  { table: 'IDValue', where: "Year=@yy and IDTable in ('MaterialBarcode','InspectionHeader','InspectionTrans','ProductionPlan','MaterialBatch','ProcessOnlineRejection')", params: { yy } },
  { table: 'EventLog', where: 'EventID > @f', params: { f: logFloor } },
];
const ev = (handler, control, values) => ({ handler, control, values });
const steps = [
  ev('DDLDepartment_SelectedIndexChanged', 'DDLDepartment', { DDLDepartment: String(station.Department) }),
  ev('BtnWorkStationScan_Click', 'BtnWorkStationScan', { TBWorkStation: station.Alias }),
  ev('BtnWorderScan_Click', 'BtnWorderScan', { TBJobCoard: label }),
  ...serials.map((s) => ev('BtnINBarcode_Click', 'BtnINBarcode', { TBINItemCode: s })),
  ...(QC ? [ev('DDLWIPQCStatus_SelectedIndexChanged', 'DDLWIPQCStatus', { DDLWIPQCStatus: '12' }), ev('btnQCSave_Click', 'btnQCSave', { DDLQCPrinter: String(PRINTER) })] : []),
];
if (QC) {
  const lots = (await query('select InspectionLotNo from MaterialBarcode where DocNo=@p', { p: ps })).map((r) => Number(r.InspectionLotNo)).filter((x) => x > 0);
  SETS.push(
    { table: 'InspectionTrans', where: `InspectionLotNo in (${[0, ...lots].join(',')}) or Serial=@l`, params: { l: label } },
    { table: 'ProcessStageLabel', where: 'PSNo=@p', params: { p: ps } },
    { table: 'PlanOrderPrint', where: 'PlanMonthYear=@my', params: { my: Number(`${new Date().getMonth() + 1}${new Date().getFullYear()}`) } },
    { table: 'SerialBarcode', where: 'BusinessUnit=12201 and Year=@yy and Material=@m', params: { yy, m: (await query('select Material from MaterialBarcode where Serial=@l', { l: label }))[0]?.Material ?? 0 } },
  );
  SHOWN.push('QCPanel', 'OtherFields', 'PanelDefects', 'NextActionPanel', 'QCPrinterPanel', 'BarcodePanel', 'BtnUD', 'DefectHistoryPanel', 'PnlComponents');
  VALUES.push('TBBarcode', 'TbBar', 'DDLWIPQCStatus', 'DDLNextAction');
  TEXTS.push('Go');
  if (FG) {
    SHOWN.push('FGLabelPanel', 'Label49');
    VALUES.push('TbFGSerialNo', 'TbASsetTag', 'TBGreenTag', 'DDLQCPrinter');
  }
}
await execute('delete from BarcodePrinter where RowID=@a', { a: PRINTER });
await execute("insert into BarcodePrinter(RowID, BusinessUnit, Department, Name, Driver, IP, Status) values (@a, 12201, @d, @nm, '', '127.0.0.1', 1)", { a: PRINTER, d: station.Department, nm: FG ? 'ZZP WIP listener BIS' : 'ZZP WIP listener' });
// QC: a temporary plan for the month (the save checks it), removed at the end
const PLAN_NO = 99999901;
const T0 = new Date();
const monthYear = Number(`${T0.getMonth() + 1}${T0.getFullYear()}`);
await execute('delete from PlanOrderPrint where PlanNo=@n', { n: PLAN_NO });
if (QC) await execute(`insert into PlanOrderPrint(PlanNo,PlanMonthYear,PlanMaterial,PlanQty,PrintLbl,PlanType,Remark,CreatedBy,CreatedOn,Status,InitialPlanQty) select @n,@my,${FG ? 'po.Material' : 'mb.Material'},100,0,${FG ? "'FG'" : "'ASSEMBLY'"},'ZZP test',0,getdate(),0,100 from MaterialBarcode mb inner join ProcessOrder po on po.PSNo=mb.DocNo where mb.Serial=@l`, { n: PLAN_NO, my: monthYear, l: label });
const snap = await capture(SETS);
const results = [];
const base = await state(SETS);
try {
  // each prefix of the run, so a difference shows where it starts
  for (const n of [3, steps.length]) {
    const part = steps.slice(0, n);
    const label2 = part.map((s) => s.control).join(',');
    jobs = [];
    const o = await original({ id: 0, mode: 'event', key: null, viewState: {}, steps: part, ctx, spec: specOf(spec) });
    await settle();
    const oJobs = jobs;
    jobs = [];
    const oDb = await state(SETS);
    await restore(snap);
    const m = await runNew(ctx, part);
    await settle();
    const nJobs = jobs;
    const nDb = await state(SETS);
    await restore(snap);
    const problems = [];
    if (!o.ok) problems.push(`original ERROR ${o.error}`);
    else {
      const a = screenOrig(o.result.controls);
      const b = screenNew(m.controls);
      for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) problems.push(`${k}: ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`);
      const oa = (o.result.alerts ?? []).map((x) => x.replaceAll('\\\\', '\\'));
      if (JSON.stringify(oa) !== JSON.stringify(m.alerts)) problems.push(`alerts ${JSON.stringify(oa)} vs ${JSON.stringify(m.alerts)}`);
      const ov = o.result.viewState ?? {};
      for (const k of ['ProcessCode', 'I', 'LastScanned', 'INRowID', 'PType', 'ControlID']) if (String(ov[k] ?? '') !== String(m.viewState[k] ?? '')) problems.push(`viewState.${k}: ${ov[k]} vs ${m.viewState[k]}`);
    }
    if (JSON.stringify(oJobs) !== JSON.stringify(nJobs)) problems.push(`printed ${JSON.stringify(oJobs).slice(0, 400)} vs ${JSON.stringify(nJobs).slice(0, 400)}`);
    problems.push(...differences(oDb, nDb));
    const changed = Object.keys(nDb).filter((k) => JSON.stringify(nDb[k]) !== JSON.stringify(base[k]));
    results.push([label2, problems.length ? problems.join(' || ') : `IDENTICAL (${nJobs.length} label(s); changed: ${changed.join(', ') || 'nothing'}; alerts ${JSON.stringify(m.alerts)})`]);
  }
} finally {
  await restore(snap);
  await execute('delete from BarcodePrinter where RowID=@a', { a: PRINTER });
  await execute('delete from PlanOrderPrint where PlanNo=@n', { n: PLAN_NO });
  server.close();
}
for (const [l, r] of results) console.log(`${r.startsWith('IDENTICAL') ? 'OK  ' : 'DIFF'} [${l}]: ${r}`.slice(0, 3000));
process.exit(0);
