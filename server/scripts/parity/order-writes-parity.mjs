// Write parity for ProcessOrderForm, ReWorkOrderForm and CEATINSelfInspectionForm on the test copy: each case runs on the
// original page, its rows are read and put back, then the same steps on the new app; rows, alerts, messages and printer
// connections compared, and everything put back after.
// Usage: node --env-file=.env scripts/parity/order-writes-parity.mjs <originalBinDir> [case name part...]
import net from 'node:net';
import { query, execute } from '../../src/db/index.js';
import { loadSettings } from '../../src/modules/settings/service.js';
import { newFormState } from '../../src/modules/forms/state.js';
import { PAGE_EVENTS, PAGE_SAVE, PAGE_CANCEL, PAGE_PRINT, eventHelpers } from '../../src/modules/forms/pages.js';
import { SPECS, specOf, original } from './lib.mjs';
import { capture, restore, state, differences } from './rowset.mjs';

const [bin, ...only] = process.argv.slice(2);
await loadSettings();
const ctx = { businessUnit: '12201', department: '1220001', userCode: '123003', userId: '123003' };
const yy = new Date().getFullYear() % 100;
const first = async (sql, params) => String(Object.values((await query(sql, params))[0] ?? { x: '' })[0] ?? '');
const logFloor = Number(await first('select isnull(max(EventID),0) from EventLog'));

// a printer at 127.0.0.1 (this script listens on 9100): each side's connections and bytes
let jobs = [];
const server = net.createServer((sock) => {
  const parts = [];
  sock.on('data', (d) => parts.push(d));
  sock.on('end', () => jobs.push(Buffer.concat(parts).toString('latin1')));
  sock.on('error', () => {});
});
await new Promise((resolve, reject) => server.once('error', reject).listen(9100, '127.0.0.1', resolve));
const settle = () => new Promise((r) => setTimeout(r, 1500));
const PRINTER = '99999905';
await execute('delete from BarcodePrinter where RowID=@a', { a: PRINTER });
await execute("insert into BarcodePrinter(RowID, BusinessUnit, Department, Name, Driver, IP, Status) values (@a, 12201, 1220001, 'ZZP order listener', '', '127.0.0.1', 1)", { a: PRINTER });

/** the new app: each step as the browser posts it (values, ViewState, the page as shown); TitleControl's buttons call
 *  the page's save / delete / print */
async function runNew(spec, steps) {
  const st = await newFormState(spec, ctx);
  const controls = structuredClone(st.controls);
  const byId = (id) => controls.find((c) => c.id === id);
  let vs = { ...st.viewState };
  const alerts = [];
  let title = null;
  for (const step of steps) {
    for (const [id, x] of Object.entries(step.values ?? {})) {
      const c = byId(id);
      if (!c) continue;
      c.value = c.type === 'DropDownList' && !c.options.some((o) => o.value === x) ? (c.options[0]?.value ?? '') : x;
    }
    if (step.handler === 'Page_Load') continue;
    const v = Object.fromEntries(controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : (c.value ?? '')]));
    const ui = Object.fromEntries(controls.filter((c) => c.id).map((c) => [c.id, { visible: c.visible !== false, enabled: c.enabled !== false, text: c.text ?? '', ...((c.page || c.refilled) && c.options ? { options: c.options } : {}) }]));
    const h = { ...eventHelpers(spec, ctx, v, { viewState: vs, ui, arg: step.arg ?? '' }), raw: v, printer: '' };
    const own = { BTNSave_Click: PAGE_SAVE, BTNDelete_Click: PAGE_CANCEL, BTNPrint_Click: PAGE_PRINT }[step.handler];
    const name = step.command ? `${step.grid}:${step.command}` : step.control;
    const r = await (own ? own[spec.file](v, h) : PAGE_EVENTS[spec.file][name](v, h)).catch((e) => ({ alert: `THROW ${e.message}` }));
    if (own && step.handler !== 'BTNPrint_Click') {
      title = { ok: r.ok, message: r.message ?? '' };
      // TitleControl with Print: a saved record stays on the form
      if (r.ok && r.key && step.handler === 'BTNSave_Click') byId('PrimaryKey').value = r.key;
    }
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
  return { alerts, title };
}

const ev = (handler, control, values = {}) => ({ handler, control, values });
const cases = [];
const add = (name, route, steps, sets) => cases.push({ name, route, steps, sets });
const eventLog = { table: 'EventLog', where: 'EventID > @f', params: { f: logFloor } };

