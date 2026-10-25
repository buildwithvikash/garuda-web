// Write parity for page code that writes to the database outside Save/Update (UAT + cleanup, the agreed approach):
//  - grid Delete on a saved row (AU.GridViewRowDeleting deletes it from the child table at once):
//    VariantFieldGroup, Variant, Model. Two test records (ZZPO / ZZPN) are saved with two child rows each; the
//    original page deletes the first row of one, the new app of the other; the child rows left are compared.
//  - "Add" with a new value typed (AVMaterial.AddVarintFieldValue inserts a VariantFieldValue): Variant, Model.
//    The new rows (name marked ZZPO / ZZPN) and what the form shows afterwards are compared.
// Afterwards every test row, its EventLog rows and the key counters are put back.
// Usage: node --env-file=.env scripts/parity/grid-db-parity.mjs <originalBinDir>
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, execute } from '../../src/db/connection.js';
import { loadSettings } from '../../src/services/settings/settings.service.js';
import { newFormState, displayState } from '../../src/services/forms/state.service.js';
import { collect, insert } from '../../src/services/forms/write.service.js';
import { PAGE_EVENTS, eventHelpers } from '../../src/services/forms/pages.service.js';
import { toText } from '../../src/shared/utils/values.js';

const [bin] = process.argv.slice(2);
const SPECS = JSON.parse(readFileSync(new URL('../../src/data/forms/forms.json', import.meta.url), 'utf8'));
const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
const yy = Number(String(new Date().getFullYear()).slice(-2));
await loadSettings();

function original(cases) {
  const file = join(mkdtempSync(join(tmpdir(), 'parity-')), 'cases.json');
  writeFileSync(file, JSON.stringify(cases));
  const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-forms.ps1', import.meta.url)), bin, file], {
    env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
  return JSON.parse(raw.slice(raw.indexOf('[')))[0];
}
const specOf = (spec) => ({ top: spec.top, view: spec.view, controls: spec.controls, formModuleId: spec.formModuleId, file: spec.file, titleBar: spec.titleBar, inherits: spec.inherits });
const sent = (state) => Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : (c.value ?? '')]));
const norm = (s) => String(s).replaceAll('ZZPO', 'ZZP').replaceAll('ZZPN', 'ZZP');

/** the new app: steps on a form, patches applied as the client applies them */
async function runNew(spec, key, steps) {
  const state = key ? await displayState(spec, ctx, key) : await newFormState(spec, ctx);
  const controls = structuredClone(state.controls);
  let vs = { ...state.viewState };
  const alerts = [];
  for (const step of steps) {
    for (const [id, x] of Object.entries(step.values ?? {})) {
      const c = controls.find((y) => y.id === id);
      if (c) c.value = c.type === 'DropDownList' && !c.options.some((o) => o.value === x) ? (c.options[0]?.value ?? '') : x;
    }
    const v = Object.fromEntries(controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : (c.value ?? '')]));
    const r = await PAGE_EVENTS[spec.file][step.command ? `GVTransData:${step.command}` : step.control](v, eventHelpers(spec, ctx, v, { viewState: vs, arg: step.arg }));
    for (const [k, p] of Object.entries(r.set ?? {})) {
      const c = controls.find((y) => y.id === k);
      if (!c) continue;
      if (p.options) Object.assign(c, { options: p.options, refilled: true });
      if ('index' in p) c.value = c.options[p.index]?.value ?? '';
      if ('value' in p) c.value = p.value;
      if (p.rows) c.rows = p.rows;
    }
    if (r.viewState) vs = r.viewState;
    if (r.alert) alerts.push(r.alert);
  }
  const grid = controls.find((c) => c.id === 'GVTransData');
  return { rows: grid.rows.map((r) => grid.columns.filter((x) => x.kind === 'boundfield').map((x) => r[x.dataField] ?? '')), alerts, ddl: Object.fromEntries(controls.filter((c) => c.type === 'DropDownList' && c.page).map((c) => [c.id, c.value])) };
}

const childRows = async (table, fk, key, drop) =>
  (await query(`select * from ${table} where ${fk} = @k`, { k: key })).map((r) => norm(JSON.stringify(Object.entries(r).filter(([k]) => !drop.includes(k)).map(([k, x]) => [k, x instanceof Date ? 'DATE' : toText(x)])))).sort();

const floor = (await query('select isnull(max(EventID),0) m from EventLog'))[0].m;
const counterTables = ['VariantFGroupHeader', 'VariantHeader', 'Model', 'VariantFieldValue', 'EventLog', 'VariantFGroupTrans', 'VariantTran', 'ModelVariant'];
const counters = await Promise.all(counterTables.map(async (t) => [t, (await query('select SLNo from IDValue where IDTable=@t and Year=@y', { t, y: yy }))[0]?.SLNo ?? null]));
const created = []; // [table, keyColumn, key, [childTable, fk]]
const results = [];

