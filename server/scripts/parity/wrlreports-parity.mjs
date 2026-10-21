// Parity for the WRLReports code-behind pages: each page's original method (same arguments its BtnRefresh_Click
// builds) vs the new page run. Compares every table/cell as .NET ToString(). Read-only.
// Usage: node --env-file=.env scripts/parity/wrlreports-parity.mjs <originalBinDir>
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../../src/db/index.js';
import { WRL_REPORTS, fmt } from '../../src/modules/reports/wrlPages.js';
import { enInDateTime } from '../../src/modules/reports/format.js';
import { netNum } from '../../src/lib/net.js';

const bin = process.argv[2];
const BU = '12201';
const s = (v) => `s:${v ?? ''}`;
const DMY = 'dd-MMM-yyyy';
const DMYT = 'dd-MMM-yyyy HH:mm:ss';
const YMDT = 'yyyy-MM-dd HH:mm:ss';
const R = (i, f) => [s(fmt(i.from, f)), s(fmt(i.to, f))];

// How each page's BtnRefresh_Click called the original.
const ORIGINAL = {
  brazerwisereport: (i) => ['AVReports', 'BrazerSummary', [...R(i, DMY), s(BU), s('12206'), 'grid']],
  brazingnewreport: (i) => ['AVReports', 'BrazingNewReport', [...R(i, DMYT), 'grid']],
  brazingreport: (i) => ['AVReports', 'BrazingReworkSummary', [...R(i, DMY), s(BU), s('12206'), 'grid']],
  dailytrenddefect: (i) => ['AVReports', 'DailyDefectTrend', [...R(i, DMY), s(BU), s(i.stage), 'grid']],
  datewiseleakage: (i) => ['AVReports', 'LeakCount', [...R(i, DMY), s(BU), s('12206'), 'grid']],
  defectstagecountreport: (i) => ['AVReports', 'Rework', [...R(i, DMY), s(BU), s(i.stage), 'grid']],
  estreportnew: (i) => ['AVReports', 'ESTReport', [...R(i, YMDT), 'grid']],
  fgproductionreport: (i) => ['AVReports', 'FGProductionReport', [...R(i, DMYT), s(BU), s(i.station)]],
  fgreport: (i) => ['AVProductionCapture', 'FillFGReport', R(i, DMYT)],
  gaschargingreport: (i) => ['AVReports', 'GasChargingReport', [...R(i, YMDT), 'grid']],
  jointwiseleakage: (i) => ['AVReports', 'JointWiseLeak', [...R(i, DMY), s(BU), s('12206'), 'grid']],
  mftstaging: (i) => ['AVReports', 'MFTReport', [...R(i, DMYT), 'grid']],
  ppmrework: (i) => ['AVReports', 'PPMRework', [...R(i, DMYT), s(BU), s(i.stage), 'grid']],
  processhistorydefectreport: (i) => ['AVReports', 'ProcessHistoryDefectNew', [s(i.serial), 'out']],
  processhistoryreport: (i) => ['AVReports', 'ProcessHistory', [s(i.serial), 'out']],
  productionhourlycount: (i) => ['AVReports', 'HourlyCountReport', [...R(i, DMYT), s(BU), s(i.station)]],
  productionreport: (i) => ['AVReports', 'ProductionReport', [s(i.station), s(i.department), ...R(i, YMDT), 'grid']],
  reworkreport: (i) => ['AVReports', 'ReworkReport', [s(i.station), s(i.department), ...R(i, DMYT), 'grid']],
  scrapreport: (i) => ['AVReports', 'ScrapReport', [...R(i, DMYT), 'grid']],
  stoplossreport: (i) => ['AVReports', 'StopLossReport', [s(i.area), ...R(i, DMYT), 'grid', 'grid', 'out']],
};

// Inputs with real UAT data, plus empty selections (error paths).
const station = '1220010';
const department = String((await query('select Department from WorkCenter where StationCode=@station', { station }))[0]?.Department ?? '');
const stage = String((await query('Select top 1 ProcessCode from ProductionProcess where ProdcutionStage =2 order by ProcessCode'))[0]?.ProcessCode ?? '');
const area = String((await query('select top 1 Location from EMGTrans where EmgOff between @a and @b group by Location order by count(*) desc', { a: '2024-04-01', b: '2024-05-01' }))[0]?.Location ?? '');
const serials = (await query("select top 2 mb.Serial from MaterialBarcode mb join ProcessRouting pr on pr.PSNo=mb.DocNo where pr.CompletedOn between '2024-04-23' and '2024-04-24' and mb.Serial is not null group by mb.Serial order by count(*) desc")).map((r) => r.Serial);
const inputsSets = [
  { from: '2024-04-23T08:00:00', to: '2024-04-23T18:00:00', station, department, stage, area, serial: serials[0] ?? '' },
  { from: '2024-03-01T08:00:00', to: '2024-03-01T18:00:00', station, department, stage, area, serial: serials[1] ?? 'NOSUCH' },
  { from: '2024-04-23T08:00:00', to: '2024-04-23T18:00:00', station: '', department: '', stage: '', area: '', serial: '' },
];

// The two brazing summaries take whole days and look up every brazed joint one by one (minutes per busy day in the
// original too), so they run on UAT days with few brazing inspections.
const LIGHT_DAYS = [
  { from: '2024-09-24T08:00:00', to: '2024-09-24T18:00:00' },
  { from: '2024-08-11T08:00:00', to: '2024-08-11T18:00:00' },
  { from: '2024-08-11T08:00:00', to: '2024-08-11T18:00:00' },
];
const HEAVY = new Set(['brazerwisereport', 'brazingreport']);