// ---- ProcessOrderForm: an open order with nothing assigned and a routing; job cards saved per piece or at once ------
{
  const order = await first("select top 1 ph.PRODNo from PRODHeader ph join Material m on m.MatCode=ph.Material where ph.Qty>isnull(ph.AssignedQty,0) and ph.Status=1 and ph.Department=1220001 and not exists (select 1 from ProcessOrder po where po.PRODNo=ph.PRODNo) and (exists (select 1 from RoutingHeader r where r.Material=ph.Material) or exists (select 1 from RoutingHeader r where r.model=m.Model)) order by ph.PRODNo desc");
  const line = await first("select top 1 pl.LineCode from ProductionLine pl where pl.Department=1220001 and pl.Status=1 and exists (select 1 from WorkCenter w where w.ManfLine=pl.LineCode) order by pl.LineCode");
  const of = 'PSNo in (select PSNo from ProcessOrder where PRODNo=@o)';
  const sets = [
    { table: 'ProcessOrder', where: 'PRODNo=@o', params: { o: order } },
    ...['ProcessRouting', 'ProcessInputBOM', 'ProcessOutputBOM'].map((t) => ({ table: t, where: of, params: { o: order } })),
    { table: 'PRODHeader', where: 'PRODNo=@o', params: { o: order } },
    { table: 'IDValue', where: "Year=@yy and IDTable in ('ProcessOrder','EventLog')", params: { yy } },
    eventLog,
  ];
  const opened = [ev('Page_Load', 'TitleControl'), ev('DDLDepartment_SelectedIndexChanged', 'DDLDepartment', { DDLDepartment: '1220001' }), ev('DDLProduction_SelectedIndexChanged', 'DDLProduction', { DDLProduction: order })];
  const create = (vals = {}) => ev('btnCreate_Click', 'btnCreate', vals);
  const save = (vals = {}) => ev('BTNSave_Click', '', vals);
  add(`process order ${order}: per piece, stations from line ${line}, printed, last one deleted`, '/production/processorderform', [...opened, create({ DDLProdLine: line }), save({ DDLPrinter: PRINTER }), ev('BTNDelete_Click', '')], sets);
  add(`process order ${order}: at once, no line (stations blank), printed again`, '/production/processorderform', [...opened, ev('DDLMultiple_SelectedIndexChanged', 'DDLMultiple', { DDLMultiple: '0' }), create(), save({ DDLPrinter: PRINTER }), ev('BTNPrint_Click', '')], sets);
  add(`process order ${order}: nothing assigned yet`, '/production/processorderform', [...opened, save()], sets);
}

// ---- ReWorkOrderForm: no rework routing on WRL, so nothing to save --------------------------------------------------
{
  const ps = await first('select top 1 IH.DocNo from InspectionHeader IH inner join InspectionTrans IT on IT.InspectionLotNo=IH.InspectionLotNo where IT.NextAction=1 and IH.DocType=4001 and IH.Status=10 order by IH.DocNo desc');
  const sets = [{ table: 'ProcessOrder', where: 'MainPSNo=@p or PSNo=@p', params: { p: ps } }, eventLog];
  add(`rework order for ${ps}: no routing`, '/production/reworkorderform', [ev('Page_Load', 'TitleControl'), ev('DDLDepartment_SelectedIndexChanged', 'DDLDepartment', { DDLDepartment: '1220001' }), ev('DDLProduction_SelectedIndexChanged', 'DDLProduction', { DDLProduction: ps }), ev('BTNSave_Click', '')], sets);
}

