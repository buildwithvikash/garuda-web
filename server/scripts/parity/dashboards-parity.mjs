// Dashboard parity: every panel of every WRL dashboard computed by the original DLLs and by the new code.
// Read-only. Usage: node --env-file=.env scripts/parity/dashboards-parity.mjs <originalBinDir>
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WRL_DASHBOARDS } from '../../src/modules/dashboards/pages.js';
import { currentShiftAndPeriod } from '../../src/modules/dashboards/shift.js';
import * as wrl from '../../src/modules/dashboards/wrl.js';

const bin = process.argv[2];
const calls = [];
const depts = new Set();
for (const [slug, page] of Object.entries(WRL_DASHBOARDS)) {
  depts.add(page.dept);
  for (const p of page.panels) {
    if (p.kind === 'static') continue;
    if (p.kind === 'brazing') {
      for (const station of p.stations) calls.push({ slug, fn: 'brazing', dept: page.dept, station, visi: slug.startsWith('visi'), sus: slug.startsWith('sus'), sql: p.sql });
    } else {
      calls.push({ slug, fn: p.kind === 'foamDial' || p.kind === 'cabinetDial' ? p.kind : p.kind, dept: page.dept, ...p });
    }
  }
}
for (const dept of depts) calls.push({ slug: '-', fn: 'shift', dept });
calls.forEach((c, i) => (c.id = i));

// New implementation first, original right after (values depend on the clock; compared with tolerance below).
const shifts = new Map();
// PARITY_SHIFT='{"ShiftCode":1221,"ShiftName":"..","STimeStamp":"23-Apr-2024 08:00:00","ETimeStamp":"2024-04-23 18:00:00"}'
// replays a past shift on both sides, so values are compared on real production data.
const override = process.env.PARITY_SHIFT ? JSON.parse(process.env.PARITY_SHIFT) : null;
for (const d of depts) shifts.set(d, override ?? (await currentShiftAndPeriod(d)));
const mine = [];
for (const c of calls) {
  const shift = shifts.get(c.dept);
  try {
    let r;
    if (!shift && !['monthly', 'shift'].includes(c.fn)) throw new Error('no shift');
    if (c.fn === 'shift') r = shift && { ...shift, ShiftCode: String(shift.ShiftCode) };
    else if (c.fn === 'foamDial') r = await wrl.foamDial(shift, c.station, c.activity, c.remark);
    else if (c.fn === 'cabinetDial') r = await wrl.cabinetDial(shift, c.station, c.remark);
    else if (c.fn === 'monthly') r = await wrl.monthly(c.process, c.variant);
    else if (c.fn === 'hourly') r = await wrl.hourly(shift, c.hourly, c.selection);
    else if (c.fn === 'quality') r = await wrl.quality(shift, c.processes, c.selection);
    else if (c.fn === 'station') r = { rows: (await wrl.stationStatus(c.location)).map((x) => [x.Location, x.Time_Elapsed, x.HitCount]) };
    else if (c.fn === 'brazing') {
      const b = await wrl.brazingStation(shift, c.station, c.sql);
      r = { name: b.name ?? '', rows: b.rows, chart: b.chart.map((x) => [x.label, String(x.value)]) };
    }
    mine.push({ id: c.id, ok: true, result: r });
  } catch (e) {
    mine.push({ id: c.id, ok: false, error: e.message });
  }
}

const dir = mkdtempSync(join(tmpdir(), 'parity-'));
const callsFile = join(dir, 'calls.json');
writeFileSync(callsFile, JSON.stringify(calls.map(({ sql, ...c }) => c)));
const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-dashboards.ps1', import.meta.url)), bin, callsFile], {
  env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
  maxBuffer: 64 * 1024 * 1024,
}).toString();
const orig = new Map(JSON.parse(raw.slice(raw.indexOf('['))).map((o) => [o.id, o]));

// Normalise the new output to the shape the original controls hold.
function shape(c, r) {
  if (!r) return r;
  if (c.fn === 'foamDial' || c.fn === 'cabinetDial') return { value: r.value, rows: r.rows };
  if (c.fn === 'hourly') {
    const { chartTitle, chart, ...rest } = r;
    return { ...rest, chart: chart.map((x) => [x.label, String(x.value)]) };
  }
  if (c.fn === 'quality') {
    const { chart, ...rest } = r;
    return { ...rest, chart: chart.map((x) => [x.label, String(x.value)]) };
  }
  return r;
}
const TIME_FIELDS = new Set(['shiftProgress']); // seconds apart between runs -> allow 0.2
function diff(a, b, path = '') {
  if (TIME_FIELDS.has(path.split('.').at(-1)) && Math.abs(Number(a) - Number(b)) <= 0.2) return [];
  if (Array.isArray(a) || Array.isArray(b)) {
    const A = a ?? [];
    const B = b ?? [];
    if (A.length !== B.length) return [`${path}: length ${A.length} vs ${B.length}`];
    return A.flatMap((x, i) => diff(x, B[i], `${path}[${i}]`));
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => diff(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return String(a ?? '') === String(b ?? '') ? [] : [`${path}: original "${a}" vs new "${b}"`];
}

let same = 0;
const problems = [];
for (const m of mine) {
  const c = calls[m.id];
  const o = orig.get(m.id);
  const label = `${c.slug} ${c.fn}${c.station ? ' ' + c.station : ''}${c.location ? ' ' + c.location : ''}`;
  if (!o) problems.push(`${label}: no original result`);
  else if (!o.ok || !m.ok) {
    if (!o.ok && !m.ok && o.error.replace(/\.$/, '') === m.error.replace(/\.$/, '')) same++;
    else problems.push(`${label}: original ${o.ok ? 'ok' : 'error "' + o.error + '"'} / new ${m.ok ? 'ok' : 'error "' + m.error + '"'}`);
  } else {
    const d = diff(o.result, shape(c, m.result));
    if (d.length) problems.push(`${label}: ${d.slice(0, 4).join('; ')}`);
    else same++;
  }
}
console.log(`panels compared: ${calls.length}, identical: ${same}, different: ${problems.length}`);
for (const p of problems) console.log(' -', p);
const sample = mine.find((m) => calls[m.id].fn === 'foamDial' && m.ok);
if (sample) console.log('sample foam dial:', JSON.stringify(sample.result));
process.exit(0);
