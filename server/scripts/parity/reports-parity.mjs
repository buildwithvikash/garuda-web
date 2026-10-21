// Generic report parity: for every in-scope report spec and several filter sets, the ORIGINAL control builds the SQL
// (original-reports.ps1); that SQL is executed as-is and compared, cell by cell after grid formatting, with the
// new parameterized query. Then the same for Search on a text column. Read-only.
// Usage: node --env-file=.env scripts/parity/reports-parity.mjs <originalBinDir>
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryTable } from '../../src/db/index.js';
import { REPORTS } from '../../src/modules/reports/routes.js';
import { compose, composeSearch, defaults, describeColumns } from '../../src/modules/reports/engine.js';
import { toGrid } from '../../src/modules/reports/format.js';
import { createHash } from 'node:crypto';

const bin = process.argv[2];
const BU = process.env.PARITY_BU ?? '12201';
const DEPT = process.env.PARITY_DEPT ?? '1230001';
// Past window with data in UAT, plus the page defaults (today / now).
const windows = {
  date: { from: '2024-04-01', to: '2024-04-30' },
  time: { from: '2024-04-23T08:00:00', to: '2024-04-23T18:00:00' },
  adv: { from: '2024-04-23T08:00:00', to: '2024-04-23T18:00:00' },
};

function original(cases) {
  const file = join(mkdtempSync(join(tmpdir(), 'parity-')), 'cases.json');
  writeFileSync(file, JSON.stringify(cases));
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-reports.ps1', import.meta.url)), bin, file], { maxBuffer: 256 * 1024 * 1024 }).toString();
  return new Map(JSON.parse(raw.slice(raw.indexOf('['))).map((o) => [o.id, o]));
}
// Grids are reduced to columns + row count + a hash of all rows, so huge reports fit in memory.
const digest = (g) => {
  // Order-independent: these queries mostly have no ORDER BY, and SQL Server returns such rows in varying order.
  const lines = g.rows.map((r) => JSON.stringify(r)).sort();
  const h = createHash('sha1');
  for (const l of lines) h.update(l);
  return { columns: g.columns, rows: { length: g.rows.length }, first: g.rows[0], hash: h.digest('hex') };
};
const run = async (fn) => {
  try {
    return { ok: true, grid: digest(toGrid(await fn())) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};
const same = (a, b) => JSON.stringify(a.columns) === JSON.stringify(b.columns) && a.rows.length === b.rows.length && a.hash === b.hash;
const show = (r) => (r.ok ? `${r.grid.rows.length} rows` : `ERROR ${r.error}`);

const cases = [];
for (const [path, spec] of Object.entries(REPORTS)) {
  for (const w of [defaults(spec), windows[spec.variant]]) {
    for (const department of ['', DEPT]) cases.push({ path, variant: spec.variant, tag: spec.tag.join('|'), bu: BU, department, filter: '', ...w });
  }
}
cases.forEach((c, i) => (c.id = i));
const orig = original(cases);

let identical = 0;
let bothFail = 0;
const diffs = [];
const maxRows = new Map();
const searchCases = [];
let done = 0;
for (const c of cases) {
  if (++done % 20 === 0) console.error(`progress ${done}/${cases.length}`);
  const t0 = Date.now();
  const spec = REPORTS[c.path];
  const o = orig.get(c.id);
  const before = o.error ? { ok: false, error: o.error } : await run(() => queryTable(o.sql));
  const after = await run(() => {
    const { text, params } = compose(spec, c);
    return queryTable(text, params);
  });
  if (Date.now() - t0 > 20000) console.error(`slow: ${c.path} ${Math.round((Date.now() - t0) / 1000)}s rows=${before.ok ? before.grid.rows.length : "-"}`);
  maxRows.set(c.path, Math.max(maxRows.get(c.path) ?? -1, before.ok ? before.grid.rows.length : -1));
  if (!before.ok && !after.ok) bothFail++;
  else if (before.ok && after.ok && same(before.grid, after.grid)) identical++;
  else diffs.push(`${c.path} dept=${c.department || '-'} ${c.from}: original ${show(before)} / new ${show(after)}`);

  if (before.ok && before.grid.rows.length && c.department === '' && c.from === windows[c.variant].from) {
    const cols = await describeColumns(spec, c).catch(() => []);
    const col = cols.find((x) => x.type === 'string' && before.grid.columns.some((g) => g.name === x.name));
    if (col) {
      const idx = before.grid.columns.findIndex((g) => g.name === col.name);
      searchCases.push({ ...c, id: searchCases.length, search: true, column: col, cols, value: String(before.grid.first[idx]).slice(0, 3) });
    }
  }
}

const origSearch = original(searchCases.map(({ column, cols, value, ...c }) => c));
for (const s of searchCases) {
  const o = origSearch.get(s.id);
  const name = `[${s.column.name.replaceAll(']', ']]')}]`;
  const before = o.error ? { ok: false, error: o.error } : await run(() => queryTable(`select * from (${o.sql}) as x where ${name} like '%${s.value.replaceAll("'", "''")}%' `));
  const after = await run(() => {
    const q = composeSearch(REPORTS[s.path], s, s.cols, { column: s.column.name, op: 'like', value: s.value });
    return queryTable(q.text, q.params);
  });
  if (!(before.ok && after.ok && same(before.grid, after.grid)) && !(!before.ok && !after.ok)) {
    diffs.push(`${s.path} SEARCH ${s.column.name} contains "${s.value}": original ${show(before)} / new ${show(after)}`);
  }
}

console.log(`reports: ${Object.keys(REPORTS).length}, cases: ${cases.length}, identical: ${identical}, both fail (as original): ${bothFail}, searches compared: ${searchCases.length}, differences: ${diffs.length}`);
for (const d of diffs) console.log(' -', d);
console.log('max rows per report:', JSON.stringify(Object.fromEntries([...maxRows].map(([k, v]) => [k.replace('/reports/', ''), v]))));
process.exit(0);
