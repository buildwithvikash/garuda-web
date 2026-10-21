// Label printing parity without printing: a temporary BarcodePrinter row points at 127.0.0.1, where this script
// listens on port 9100 (what AIPPrint connects to). The original page's print handler runs (original-forms.ps1 mode
// "event", TitleControl's printer list holding that printer), then the new app's; the bytes each sent, the alerts and
// the database changes (PrintStatus, BarcodePrintTrail) are compared, then put back.
// Usage: node --env-file=.env scripts/parity/print-parity.mjs <originalBinDir>
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, execute } from '../../src/db/index.js';
import { loadSettings } from '../../src/modules/settings/service.js';
import { PAGE_PRINT, PAGE_EVENTS, eventHelpers } from '../../src/modules/forms/pages.js';
import { newFormState } from '../../src/modules/forms/state.js';

const run = promisify(execFile);
const [bin] = process.argv.slice(2);
const SPECS = JSON.parse(readFileSync(new URL('../../src/modules/forms/forms.json', import.meta.url), 'utf8'));
await loadSettings();
const ctx = { businessUnit: '12201', department: '1220001', userCode: '123003', userId: 'ZZPPRINTER' };
const specOf = (spec) => ({ top: spec.top, view: spec.view, controls: spec.controls, formModuleId: spec.formModuleId, file: spec.file, titleBar: spec.titleBar, inherits: spec.inherits });

// the "printer": every connection's bytes (the original's port check connects without sending)
let jobs = [];
const server = net.createServer((sock) => {
  const parts = [];
  sock.on('data', (d) => parts.push(d));
  sock.on('end', () => {
    const b = Buffer.concat(parts);
    if (b.length) jobs.push(b.toString('latin1'));
  });
  sock.on('error', () => {});
});
await new Promise((resolve, reject) => server.once('error', reject).listen(9100, '127.0.0.1', resolve));
const settle = () => new Promise((r) => setTimeout(r, 1500));

const PRINTER = 99999901;
const OFFLINE = 99999902;
await execute('delete from BarcodePrinter where RowID in (@a, @b)', { a: PRINTER, b: OFFLINE });
await execute("insert into BarcodePrinter(RowID, BusinessUnit, Name, Driver, IP, Status) values (@a, 12201, 'ZZP local listener', '', '127.0.0.1', 1), (@b, 12201, 'ZZP offline', '', '10.255.255.1', 1)", { a: PRINTER, b: OFFLINE });

async function original(c) {
  const file = join(mkdtempSync(join(tmpdir(), 'parity-')), 'cases.json');
  writeFileSync(file, JSON.stringify([c]));
  const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-forms.ps1', import.meta.url)), bin, file], {
    env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout.slice(stdout.indexOf('[')))[0];
}
// "dd-MMM-yy HH:mm " ([PDATE]) may cross a minute between the two runs
const mask = (s) => s.replace(/\d\d-[A-Z][a-z]{2}-\d\d \d\d:\d\d /g, 'PDATE ');

const pick = async (sql) => String(Object.values((await query(sql))[0] ?? { x: '' })[0] ?? '');
const emp = await pick('select top 1 e.EmpCode from Employee e inner join Users u on e.EmpCode=u.Employee order by e.EmpCode');
const inProcess = await pick('select top 1 BarcodeNo from MaterialBarcode where DocType=4001 order by BarcodeNo desc');
const otherDoc = await pick('select top 1 BarcodeNo from MaterialBarcode where DocType not in (3001, 4001) order by BarcodeNo desc');
const CASES = [
  ['/settings/employeeform', 'BTNPrint_Click', { PrimaryKey: emp }, PRINTER],
  ['/settings/employeeform', 'BTNPrint_Click', { PrimaryKey: emp }, ''],
  ['/businesssetup/storageareaform', 'BTNPrint_Click', { PrimaryKey: '1' }, PRINTER],
  ['/materialsetup/materialbarcode', 'print', { PrimaryKey: inProcess, TbRemark: 'ZZP reprint test' }, PRINTER],
  ...(otherDoc ? [['/materialsetup/materialbarcode', 'print', { PrimaryKey: otherDoc, TbRemark: 'ZZP reprint test' }, PRINTER]] : []),
  ['/materialsetup/materialbarcode', 'print', { PrimaryKey: inProcess, TbRemark: '' }, PRINTER],
  ['/materialsetup/materialbarcode', 'print', { PrimaryKey: inProcess, TbRemark: 'x' }, ''],
  ['/materialsetup/materialbarcode', 'print', { PrimaryKey: inProcess, TbRemark: 'x' }, OFFLINE],
];

