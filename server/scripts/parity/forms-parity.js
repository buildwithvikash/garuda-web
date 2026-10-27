// Read parity for engine forms: new-form state, record display and list page, original vs new, per page.
// Usage: node --env-file=.env scripts/parity/forms-parity.mjs <originalBinDir> [routePrefix...]
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryTable } from '../../src/db/pool.js';
import { loadSettings } from '../../src/modules/settings/settings.service.js';
import { newFormState, displayState, copyState, copyOptions } from '../../src/modules/forms/state.js';
import { listQuery, PAGE_SIZE } from '../../src/modules/forms/lists.js';
import { CUSTOM_DISPLAY } from '../../src/modules/forms/pages.js';
import { toText } from '../../src/shared/values.js';

const [bin, ...prefixes] = process.argv.slice(2);
const SPECS = JSON.parse(readFileSync(new URL('../../src/modules/forms/forms.json', import.meta.url), 'utf8'));
// "route#key" also displays that record (pages whose list shows nothing on this database)
const FORCED = new Map(prefixes.filter((p) => p.includes('#')).map((p) => p.split('#')));
const MODULES = prefixes.length ? prefixes.map((p) => p.split('#')[0]) : ['/businesssetup/', '/materialsetup/', '/productionsetup/', '/settings/', '/authorization/'];
const NOT_USED = ['/settings/existingstockentryform', '/settings/existingstockprintform']; // left out of the app
const routes = Object.keys(SPECS).filter((r) => MODULES.some((m) => r.startsWith(m)) && !NOT_USED.includes(r));
const UNORDERED = [];
const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
await loadSettings();

function runOriginal(cases) {
  const file = join(mkdtempSync(join(tmpdir(), 'parity-')), 'cases.json');
  writeFileSync(file, JSON.stringify(cases));
  const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-forms.ps1', import.meta.url)), bin, file], {
    env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
    maxBuffer: 256 * 1024 * 1024,
  }).toString();
  return new Map(JSON.parse(raw.slice(raw.indexOf('['))).map((o) => [o.id, o]));
}

/** New-app control state in the shape the original snapshot uses. */
function shape(state) {
  const o = {};
  const byId = new Map(state.controls.filter((c) => c.id).map((c) => [c.id, c]));
  // Control.Visible as the original reads it: false inside a hidden panel. Page-level panels are not built on the original
  // side here (events-parity covers them) and a control whose panel is missing sits at the top, so the walk stops there
  const shown = (c) => { for (let x = c; x && (x === c || !x.page); x = x.parent ? byId.get(x.parent) : null) if (x.visible === false) return false; return true; };
  for (const c of state.controls) {
    if (!c.id || c.page) continue; // page-level controls: compared by events-parity
    const s = { visible: c.parent ? shown(c) : c.visible, enabled: c.enabled };
    if (c.type === 'TextBox') Object.assign(s, { value: c.value ?? '', type: ['number', 'date', 'datetime-local'].includes(c.inputType) ? c.inputType : null, required: !!c.required, maxLength: c.maxLength > 0 ? c.maxLength : c.maxLength === -1 ? -1 : 0 });
    else if (c.type === 'DropDownList') Object.assign(s, { value: c.value ?? '', required: !!c.required, options: c.options.map((x) => `${x.value}=${x.text}`) });
    else if (c.type === 'CheckBoxList') Object.assign(s, { options: c.options.map((x) => `${x.value}=${x.text}`), value: c.value });
    else if (c.type === 'CheckBox') s.value = !!c.value;
    else if (c.type === 'Label' || c.type === 'Button') s.text = c.text;
    else if (c.type === 'Image') Object.assign(s, { value: c.value ?? '', enabled: undefined }); // a UserControl has no Enabled
    else if (c.type === 'ComboBox') Object.assign(s, { value: c.value ?? '', options: (c.options ?? []).map((x) => `${x.value}=${x.text}`), enabled: undefined });
    else if (c.type === 'GridView') s.rows = c.rows.map((r) => c.columns.filter((x) => x.kind === 'boundfield' || x.kind === 'templatefield').map((x) => r[x.dataField ?? x.header.replaceAll(' ', '')] ?? ''));
    else if (c.type === 'TreeView') Object.assign(s, { nodes: (c.nodes ?? []).flatMap((n) => [`0:${n.value}=${n.text}`, ...n.children.flatMap((ch) => [`1:${ch.value}=${ch.text}`, ...ch.children.map((g) => `2:${g.value}=${g.text}`)])]), value: [...(c.value ?? [])].sort() });
    o[c.id] = s;
  }
  return o;
}

function diff(a, b, path = '') {
  if (Array.isArray(a) || Array.isArray(b)) {
    const A = a ?? [];
    const B = b ?? [];
    if (JSON.stringify(A) !== JSON.stringify(B)) return [`${path}: ${JSON.stringify(A).slice(0, 120)} vs ${JSON.stringify(B).slice(0, 120)}`];
    return [];
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diff(a[k], b[k], path ? `${path}.${k}` : k));
  return String(a ?? '') === String(b ?? '') ? [] : [`${path}: original ${JSON.stringify(a)} vs new ${JSON.stringify(b)}`];
}