// ---- CEATINSelfInspectionForm: a held self-inspection barcode approved / rejected ------------------------------------
{
  const b = (await query('select top 1 mb.Serial, mb.BarcodeNo, mb.InspectionLotNo, mb.Material from MaterialBarcode mb join InspectionHeader ih on ih.InspectionLotNo=mb.InspectionLotNo where mb.QCStatus=11 and ih.InspectionType=300 and not exists (select 1 from InspectionTrans it where it.Serial=mb.Serial) order by mb.BarcodeNo desc'))[0];
  const maxLot = await first('select max(InspectionLotNo) from InspectionHeader');
  const inLot = 'ID in (select ID from InspectionTrans where InspectionLotNo=@l)';
  const sets = [
    { table: 'InspectionTrans', where: 'InspectionLotNo=@l', params: { l: b.InspectionLotNo } },
    { table: 'InspectionUD', where: inLot, params: { l: b.InspectionLotNo } },
    { table: 'InspectionDefect', where: inLot, params: { l: b.InspectionLotNo } },
    { table: 'InspectionHeader', where: 'InspectionLotNo=@l or InspectionLotNo>@m', params: { l: b.InspectionLotNo, m: maxLot } },
    { table: 'MaterialBarcode', where: 'InspectionLotNo=@l or BarcodeNo=@b', params: { l: b.InspectionLotNo, b: b.BarcodeNo } },
    { table: 'MaterialStock', where: 'Material=@m', params: { m: b.Material } },
    { table: 'IDValue', where: "Year=@yy and IDTable in ('InspectionTrans','InspectionHeader','EventLog')", params: { yy } },
    eventLog,
  ];
  const go = [ev('Page_Load', 'TitleControl'), ev('Go_Click', 'Go', { TBBarcode: b.Serial })];
  const cat = await first('Select top 1 ID From DefectCategoryType order by Alias');
  const defect = await first('Select top 1 Code From DefectCodeMaster order by Alias');
  add(`self inspection ${b.Serial}: approved`, '/ceat/ceatinselfinspectionform', [...go, ev('DDLStatus_SelectedIndexChanged', 'DDLStatus', { DDLStatus: '12' }), ev('BTNSave_Click', '')], sets);
  add(`self inspection ${b.Serial}: rejected for rework`, '/ceat/ceatinselfinspectionform', [...go, ev('DDLStatus_SelectedIndexChanged', 'DDLStatus', { DDLStatus: '13' }), ev('btnAdd_Click', 'btnAdd', { DDLDefectCat: cat, DDLDefectCodes: defect }), ev('BTNSave_Click', '', { DDLNextAction: '1' })], sets);
  add(`self inspection ${b.Serial}: rejected without defects`, '/ceat/ceatinselfinspectionform', [...go, ev('DDLStatus_SelectedIndexChanged', 'DDLStatus', { DDLStatus: '13' }), ev('BTNSave_Click', '', { DDLNextAction: '1' })], sets);
}

// EventLog times differ by the run; compared without them
const comparable = (s) => ({ ...s, EventLog: (s.EventLog ?? []).map((r) => { const o = JSON.parse(r); delete o.EventTime; return JSON.stringify(o); }) });
const results = [];
for (const c of cases) {
  if (only.length && !only.some((x) => c.name.includes(x))) continue;
  const spec = SPECS[c.route];
  const snap = await capture(c.sets);
  try {
    jobs = [];
    const [o] = original(bin, [{ id: 0, mode: 'event', key: null, viewState: {}, steps: c.steps, ctx, spec: specOf(spec) }]);
    await settle();
    const oJobs = jobs;
    const oDb = comparable(await state(c.sets));
    await restore(snap);
    jobs = [];
    const n = await runNew(spec, c.steps);
    await settle();
    const nDb = comparable(await state(c.sets));
    const problems = [];
    if (!o.ok) problems.push(`original ERROR ${o.error}`);
    const oa = (o.result?.alerts ?? []).filter((a) => a !== '').join(' | ');
    const na = n.alerts.filter((a) => a !== '').join(' | ');
    if (o.ok && oa !== na) problems.push(`alerts "${oa}" vs "${na}"`);
    const ot = o.result?.title;
    if (o.ok && ot && n.title && !!ot.success !== !!n.title.ok) problems.push(`saved ${ot.success} vs ${n.title.ok} ("${ot.message}" / "${n.title.message}")`);
    if (oJobs.length !== jobs.length || oJobs.join('\n') !== jobs.join('\n')) problems.push(`printed ${oJobs.length} vs ${jobs.length} ${JSON.stringify(oJobs).slice(0, 300)} / ${JSON.stringify(jobs).slice(0, 300)}`);
    problems.push(...differences(oDb, nDb));
    results.push([c.name, problems.length ? problems.join(' || ') : `IDENTICAL (alerts [${na}]; printed ${jobs.length}; saved ${n.title?.ok ?? '-'})`]);
  } catch (e) {
    results.push([c.name, `ERROR ${e.message}`]);
  } finally {
    await restore(snap);
  }
}
await execute('delete from BarcodePrinter where RowID=@a', { a: PRINTER });
server.close();
for (const [l, r] of results) console.log(`${r.startsWith('IDENTICAL') ? 'OK  ' : 'DIFF'} ${l}: ${r}`.slice(0, 3000));
process.exit(0);