const results = [];
const barcodes = [inProcess, otherDoc].filter(Boolean);
const savedStatus = await query(`select BarcodeNo, PrintStatus from MaterialBarcode where BarcodeNo in (${barcodes.map((_, i) => `@b${i}`).join(',') || "''"})`, Object.fromEntries(barcodes.map((b, i) => [`b${i}`, b])));
const trailFloor = new Date();
const dbState = async () => JSON.stringify([
  await query(`select BarcodeNo, PrintStatus from MaterialBarcode where BarcodeNo in (${barcodes.map((_, i) => `@b${i}`).join(',') || "''"}) order by BarcodeNo`, Object.fromEntries(barcodes.map((b, i) => [`b${i}`, b]))),
  await query("select BarcodeNo, PrintedBy, Remark from BarcodePrintTrail where Remark like 'ZZP%' or (Remark = 'x' and PrintedOn >= @f) order by BarcodeNo", { f: trailFloor }),
]);
const restore = async () => {
  for (const r of savedStatus) await execute('update MaterialBarcode set PrintStatus=@s where BarcodeNo=@b', { s: r.PrintStatus, b: r.BarcodeNo });
  await execute("delete from BarcodePrintTrail where Remark like 'ZZP%' or (Remark = 'x' and PrintedOn >= @f)", { f: trailFloor });
};