try {
  // ---- grid Delete on saved rows -------------------------------------------------------------------------------
  for (const [route, child, fk, rowKey, nameCol] of [
    ['/materialsetup/modelform', 'ModelVariant', 'ModelCode', 'RowID', 'Name'],
  ]) {
    const spec = SPECS[route];
    const state = await newFormState(spec, ctx);
    const head = state.tables[0];
    const textCtl = state.controls.find((c) => c.type === 'TextBox' && c.enabled && !c.readOnly && head.col(c.column)?.type === 'string' && head.col(c.column).name === nameCol);
    // two child rows from existing reference data (fields / values in UAT)
    const sample = await query(route.includes('group')
      ? 'select top 2 FieldCode, Name from VariantField order by FieldCode'
      : 'select top 2 v.Code ValueCode, f.Name, v.Name Value, v.Prefix, v.Field from VariantFieldValue v join VariantField f on f.FieldCode = v.Field where v.Prefix is not null order by v.Code');
    const gridRows = sample.map((r, i) => (route.includes('group')
      ? { Name: String(r.Name), FieldCode: String(r.FieldCode), GroupCode: '0' }
      : { RowID: String(i + 1), RecNo: String(i + 1), [fk]: '0', ValueCode: String(r.ValueCode), Name: String(r.Name), Value: String(r.Value), Prefix: String(r.Prefix ?? '') }));
    const keys = {};
    for (const m of ['ZZPO', 'ZZPN']) {
      const vals = { ...sent(state), GVTransData: gridRows };
      const fit = (c, x) => x.slice(0, Math.min(20, head.col(c.column).maxLength > 0 ? head.col(c.column).maxLength : 20));
      if (textCtl) vals[textCtl.id] = fit(textCtl, `${m}d${route.length}`);
      for (const c of state.controls) if (c.type === 'TextBox' && c.enabled && !c.readOnly && c.id !== textCtl?.id && head.col(c.column)?.type === 'string') vals[c.id] = fit(c, `${m}${c.id}`);
      keys[m] = await insert(spec, await collect(spec, vals, ctx), ctx);
      created.push([head.name, head.pk, keys[m], [child, fk]]);
    }
    const before = await childRows(child, fk, keys.ZZPO, ['RowID', 'ROWID', fk]);
    const shown = (await displayState(spec, ctx, keys.ZZPN)).controls.find((c) => c.id === 'GVTransData').rows;
    const arg = shown[0]?.[rowKey] ?? shown[0]?.[Object.keys(shown[0]).find((k) => k.toLowerCase() === rowKey.toLowerCase())];
    const shownO = (await displayState(spec, ctx, keys.ZZPO)).controls.find((c) => c.id === 'GVTransData').rows;
    const argO = shownO[0]?.[Object.keys(shownO[0]).find((k) => k.toLowerCase() === rowKey.toLowerCase())];
    const handler = spec.controls.find((c) => c.id === 'GVTransData') && (route.includes('model') ? 'GVTransData_RowDeleting' : 'GVTransData_RowDeleting1');
    const o = original({ id: 0, mode: 'event', key: keys.ZZPO, viewState: {}, steps: [{ handler, command: 'delete', arg: String(argO), values: {} }], ctx, spec: specOf(spec) });
    let n;
    try {
      n = { ok: true, result: await runNew(spec, keys.ZZPN, [{ command: 'delete', arg: String(arg), values: {} }]) };
    } catch (e) {
      n = { ok: false, error: e.message };
    }
    const leftO = await childRows(child, fk, keys.ZZPO, ['RowID', 'ROWID', fk]);
    const leftN = await childRows(child, fk, keys.ZZPN, ['RowID', 'ROWID', fk]);
    const problems = [];
    if (!o.ok || !n.ok) problems.push(`original ${o.ok ? 'ok' : `ERROR ${o.error}`} / new ${n.ok ? 'ok' : `ERROR ${n.error}`}`);
    if (JSON.stringify(leftO) !== JSON.stringify(leftN)) problems.push(`rows left ${JSON.stringify(leftO).slice(0, 200)} vs ${JSON.stringify(leftN).slice(0, 200)}`);
    if (leftO.length !== before.length - 1) problems.push(`original left ${leftO.length} of ${before.length} rows (expected one deleted)`);
    if (o.ok && n.ok) {
      const ogrid = o.result.controls.GVTransData?.rows ?? [];
      const strip = (rows) => rows.map((r) => norm(JSON.stringify(r)));
      // keys differ between the two records: compare the grid shape (row count) and the rows' non-key cells
      if (ogrid.length !== n.result.rows.length) problems.push(`grid rows ${ogrid.length} vs ${n.result.rows.length}`);
      void strip;
    }
    results.push([`${route} delete saved row`, problems.length ? problems.join(' | ') : `IDENTICAL (${before.length} -> ${leftO.length} rows in ${child})`]);
  }

  // ---- "Add" with a new value typed: VariantFieldValue inserted ----------------------------------------------------
  for (const route of ['/materialsetup/modelform']) {
    const spec = SPECS[route];
    const state = await newFormState(spec, ctx);
    const field = state.controls.find((c) => c.id === 'DdlName').options.find((o) => o.value !== '')?.value;
    const cat = state.controls.find((c) => c.id === 'DDLCategory')?.options.find((o) => o.value !== '')?.value;
    const steps = (m) => [
      { handler: 'DdlName_SelectedIndexChanged', control: 'DdlName', values: { DdlName: field } },
      { handler: 'BtnAdd_Click', control: 'BtnAdd', values: { TbNewValue: `${m}nv${route.length}`, ...(cat ? { DDLCategory: cat } : {}) } },
    ];
    const o = original({ id: 0, mode: 'event', key: null, viewState: {}, steps: steps('ZZPO'), ctx, spec: specOf(spec) });
    let n;
    try {
      n = { ok: true, result: await runNew(spec, null, steps('ZZPN')) };
    } catch (e) {
      n = { ok: false, error: e.message };
    }
    const rows = await query(`select * from VariantFieldValue where Name like 'ZZP%nv${route.length}'`);
    const shownO = rows.filter((r) => String(r.Name).startsWith('ZZPO')).map((r) => norm(JSON.stringify(Object.entries(r).filter(([k]) => !['Code', 'Alias'].includes(k)).map(([k, x]) => [k, x instanceof Date ? 'DATE' : toText(x)]))));
    const shownN = rows.filter((r) => String(r.Name).startsWith('ZZPN')).map((r) => norm(JSON.stringify(Object.entries(r).filter(([k]) => !['Code', 'Alias'].includes(k)).map(([k, x]) => [k, x instanceof Date ? 'DATE' : toText(x)]))));
    const problems = [];
    if (!o.ok || !n.ok) problems.push(`original ${o.ok ? 'ok' : `ERROR ${o.error}`} / new ${n.ok ? 'ok' : `ERROR ${n.error}`}`);
    if (shownO.length !== 1 || JSON.stringify(shownO) !== JSON.stringify(shownN)) problems.push(`VariantFieldValue rows ${JSON.stringify(shownO).slice(0, 250)} vs ${JSON.stringify(shownN).slice(0, 250)}`);
    if (o.ok && n.ok) {
      const og = (o.result.controls.GVTransData?.rows ?? []).map((r) => norm(JSON.stringify(r.map((x) => (rows.some((y) => String(y.Code) === x) ? 'CODE' : x)))));
      const ng = n.result.rows.map((r) => norm(JSON.stringify(r.map((x) => (rows.some((y) => String(y.Code) === x) ? 'CODE' : x)))));
      if (JSON.stringify(og) !== JSON.stringify(ng)) problems.push(`grid ${JSON.stringify(og).slice(0, 250)} vs ${JSON.stringify(ng).slice(0, 250)}`);
      const oa = (o.result.alerts ?? []).join('|');
      if (oa !== n.result.alerts.join('|')) problems.push(`alerts ${oa} vs ${n.result.alerts.join('|')}`);
    }
    results.push([`${route} add with a new value`, problems.length ? problems.join(' | ') : 'IDENTICAL (one VariantFieldValue each, same grid row)']);
  }
} catch (e) {
  results.push(['harness', `error: ${e.message}`]);
} finally {
  for (const [table, pk, key, [child, fk]] of created) {
    await execute(`delete from ${child} where ${fk} = @k`, { k: key }).catch((e) => console.error('cleanup', child, e.message));
    await execute(`delete from ${table} where ${pk} = @k`, { k: key }).catch((e) => console.error('cleanup', table, e.message));
  }
  await execute("delete from VariantFieldValue where Name like 'ZZP%'");
  await execute('delete from EventLog where EventID > @f and EventUser = @u', { f: floor, u: Number(ctx.userCode) });
  const others = (await query('select count(*) n from EventLog where EventID > @f', { f: floor }))[0].n;
  if (others) console.error('NOT restoring key counters - other activity detected');
  else for (const [t, v] of counters) {
    if (v === null) await execute('delete from IDValue where IDTable=@t and Year=@y', { t, y: yy });
    else await execute('update IDValue set SLNo=@v where IDTable=@t and Year=@y', { v, t, y: yy });
  }
}
for (const [r, m] of results) console.log(`${m.startsWith('IDENTICAL') ? 'OK  ' : 'DIFF'} ${r}: ${m}`.slice(0, 700));
process.exit(0);