const calls = [];
for (const slug of Object.keys(WRL_REPORTS)) {
  for (const [k, base] of inputsSets.entries()) {
    const i = HEAVY.has(slug) ? { ...base, ...LIGHT_DAYS[k] } : base;
    const [cls, method, args] = ORIGINAL[slug](i);
    calls.push({ id: calls.length, slug, inputs: i, cls, method, args });
  }
}
const dir = mkdtempSync(join(tmpdir(), 'parity-'));
const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
const orig = new Map();
for (const slug of Object.keys(WRL_REPORTS)) {
  const batch = calls.filter((c) => c.slug === slug).map(({ inputs, ...c }) => c);
  const file = join(dir, `${slug}.json`);
  writeFileSync(file, JSON.stringify(batch));
  const t0 = Date.now();
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-wrlreports.ps1', import.meta.url)), bin, file], {
    env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
    maxBuffer: 256 * 1024 * 1024,
  }).toString();
  for (const o of JSON.parse(raw.slice(raw.indexOf('[')))) orig.set(o.id, o);
  console.error(`original ${slug}: ${Math.round((Date.now() - t0) / 1000)}s`);
}

/** Cell as DataRow.ItemArray[i].ToString() would print it. */
function cellText(v, c) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return c.type === 'time' ? v.toTimeString().slice(0, 8) : enInDateTime(v);
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (Buffer.isBuffer(v)) return 'System.Byte[]';
  if (typeof v === 'number') return /decimal|numeric|money/i.test(c.type) ? v.toFixed(c.scale) : netNum(v);
  return String(v);
}
const asText = (t) => t && { columns: t.columns.map((c) => c.name), rows: t.rows.map((r) => r.map((v, i) => cellText(v, t.columns[i]))) };
const norm = (t) => t && { columns: [...(t.columns ?? [])], rows: (t.rows ?? []).map((r) => [...r]) };
// Exact match, or — for queries without a deterministic order — the same rows in any order. A Column1 produced by
// ROW_NUMBER() over a non-unique key (Production Report) is arbitrary even between two runs of the original, so it is
// left out of that order-independent comparison.
const sorted = (t, skip) => (t?.rows ?? []).map((r) => JSON.stringify(r.filter((_, i) => !skip.includes(i)))).sort();
const same = (a, b) => {
  if (JSON.stringify(norm(a)) === JSON.stringify(norm(b))) return true;
  if (JSON.stringify(a?.columns) !== JSON.stringify(b?.columns)) return false;
  const skip = (a?.columns ?? []).flatMap((c, i) => (c === 'Column1' ? [i] : []));
  return JSON.stringify(sorted(a, skip)) === JSON.stringify(sorted(b, skip));
};

let identical = 0;
let bothFail = 0;
const diffs = [];
const rowsSeen = {};
for (const c of calls) {
  const o = orig.get(c.id);
  let mine;
  const t1 = Date.now();
  try {
    mine = { ok: true, out: await WRL_REPORTS[c.slug].run(c.inputs) };
    console.error(`new ${c.slug}: ${Math.round((Date.now() - t1) / 1000)}s`);
  } catch (e) {
    mine = { ok: false, error: e.message };
  }
  const tag = `${c.slug} [${c.inputs.from.slice(0, 10)}..${c.inputs.to.slice(0, 10)}${c.inputs.station ? '' : ', empty filters'}]`;
  if (!o.ok || !mine.ok) {
    if (!o.ok && !mine.ok && o.error.replace(/\.$/, '') === mine.error.replace(/\.$/, '')) bothFail++;
    else diffs.push(`${tag}: original ${o.ok ? 'ok' : `ERROR "${o.error}"`} / new ${mine.ok ? 'ok' : `ERROR "${mine.error}"`}`);
    continue;
  }
  // What the user saw/exported in the original vs the new page.
  const pairs = [];
  if (c.slug === 'brazerwisereport') pairs.push(['grid', o.grids[0], asText(mine.out.tables[0])], ['excel', o.result, asText(mine.out.excel)]);
  else if (c.slug === 'stoplossreport') pairs.push(['details', o.result, asText(mine.out.tables[0])], ['summary', o.outs[0], asText(mine.out.tables[1])]);
  else pairs.push(['table', o.result, asText(mine.out.tables[0])]);
  if (c.slug.startsWith('processhistory')) pairs.push(['model', { columns: ['model'], rows: [[o.outs[0] ?? '']] }, { columns: ['model'], rows: [[mine.out.model ?? '']] }]);
  const bad = pairs.filter(([, a, b]) => !same(a, b));
  rowsSeen[c.slug] = Math.max(rowsSeen[c.slug] ?? 0, o.result?.rows?.length ?? 0);
  if (!bad.length) identical++;
  else {
    const [name, a, b] = bad[0];
    const ra = norm(a)?.rows ?? [];
    const rb = norm(b)?.rows ?? [];
    let detail = `${name}: cols ${JSON.stringify(a?.columns)} vs ${JSON.stringify(b?.columns)}; rows ${ra.length} vs ${rb.length}`;
    const k = ra.findIndex((r, i) => JSON.stringify(r) !== JSON.stringify(rb[i]));
    if (k >= 0) detail += `; first diff row ${k}: ${JSON.stringify(ra[k])} vs ${JSON.stringify(rb[k])}`;
    diffs.push(`${tag}: ${detail}`);
  }
}
console.log(`pages: ${Object.keys(WRL_REPORTS).length}, calls: ${calls.length}, identical: ${identical}, both fail same way: ${bothFail}, differences: ${diffs.length}`);
for (const d of diffs) console.log(' -', d.slice(0, 600));
console.log('max rows (original):', JSON.stringify(rowsSeen));
console.log('inputs:', JSON.stringify({ station, department, stage, area, serials }));
process.exit(0);
