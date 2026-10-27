// ReworkConfirmationNew save parity: a barcode under rework scanned and its rework approved (root cause, resolution,
// remark) on the original, then the new app; every row the save may change compared and put back after each side.
// Usage: node --env-file=.env scripts/parity/rework-new-parity.js <originalBinDir> [--api]
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { query } from '../../src/db/pool.js';
import { loadSettings } from '../../src/modules/settings/settings.service.js';
import { newFormState } from '../../src/modules/forms/state.js';
import { PAGE_EVENTS, PAGE_SAVE, PAGE_LOAD, eventHelpers } from '../../src/modules/forms/pages.js';
import { apiEvent, apiSave } from './api.js';
import { capture, restore, state, differences } from './rowset.js';

const run = promisify(execFile);
const [bin, flag] = process.argv.slice(2);
const viaApi = flag === '--api'; // the new side through /api/quality/rework-confirmations (./api.js)
const SPECS = JSON.parse(readFileSync(new URL('../../src/modules/forms/forms.json', import.meta.url), 'utf8'));
await loadSettings();
const spec = SPECS['/quality/reworkconfirmationnew'];
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

const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003', line: '12201', lineName: 'FOW Foaming' };
const cases = await query("select top 2 mb.Serial, mb.BarcodeNo, mb.DocNo, mb.Material, it.ID, it.InspectionLotNo from InspectionTrans it join MaterialBarcode mb on mb.BarcodeNo=it.SampleBarcode where mb.QCStatus=13 and it.Status<>12 and it.NextAction=1 order by it.ID desc");
const root = String((await query('select top 1 ID from RootCause where status=1 order by ID'))[0]?.ID ?? '');
const res = String((await query('select top 1 ID from ReworkResolution where status=1 order by ID'))[0]?.ID ?? '');
const yy = Number(String(new Date().getFullYear()).slice(-2));
const results = [];
for (const c of cases) {
  const SETS = [
    { table: 'InspectionTrans', where: 'ID=@i', params: { i: c.ID } },
    { table: 'InspectionUD', where: 'ID=@i', params: { i: c.ID } },
    { table: 'InspectionDefect', where: 'ID=@i', params: { i: c.ID } },
    { table: 'InspectionHeader', where: 'DocNo=@d or InspectionLotNo=@l', params: { d: c.DocNo, l: c.InspectionLotNo } },
    { table: 'MaterialBarcode', where: 'DocNo=@d or BarcodeNo=@b', params: { d: c.DocNo, b: c.BarcodeNo } },
    { table: 'ProcessActivity', where: 'PSNo=@d', params: { d: c.DocNo } },
    { table: 'ProcessRouting', where: 'PSNo=@d', params: { d: c.DocNo } },
    { table: 'ProcessOrder', where: 'PSNo=@d', params: { d: c.DocNo } },
    { table: 'MaterialStock', where: 'Material=@m and StorageCode=0', params: { m: c.Material } },
    { table: 'IDValue', where: "Year=@yy and IDTable in ('InspectionHeader')", params: { yy } },
  ];
  const snap = await capture(SETS);
  const vals = { DDLDepartment: ctx.department, DDLRootCause: root, SSLActionTaken: res, TBApproverRemark: 'ZZP rework', DDLApproverStatus: '12' };
  try {
    const steps = [{ handler: 'Page_Load', control: 'TitleControl', values: {} }, { handler: 'Go_Click', control: 'Go', values: { DDLDepartment: ctx.department, TBBarcode: c.Serial } }, { handler: 'BTNSave_Click', control: '', values: vals }];
    const o = await original({ id: 0, mode: 'event', key: null, viewState: {}, steps, ctx, spec: specOf(spec) });
    const oDb = await state(SETS);
    await restore(snap);
    // the new app: the form, Go, then TitleControl's save
    const st = await newFormState(spec, ctx);
    await PAGE_LOAD[spec.file]?.(st.controls, ctx);
    const v = Object.fromEntries(st.controls.filter((x) => x.id).map((x) => [x.id, x.type === 'GridView' ? x.rows : (x.value ?? '')]));
    let vs = { ...st.viewState };
    const g = viaApi ? await apiEvent(spec, ctx, 'Go', { ...v, TBBarcode: c.Serial }, { viewState: vs }) : await PAGE_EVENTS[spec.file].Go({ ...v, TBBarcode: c.Serial }, eventHelpers(spec, ctx, { ...v, TBBarcode: c.Serial }, { viewState: vs }));
    for (const [k, p] of Object.entries(g.set ?? {})) if ('value' in p) v[k] = p.value;
    vs = g.viewState ?? vs;
    Object.assign(v, vals);
    const n = viaApi ? await apiSave(spec, ctx, v, { viewState: vs }) : await PAGE_SAVE[spec.file](v, { ...eventHelpers(spec, ctx, v, { viewState: vs }), raw: v });
    const nDb = await state(SETS);
    const problems = [];
    if (!o.ok) problems.push(`original ERROR ${o.error}`);
    const oa = (o.result?.alerts ?? []).join('|');
    const na = n.alert ?? (n.ok ? '' : n.message ?? '');
    if (o.ok && oa !== na) problems.push(`alerts "${oa}" vs "${na}"`);
    const om = o.result?.title?.success === false ? o.result.title.message : "";
    if (o.ok && om !== (n.ok ? "" : n.message ?? "")) problems.push(`message "${om}" vs "${n.ok ? "" : n.message}"`);
    problems.push(...differences(oDb, nDb));
    results.push([`rework ${c.Serial} (job card ${c.DocNo})`, problems.length ? problems.join(' || ') : `IDENTICAL (${n.ok ? 'saved' : `not saved: ${n.message}`})`]);
  } finally {
    await restore(snap);
  }
}
for (const [l, r] of results) console.log(`${r.startsWith('IDENTICAL') ? 'OK  ' : 'DIFF'} ${l}: ${r}`.slice(0, 3000));
process.exit(0);