try {
  for (const [route, handler, values, printer] of CASES) {
    const spec = SPECS[route];
    const label = `${route.split('/')[2]} ${JSON.stringify(values)} printer ${printer || '(none)'}`;
    jobs = [];
    const o = await original({ id: 0, mode: 'event', key: null, viewState: {}, printer: String(printer), steps: [{ handler, control: 'BtnPrint', values }], ctx, spec: specOf(spec) });
    await settle();
    const oJobs = jobs.map(mask);
    const oDb = await dbState();
    await restore();
    jobs = [];
    const v = { ...values };
    const n = await PAGE_PRINT[spec.file](v, { ...eventHelpers(spec, ctx, v), printer: String(printer) }).catch((e) => ({ error: e.message }));
    await settle();
    const nJobs = jobs.map(mask);
    const nDb = await dbState();
    await restore();
    const problems = [];
    if (!o.ok) problems.push(`original ERROR ${o.error}`);
    if (n.error) problems.push(`new ERROR ${n.error}`);
    const oAlert = (o.result?.alerts ?? []).join('|');
    if (o.ok && oAlert !== (n.alert ?? '')) problems.push(`alert "${oAlert}" vs "${n.alert ?? ''}"`);
    if (JSON.stringify(oJobs) !== JSON.stringify(nJobs)) problems.push(`printed ${JSON.stringify(oJobs).slice(0, 300)} vs ${JSON.stringify(nJobs).slice(0, 300)}`);
    if (oDb !== nDb) problems.push(`database ${oDb.slice(0, 200)} vs ${nDb.slice(0, 200)}`);
    results.push([label, problems.length ? problems.join(' | ') : `IDENTICAL (${oJobs.length} job(s), ${oJobs[0]?.length ?? 0} bytes${oAlert ? `, alert "${oAlert}"` : ''})`]);
  }

  // ModelToModelTransfer: one serial moved to another model (stock, barcode, job card, ModelToModel row) and its
  // label printed; everything put back after each side
  {
    const route = '/production/modeltomodeltransferform';
    const spec = SPECS[route];
    const src = await pick("select top 1 mb.Material from (select top 5000 Material, Status, Batch, StorageCode, DocType from MaterialBarcode order by BarcodeNo desc) mb inner join Material m on m.MatCode=mb.Material where mb.Status<>99 and mb.Batch is not null and mb.StorageCode is not null and mb.DocType=4001 and m.Type=100 and exists (select 1 from SerialGenerationLogicDetail d where d.serialCode=m.TrackNoType and d.VariantCode=10)");
    const des = await pick(`select top 1 MatCode from Material where Type=100 and MatCode<>${src} order by MatCode desc`);
    const len = Number(await pick(`select Length from SerialGenerationLogicDetail where serialCode=(select TrackNoType from Material where MatCode=${src}) and VariantCode=10`));
    const bar = (await query(`select top 1 BarcodeNo, DocNo, Material, Status, StorageCode, Area, PrintStatus, right(Serial, ${len}) sn from (select top 5000 * from MaterialBarcode order by BarcodeNo desc) x where Material=${src} and Status<>99 and Batch is not null and StorageCode is not null and DocType=4001 and right(Serial, ${len}) not like '%[^0-9]%' order by BarcodeNo desc`))[0];
    const sn = String(Number(bar.sn));
    const po = await query('select PSNo, Material from ProcessOrder where PSNo=@p', { p: bar.DocNo });
    const stockWhere = 'Material in (@s, @d) and StorageCode=@loc';
    const sp = { s: src, d: des, loc: bar.StorageCode };
    const stock = await query(`select * from MaterialStock where ${stockWhere}`, sp);
    const mmFloor = Number(await pick('select isnull(max(Refno),0) from ModelToModel'));
    const state = async () => JSON.stringify([
      await query('select Material, Status, StorageCode, Area, PrintStatus from MaterialBarcode where BarcodeNo=@b', { b: bar.BarcodeNo }),
      await query('select Material from ProcessOrder where PSNo=@p', { p: bar.DocNo }),
      (await query(`select StorageCode, Material, Batch, Qty, HoldQty, ReleasedQty, RejectedQty, Uom, Area, Department, BusinessUnit from MaterialStock where ${stockWhere}`, sp)).map((r) => JSON.stringify(r)).sort(),
      await query('select SrcMaterial, DestMaterial, StartSerial, EndSerial, Qty, UserCode from ModelToModel where Refno > @f', { f: mmFloor }),
    ]);
    const putBack = async () => {
      await execute('update MaterialBarcode set Material=@m, Status=@st, StorageCode=@loc, Area=@a, PrintStatus=@ps where BarcodeNo=@b', { m: bar.Material, st: bar.Status, loc: bar.StorageCode, a: bar.Area, ps: bar.PrintStatus, b: bar.BarcodeNo });
      for (const r of po) await execute('update ProcessOrder set Material=@m where PSNo=@p', { m: r.Material, p: r.PSNo });
      await execute(`delete from MaterialStock where ${stockWhere} and StockID not in (${stock.map((r) => r.StockID).join(',') || 0})`, sp);
      for (const r of stock) await execute('update MaterialStock set Qty=@q, HoldQty=@h, ReleasedQty=@rl, RejectedQty=@rj where StockID=@id', { q: r.Qty, h: r.HoldQty, rl: r.ReleasedQty, rj: r.RejectedQty, id: r.StockID });
      await execute('delete from ModelToModel where Refno > @f', { f: mmFloor });
    };
    const values = { DDLSourceMaterial: src, DDLDestiMaterial: des, TbStart: sn, TbEnd: sn, DDLPrinter: String(PRINTER) };
    try {
      jobs = [];
      const o = await original({ id: 0, mode: 'event', key: null, viewState: {}, steps: [{ handler: 'btnPrint_Click', control: 'btnPrint', values }], ctx, spec: specOf(spec) });
      await settle();
      const oJobs = jobs.map(mask);
      const oDb = await state();
      await putBack();
      jobs = [];
      const n = await PAGE_EVENTS[spec.file].btnPrint(values, eventHelpers(spec, ctx, values)).catch((e) => ({ alert: `THROW ${e.message}` }));
      await settle();
      const nJobs = jobs.map(mask);
      const nDb = await state();
      const problems = [];
      if (!o.ok) problems.push(`original ERROR ${o.error}`);
      const oAlert = (o.result?.alerts ?? []).join('|');
      if (o.ok && oAlert !== (n.alert ?? '')) problems.push(`alert "${oAlert}" vs "${n.alert ?? ''}"`);
      const oRows = JSON.stringify(o.result?.controls?.GVPrint?.autoRows ?? []);
      const nRows = JSON.stringify((n.set?.GVPrint?.rows ?? []).map((r) => Object.values(r).map(String)));
      if (o.ok && oRows !== nRows) problems.push(`grid ${oRows} vs ${nRows}`);
      if (JSON.stringify(oJobs) !== JSON.stringify(nJobs)) problems.push(`printed ${JSON.stringify(oJobs).slice(0, 300)} vs ${JSON.stringify(nJobs).slice(0, 300)}`);
      if (oDb !== nDb) problems.push(`database ${oDb.slice(0, 400)} vs ${nDb.slice(0, 400)}`);
      results.push([`model to model ${src} -> ${des} serial ${sn}`, problems.length ? problems.join(' | ') : `IDENTICAL (${oJobs.length} job(s), ${oRows})`]);
    } finally {
      await putBack();
    }
  }

  // ProductionAssignment: a production order started for 2 pieces at its first stage (job cards, stage labels,
  // barcodes, serial / key counters, the log row) and their labels; everything put back after each side
  {
    const route = '/production/productionassignmentform';
    const spec = SPECS[route];
    const actx = { ...ctx, department: '1220001' };
    const dept = '1220001';
    // the routing's first stage-label process (what DDLRouting picks) with a station in the department
    const routeCode = await pick(`select top 1 h.RouteCode from RoutingHeader h where h.[Type]=1 and h.Status=1 and exists (select 1 from WorkCenter wc inner join WorkCenterProcesses wp on wp.StationCode=wc.StationCode where wc.Department=${dept} and wp.ProcessCode=(select top 1 rt.ProcessCode from RoutingTrans rt where rt.RouteCode=h.RouteCode and rt.StageLabel=1 order by rt.SeqNo)) order by h.RouteCode`);
    const process = await pick(`Select top 1 rt.ProcessCode from RoutingTrans rt where rt.RouteCode=${routeCode} and rt.StageLabel=1 order by rt.SeqNo`);
    const station = await pick(`select top 1 wc.StationCode from WorkCenter wc inner join WorkCenterProcesses wp on wc.StationCode=wp.StationCode where wp.ProcessCode=${process} and wc.Department=${dept}`);
    const order = (await query(`select top 1 ph.PRODNo, ph.Department, ph.BOMCode from PRODHeader ph where ph.Qty>isnull(ph.AssignedQty,0)+2 and ph.Status=1 and ph.Department=${dept} and exists (select 1 from BOMInput bi where bi.BOMCode=ph.BOMCode and bi.ProcessCode=${process}) and exists (select 1 from BOMHeader b where b.BOMCode=ph.BOMCode and b.BaseQty>0) order by ph.PRODNo desc`))[0];
    const stageMat = await pick(`Select top 1 Material from BOMINPUT where BOMCODE=${order.BOMCode} and ProcessCode=${process}`);
    const ASSIGN_PRINTER = 99999903;
    await execute('delete from BarcodePrinter where RowID=@a', { a: ASSIGN_PRINTER });
    await execute("insert into BarcodePrinter(RowID, BusinessUnit, Department, Name, Driver, IP, Status) values (@a, 12201, @d, 'ZZP assignment listener', '', '127.0.0.1', 1)", { a: ASSIGN_PRINTER, d: Number(dept) });
    const yy = Number(String(new Date().getFullYear()).slice(-2));
    const floors = {
      ps: await pick('select isnull(max(PSNo),0) from ProcessOrder'),
      bar: await pick('select isnull(max(BarcodeNo),0) from MaterialBarcode'),
      insp: await pick('select isnull(max(InspectionLotNo),0) from InspectionHeader'),
      log: await pick('select isnull(max(EventID),0) from EventLog'),
    };
    const ids = await query("select IDTable, Year, SLNo from IDValue where IDTable in ('ProcessOrder','MaterialBarcode','InspectionHeader','EventLog') and Year=@yy", { yy });
    const serials = await query('select ID, NextSerialNo from SerialBarcode where Material=@m and Station=@p and BusinessUnit=12201 and Year=@yy', { m: stageMat, p: process, yy });
    const rowMask = (r) => JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x instanceof Date ? x.toISOString().slice(0, 10) : x])));
    const rowsOf = async (sql, p) => (await query(sql, p)).map(rowMask);
    const state = async () => JSON.stringify({
      po: await rowsOf('select * from ProcessOrder where PSNo > @f order by PSNo', { f: floors.ps }),
      route: await rowsOf('select * from ProcessRouting where PSNo > @f order by PSNo, SeqNo', { f: floors.ps }),
      bomIn: await rowsOf('select * from ProcessInputBOM where PSNo > @f order by PSNo, RowID', { f: floors.ps }),
      bomOut: await rowsOf('select * from ProcessOutputBOM where PSNo > @f order by PSNo, RowID', { f: floors.ps }),
      stage: await rowsOf('select * from ProcessStageLabel where PsNo > @f order by PsNo', { f: floors.ps }),
      bar: await rowsOf('select * from MaterialBarcode where DocType=4001 and DocNo > @f order by BarcodeNo', { f: floors.ps }),
      insp: await rowsOf('select * from InspectionHeader where DocType=4001 and DocNo > @f order by InspectionLotNo', { f: floors.ps }),
      log: await rowsOf("select EventUser, Module, Action, AppResponse, Message, DocRef, TransactionData, BusinessUnit from EventLog where EventID > @f and Module='Last Status'", { f: floors.log }),
      ids: await rowsOf("select IDTable, SLNo from IDValue where IDTable in ('ProcessOrder','MaterialBarcode','InspectionHeader') and Year=@yy order by IDTable", { yy }),
      serial: await rowsOf('select Material, Station, NextSerialNo from SerialBarcode where Material=@m and Station=@p and BusinessUnit=12201 and Year=@yy order by ID', { m: stageMat, p: process, yy }),
    });
    const putBack = async () => {
      for (const t of ['ProcessRouting', 'ProcessInputBOM', 'ProcessOutputBOM', 'ProcessStageLabel', 'ProcessOrder']) await execute(`delete from ${t} where PSNo > @f`, { f: floors.ps });
      await execute('delete from MaterialBarcode where DocType=4001 and DocNo > @f', { f: floors.ps }); // keys are a series, not above the max
      await execute('delete from InspectionHeader where DocType=4001 and DocNo > @f', { f: floors.ps });
      await execute('delete from EventLog where EventID > @f', { f: floors.log });
      for (const r of ids) await execute('update IDValue set SLNo=@s where IDTable=@t and Year=@y', { s: r.SLNo, t: r.IDTable, y: r.Year });
      await execute(`delete from SerialBarcode where Material=@m and Station=@p and BusinessUnit=12201 and Year=@yy and ID not in (${serials.map((r) => r.ID).join(',') || 0})`, { m: stageMat, p: process, yy });
      for (const r of serials) await execute('update SerialBarcode set NextSerialNo=@n where ID=@id', { n: r.NextSerialNo, id: r.ID });
    };
    const ev = (handler, control, values) => ({ handler, control, values });
    const steps = [
      ev('DDLDept_SelectedIndexChanged', 'DDLDepartment', { DDLDepartment: dept }),
      ev('DDlProdOrder_SelectedIndexChanged1', 'DDlProdOrder', { DDlProdOrder: String(order.PRODNo) }),
      ev('DDLRouting_SelectedIndexChanged', 'DDLRouting', { DDLRouting: routeCode }),
      ev('DDLProcessCode_SelectedIndexChanged', 'DDLProcessCode', { DDLProcessCode: process }),
      ev('DDLStationCode_SelectedIndexChanged', 'DDLStationCode', { DDLStationCode: station }),
      ev('btnPrint_Click', 'btnPrint', { TBQty: '2', DDLPrinter: String(ASSIGN_PRINTER) }),
    ];
    try {
      await putBack();
      jobs = [];
      const o = await original({ id: 0, mode: 'event', key: null, viewState: {}, steps, ctx: actx, spec: specOf(spec) });
      await settle();
      const oJobs = jobs.map(mask);
      const oDb = await state();
      await putBack();
      jobs = [];
      const st = await newFormState(spec, actx);
      let v = Object.fromEntries(st.controls.map((c) => [c.id, c.type === 'GridView' ? c.rows : c.value]));
      let vs = {};
      let last = null;
      for (const step of steps) {
        v = { ...v, ...step.values };
        // the printer list is the department's (the test printer is the only one we choose)
        last = await PAGE_EVENTS[spec.file][step.control](v, eventHelpers(spec, actx, v, { viewState: vs })).catch((e) => ({ alert: `THROW ${e.message}${globalThis.process.env.PARITY_DEBUG ? e.stack.split('\n').slice(1, 3).join(' ') : ""}` }));
        for (const [k, p] of Object.entries(last.set ?? {})) {
          if ('rows' in p) v = { ...v, [k]: p.rows };
          else if ('value' in p) v = { ...v, [k]: p.value };
          else if (p.options && 'index' in p) v = { ...v, [k]: p.options[p.index]?.value ?? '' };
        }
        vs = last.viewState ?? vs;
      }
      await settle();
      const nJobs = jobs.map(mask);
      const nDb = await state();
      const problems = [];
      if (!o.ok) problems.push(`original ERROR ${o.error} (new: ${last.alert ?? "ok"})`);
      const oAlert = (o.result?.alerts ?? []).join('|');
      const nAlert = [...(last.alerts ?? []), ...(last.alert ? [last.alert] : [])].join('|');
      if (o.ok && oAlert !== nAlert && !(last.success && oAlert.includes('Assigned Succefully'))) problems.push(`alert "${oAlert}" vs "${nAlert}"`);
      if (JSON.stringify(oJobs) !== JSON.stringify(nJobs)) problems.push(`printed ${JSON.stringify(oJobs).slice(0, 300)} vs ${JSON.stringify(nJobs).slice(0, 300)}`);
      if (oDb !== nDb) {
        const a = JSON.parse(oDb);
        const b = JSON.parse(nDb);
        for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) problems.push(`${k} ${JSON.stringify(a[k]).slice(0, 500)} vs ${JSON.stringify(b[k]).slice(0, 500)}`);
      }
      const counts = Object.entries(JSON.parse(nDb)).map(([k, x]) => `${k} ${x.length}`).join(', ');
      results.push([`production assignment ${order.PRODNo} x2 (${process} @ ${station})`, problems.length ? problems.join(' | ') : `IDENTICAL (${oJobs.length} job(s); ${counts})`]);
    } finally {
      await putBack();
      await execute('delete from BarcodePrinter where RowID=@a', { a: ASSIGN_PRINTER });
    }
  }
} finally {
  await restore();
  await execute('delete from BarcodePrinter where RowID in (@a, @b)', { a: PRINTER, b: OFFLINE });
  server.close();
}
for (const [r, m] of results) console.log(`${m.startsWith('IDENTICAL') ? 'OK  ' : 'DIFF'} ${r}: ${m}`.slice(0, 700));
process.exit(0);