const cases = [];
const mine = new Map();
for (const route of routes) {
  const spec = SPECS[route];
  const base = { spec, ctx };
  // new-form state
  let id = cases.push({ ...base, id: cases.length, route, mode: 'new' }) - 1;
  try {
    mine.set(id, { ok: true, result: shape(await newFormState(spec, ctx)) });
  } catch (e) {
    mine.set(id, { ok: false, error: e.message });
  }
  if (!spec.view?.tag) continue;
  // list page 0 (full columns, before the grid hides its last one)
  id = cases.push({ ...base, id: cases.length, route, mode: 'list' }) - 1;
  let firstKey = null;
  try {
    const { count, sql } = await listQuery(spec, ctx);
    const t = await queryTable(`select * from ( ${sql}) as X where RecNo between 1 and ${PAGE_SIZE}`);
    const key = spec.view.tag.split('|')[1].split('.').at(-1).toUpperCase();
    const keyCol = t.columns.find((c) => c.name.toUpperCase() === key);
    firstKey = keyCol && t.rows[0] ? toText(t.rows[0][keyCol.name]) : null;
    mine.set(id, { ok: true, result: { count, table: { columns: t.columns.map((c) => c.name), rows: t.rows.map((r) => t.columns.map((c) => toText(r[c.name], { sqlType: c.type, scale: c.scale }))) } } });
  } catch (e) {
    mine.set(id, { ok: false, error: e.message });
  }
  if (FORCED.has(route)) firstKey = FORCED.get(route);
  if (firstKey === null) continue;
  // display of the newest record
  id = cases.push({ ...base, id: cases.length, route, mode: 'display', key: firstKey }) - 1;
  try {
    const d = await displayState(spec, ctx, firstKey);
    mine.set(id, { ok: true, result: { controls: shape(d), status: CUSTOM_DISPLAY.has(spec.file) ? -1 : d.recordStatus } }); // own display(key): no status
  } catch (e) {
    mine.set(id, { ok: false, error: e.message });
  }
  if (!spec.titleBar.copybutton) continue;
  // TitleControl Copy: the list of records to copy, and the form after copying the newest one
  id = cases.push({ ...base, id: cases.length, route, mode: 'copylist' }) - 1;
  try {
    mine.set(id, { ok: true, result: { options: (await copyOptions(spec))?.map((o) => `${o.value}=${o.text}`) ?? 'HIDDEN' } });
  } catch (e) {
    mine.set(id, { ok: false, error: e.message });
  }
  id = cases.push({ ...base, id: cases.length, route, mode: 'copy', key: firstKey }) - 1;
  try {
    mine.set(id, { ok: true, result: { controls: shape(await copyState(spec, ctx, firstKey)) } });
  } catch (e) {
    mine.set(id, { ok: false, error: e.message });
  }
}

const orig = runOriginal(cases.map(({ spec, ...c }) => ({ ...c, spec: { top: spec.top, view: spec.view, controls: spec.controls, formModuleId: spec.formModuleId, file: spec.file, titleBar: spec.titleBar, inherits: spec.inherits } })));
const tally = { same: 0, bothFail: 0, diff: 0 };
const perRoute = {};
for (const c of cases) {
  const o = orig.get(c.id);
  const m = mine.get(c.id);
  let problems = [];
  if (!o?.ok || !m.ok) {
    if (!o?.ok && !m.ok) {
      tally.bothFail++;
      continue;
    }
    problems = [`original ${o?.ok ? 'ok' : `ERROR "${o?.error}"`} / new ${m.ok ? 'ok' : `ERROR "${m.error}"`}`];
  } else {
    if (c.mode === 'copylist' && o.result.options.length <= 1) o.result.options = 'HIDDEN'; // TitleControl hides an empty list
    // lists filled by a query without ORDER BY: SQL Server gives no order in either app, so compare them as sets
    for (const [route, id] of UNORDERED) if (c.route === route) for (const x of [o.result, m.result]) { const d = x.controls ?? x; if (d[id]) d[id].options = [...d[id].options].sort(); }
    problems = diff(o.result, m.result);
  }
  if (problems.length) {
    tally.diff++;
    (perRoute[c.route] ??= []).push(`${c.mode}: ${problems.slice(0, 3).join(' ; ')}`);
  } else tally.same++;
}
console.log(`pages: ${routes.length}, checks: ${cases.length}, identical: ${tally.same}, both fail: ${tally.bothFail}, different: ${tally.diff}`);
for (const [r, p] of Object.entries(perRoute)) for (const x of p) console.log(` - ${r} ${x}`.slice(0, 400));
process.exit(0);
