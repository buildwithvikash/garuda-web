// Write parity for engine forms on UAT, with cleanup (agreed approach):
//  1. snapshot key counters (IDValue for the table and EventLog) and the EventLog high-water mark
//  2. save one record through the ORIGINAL (AActions.Save) and one through the new app, with the same values
//     (text fields carry a marker: ZZPO = original, ZZPN = new)
//  3. update both the same way, then cancel both; after every step compare the stored rows and the EventLog entries
//  4. finally hard-delete both test rows and the EventLog rows they produced, and restore the key counters
// Usage: node --env-file=.env scripts/parity/forms-write-parity.mjs <originalBinDir> [route...]
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, execute } from '../../src/db/index.js';
import { loadSettings } from '../../src/modules/settings/service.js';
import { newFormState, displayState, fill, engineControls } from '../../src/modules/forms/state.js';
import { PAGE_EVENTS } from '../../src/modules/forms/pages.js';
import { collect, insert, update, cancel } from '../../src/modules/forms/write.js';
import { formTables, tableSchema } from '../../src/modules/forms/schema.js';
import { toText } from '../../src/modules/forms/values.js';

const [bin, ...only] = process.argv.slice(2);
const SPECS = JSON.parse(readFileSync(new URL('../../src/modules/forms/forms.json', import.meta.url), 'utf8'));
const MODULES = ['/businesssetup/', '/materialsetup/', '/productionsetup/', '/settings/', '/authorization/'];
const SKIP = new Set(['/businesssetup/companyform']); // single-row company record: not touched
const ctx = { businessUnit: '12201', department: '1230001', userCode: '123003', userId: '123003' };
const yy = Number(String(new Date().getFullYear()).slice(-2));
await loadSettings();

// Named routes run as given (child grids/trees/lists included); otherwise the declarative pages only.
const routes = only.length
  ? only.filter((r) => SPECS[r])
  : Object.keys(SPECS).filter((r) => MODULES.some((m) => r.startsWith(m)) && !SKIP.has(r)).filter((r) => {
      const s = SPECS[r];
      return !s.custom.handlers && !s.custom.events && s.view?.tag && !s.controls.some((c) => ['GridView', 'TreeView', 'CheckBoxList'].includes(c.type) && c.tag?.length >= 4);
    });

/** Child tables of a page: [table, FK column, control]. */
function children(spec) {
  const out = [];
  for (const c of spec.controls) {
    if (!c.tag || c.tag.length < 4 || c.tag[2].toLowerCase().trim() === 'e') continue;
    if ((c.type === 'GridView' ? c.tag[1] : c.tag[0]).trim() === '') continue; // tag-less tree / list: no child table
    if (c.type === 'GridView') out.push([c.tag[1].trim(), c.tag[2].split('.').at(-1).trim(), c]);
    else if (c.type === 'TreeView' || c.type === 'CheckBoxList') out.push([c.tag[0].trim(), c.tag[2].replaceAll('$', '').trim(), c]);
  }
  return out;
}

/** Columns of a table with a foreign key (other than to the parent record): an existing referenced value. */
async function referenced(table, parentFk) {
  const rows = await query(`select pc.name col, object_name(fk.referenced_object_id) rt, rc.name rcol from sys.foreign_key_columns fk
    join sys.columns pc on pc.object_id = fk.parent_object_id and pc.column_id = fk.parent_column_id
    join sys.columns rc on rc.object_id = fk.referenced_object_id and rc.column_id = fk.referenced_column_id
    where fk.parent_object_id = object_id(@t)`, { t: table });
  const out = {};
  for (const r of rows) {
    if (r.col.toLowerCase() === parentFk.toLowerCase()) continue;
    const x = (await query(`select top 1 [${r.rcol}] v from [${r.rt}] where [${r.rcol}] is not null order by [${r.rcol}]`))[0];
    if (x) out[r.col.toLowerCase()] = toText(x.v);
  }
  return out;
}

/** Child-control test values. Grid: new rows on save; on update the displayed rows (keys kept, first one changed) + one new row. */
async function childValues(spec, state, marker, step, shown) {
  const v = {};
  for (const [table, fk, c] of children(spec)) {
    const s = state.controls.find((x) => x.id === c.id);
    if (c.type === 'TreeView') {
      const flat = (s.nodes ?? []).flatMap((n) => [n, ...n.children, ...n.children.flatMap((x) => x.children)]);
      v[c.id] = (step === 0 ? flat.slice(0, 4) : flat.slice(2, 7)).map((n) => n.value);
    } else if (c.type === 'CheckBoxList') {
      v[c.id] = (step === 0 ? s.options.slice(0, 2) : s.options.slice(1, 4)).map((o) => o.value);
    } else {
      const t = await tableSchema(table);
      const refs = await referenced(t.name, fk);
      // as the pages' Add button: row key = max existing + 1, FK = 0 (filled with the record key on save)
      const old = step === 0 ? [] : shown.find((x) => x.id === c.id)?.rows ?? [];
      const top = Math.max(0, ...old.map((r) => Number(r[s.keyName]) || 0));
      const cell = (col, i) => {
        if (!col || col.identity) return '';
        if (col.name.toLowerCase() === fk.toLowerCase()) return '0';
        if (col.name.toLowerCase() in refs) return refs[col.name.toLowerCase()];
        if (col.name === s.keyName) return String(top + i + 1);
        if (col.sqlType === 'time') return `${String(8 + i + step).padStart(2, "0")}:15:00`;
        if (col.dotnet === 'Boolean') return i % 2 ? '0' : '1';
        if (col.type === 'integer') return String(7 + i + step);
        if (col.type === 'decimal') return String(1.5 + i + step);
        if (col.type === 'datetime' || col.type === 'date') return new Date().toISOString().slice(0, 10);
        return `${marker}${step}r${i}`.slice(0, col.maxLength > 0 ? col.maxLength : 40);
      };
      // BoundFields, and TemplateFields (a TextBox bound to "<header without spaces>")
      const fresh = (i) => Object.fromEntries(s.columns.filter((f) => f.dataField || (f.kind === 'templatefield' && (f.template?.type ?? 'TextBox') === 'TextBox' && f.header.trim() !== '')).map((f) => f.dataField ?? f.header.replaceAll(' ', '')).map((n) => [n, cell(t.col(n), i)]));
      if (step === 0) v[c.id] = [fresh(0), fresh(1)];
      else {
        const first = old[0] ? { ...old[0], ...Object.fromEntries(Object.entries(fresh(5)).filter(([k, x]) => x !== '' && k !== s.keyName && k.toLowerCase() !== fk.toLowerCase())) } : null;
        v[c.id] = [...(first ? [first] : []), ...old.slice(1), fresh(0)];
      }
    }
  }
  return v;
}

/** Child rows of a record, as comparable text (identity / row-key columns dropped, keys normalised). */
async function childRows(spec, key, K) {
  const out = {};
  for (const [table, fk, c] of children(spec)) {
    const t = await tableSchema(table);
    const drop = new Set(t.columns.filter((x) => x.identity || x.pk || x.name === (c.attrs.datakeynames ?? '').split(',')[0].trim()).map((x) => x.name));
    const rows = await query(`select * from ${t.name} where ${fk} = @k`, { k: key });
    out[table] = rows.map((r) => norm(JSON.stringify(Object.entries(r).filter(([k]) => !drop.has(k)).map(([k, x]) => [k, x instanceof Date ? 'DATE' : toText(x)])), K)).sort();
  }
  return out;
}

function original(cases) {
  const file = join(mkdtempSync(join(tmpdir(), 'parity-')), 'cases.json');
  writeFileSync(file, JSON.stringify(cases));
  const { DB_SERVER, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./original-forms.ps1', import.meta.url)), bin, file], {
    env: { ...process.env, PARITY_CONN: `Server=${DB_SERVER},${DB_PORT};Database=${DB_NAME};User Id=${DB_USER};Password=${DB_PASSWORD};` },
  }).toString();
  return JSON.parse(raw.slice(raw.indexOf('[')))[0];
}

/** Test values from the new-form state: text marked, numbers 7 / 1.5, dates today, lists: first real option. */
function values(state, marker, step) {
  const v = {};
  for (const c of state.controls) {
    if (!c.id || !c.enabled || c.readOnly || !c.visible) continue;
    const t = state.tables.find((x) => x.name.toLowerCase() === c.table.toLowerCase().trim());
    const col = t?.col(c.column);
    if (!col || (t.pk && col.name === t.pk)) continue;
    if (c.type === 'TextBox') {
      if (col.type === 'integer') v[c.id] = String(7 + step);
      else if (col.type === 'decimal') v[c.id] = String(1.5 + step);
      else if (col.type === 'datetime' || col.type === 'date') v[c.id] = c.value || new Date().toISOString().slice(0, 10);
      else if (col.sqlType === 'time') v[c.id] = `0${6 + step}:30:00`;
      else if (col.type === 'string') v[c.id] = `${marker}${step}${c.id}`.slice(0, col.maxLength > 0 ? col.maxLength : 40);
    } else if (c.type === 'DropDownList' && !c.cond.includes('BU') && c.column.toLowerCase() !== 'status') {
      const real = c.options.filter((o) => o.value !== '');
      if (real.length) v[c.id] = real[Math.min(step, real.length - 1)].value;
    } else if (c.type === 'CheckBox') v[c.id] = step % 2 === 0;
  }
  return v;
}

const norm = (s, keys) => {
  let x = String(s);
  for (const [k, r] of keys) x = x.split(k).join(r);
  // "now" stamped by each side a moment apart (e.g. a CD date in the EventLog): today's times compared as NOW
  const d = new Date();
  const today = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  x = x.replace(new RegExp(`${today} (?!12:00:00 AM)\d\d:\d\d:\d\d [AP]M`, 'g'), 'NOW');
  return x.replaceAll('ZZPO', 'ZZP').replaceAll('ZZPN', 'ZZP');
};
async function rowOf(table, pk, key) {
  const t = (await query(`select * from ${table} where ${pk} = @k`, { k: key }))[0];
  return t && Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v instanceof Date ? 'DATE' : toText(v)])); // dates: compared by presence (both take "now")
}
async function events(keys) {
  return query(`select EventID, Module, Action, AppResponse, Message, DocRef, TransactionData, BusinessUnit, EventUser from EventLog where DocRef in (${keys.map((_, i) => `@k${i}`).join(',')}) and EventID > @floor order by EventID`, { ...Object.fromEntries(keys.map((k, i) => [`k${i}`, k])), floor: floorEvent });
}
let floorEvent = 0n;

/** What the user's choices trigger: each page event whose control got a test value, its patches applied to the values. */
async function withEvents(spec, state, v) {
  const h = { fill: (sql, params) => fill(sql, 'Select A Value', params), options: async (id) => (await fill(engineControls(spec).find((c) => c.id === id)?.query ?? '')) ?? [] };
  const out = { ...v };
  for (const [id, fn] of Object.entries(PAGE_EVENTS[spec.file] ?? {})) {
    if (!(id in v)) continue;
    const all = { ...Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.value ?? ''])), ...out };
    const r = await fn(all, h);
    for (const [k, p] of Object.entries(r.set ?? {})) {
      const opts = p.options ?? state.controls.find((c) => c.id === k)?.options ?? [];
      if ('index' in p) out[k] = opts[p.index]?.value ?? '';
      if ('value' in p) out[k] = p.value;
    }
  }
  return out;
}
/** What the browser sends back: control values, grid rows for a GridView. */
const sent = (state) => Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.type === 'GridView' ? c.rows : c.value]));

const results = [];
for (const route of routes) {
  const spec = SPECS[route];
  const tables = await formTables(spec).catch(() => null);
  if (tables && tables[0] && !tables[0].pk) {
    // No primary key: the original can only Save (Update/Cancel need PrimaryKey[0]). Compare the inserted rows
    // found by their marker, then delete them by marker.
    const t = tables[0];
    const state = await newFormState(spec, ctx);
    const base = Object.fromEntries(state.controls.filter((c) => c.id).map((c) => [c.id, c.value]));
    const textCol = state.controls.find((c) => c.type === 'TextBox' && t.col(c.column)?.type === 'string' && c.enabled && !c.readOnly);
    if (!textCol) {
      results.push([route, 'skipped (no text field to mark the test row)']);
      continue;
    }
    const markCol = t.col(textCol.column).name;
    const so = original({ id: 0, mode: 'save', spec: { top: spec.top, view: spec.view, controls: spec.controls, formModuleId: spec.formModuleId, file: spec.file, titleBar: spec.titleBar, inherits: spec.inherits }, ctx, values: values(state, 'ZZPO', 0) });
    let ne = null;
    try {
      await insert(spec, await collect(spec, { ...base, ...values(state, 'ZZPN', 0) }, ctx), ctx);
    } catch (e) {
      ne = e.message;
    }
    const rows = await query(`select * from ${t.name} where ${markCol} like 'ZZP%'`);
    const shown = rows.map((r) => norm(JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? 'DATE' : toText(v)]))), []));
    await execute(`delete from ${t.name} where ${markCol} like 'ZZP%'`);
    const ok = so.ok && !ne && rows.length === 2 && shown[0] === shown[1];
    results.push([route, ok ? 'IDENTICAL' : `save (no primary key): original ${so.ok ? 'ok' : `ERROR ${so.error}`} / new ${ne ? `ERROR ${ne}` : 'ok'}; rows ${JSON.stringify(shown).slice(0, 300)}`]);
    continue;
  }
  if (!tables?.[0]) {
    results.push([route, 'skipped (tables missing)']);
    continue;
  }
  const main = tables[0];
  const snap = {
    counters: await Promise.all([main.name, ...children(spec).map(([t]) => t), 'EventLog'].map(async (t) => [t, (await query('select SLNo from IDValue where IDTable=@t and Year=@y', { t, y: yy }))[0]?.SLNo ?? null])),
    maxEvent: (await query('select isnull(max(EventID),0) m from EventLog'))[0].m,
  };
  floorEvent = snap.maxEvent;
  const created = [];
  const report = [];
  try {
    const state = await newFormState(spec, ctx);
    // --- save
    const vO = await withEvents(spec, state, { ...values(state, 'ZZPO', 0), ...(await childValues(spec, state, 'ZZPO', 0)) });
    const vN = await withEvents(spec, state, { ...values(state, 'ZZPN', 0), ...(await childValues(spec, state, 'ZZPN', 0)) });
    const so = original({ id: 0, mode: 'save', spec: { top: spec.top, view: spec.view, controls: spec.controls, formModuleId: spec.formModuleId, file: spec.file, titleBar: spec.titleBar, inherits: spec.inherits }, ctx, values: vO });
    let keyN = null;
    try {
      const base = sent(state);
      keyN = await insert(spec, await collect(spec, { ...base, ...vN }, ctx), ctx);
    } catch (e) {
      keyN = { error: e.message };
    }
    if (!so.ok || typeof keyN !== 'string') {
      report.push(`save: original ${so.ok ? 'ok' : `ERROR ${so.error}`} / new ${typeof keyN === 'string' ? 'ok' : `ERROR ${keyN.error}`}`);
      if (so.ok) created.push(so.result.key);
      if (typeof keyN === 'string') created.push(keyN);
      results.push([route, report.join('; ')]);
      continue;
    }
    const keyO = so.result.key;
    created.push(keyO, keyN);
    const K = [[keyO, 'KEY'], [keyN, 'KEY']];
    const cmp = async (step) => {
      const a = await rowOf(main.name, main.pk, keyO);
      const b = await rowOf(main.name, main.pk, keyN);
      const bad = Object.keys({ ...a, ...b }).filter((k) => k !== main.pk && norm(a?.[k] ?? '', K) !== norm(b?.[k] ?? '', K));
      if (bad.length) report.push(`${step} row: ${bad.slice(0, 4).map((k) => `${k} ${JSON.stringify(a?.[k])} vs ${JSON.stringify(b?.[k])}`).join(', ')}`);
      const ev = await events([keyO, keyN]);
      const eo = ev.filter((e) => toText(e.DocRef) === keyO).map((e) => norm(JSON.stringify([e.Module, e.Action, e.AppResponse, e.Message, e.TransactionData, e.BusinessUnit, e.EventUser]), K));
      const en = ev.filter((e) => toText(e.DocRef) === keyN).map((e) => norm(JSON.stringify([e.Module, e.Action, e.AppResponse, e.Message, e.TransactionData, e.BusinessUnit, e.EventUser]), K));
      if (JSON.stringify(eo) !== JSON.stringify(en)) report.push(`${step} events: ${JSON.stringify(eo).slice(0, 200)} vs ${JSON.stringify(en).slice(0, 200)}`);
      const co = await childRows(spec, keyO, K);
      const cn = await childRows(spec, keyN, K);
      for (const t of Object.keys(co)) if (JSON.stringify(co[t]) !== JSON.stringify(cn[t])) report.push(`${step} ${t}: ${JSON.stringify(co[t]).slice(0, 250)} vs ${JSON.stringify(cn[t]).slice(0, 250)}`);
    };
    await cmp('save');
    // --- update (load each record as displayed, change values)
    const uO = await withEvents(spec, state, { ...values(state, 'ZZPO', 1), ...(await childValues(spec, state, 'ZZPO', 1, (await displayState(spec, ctx, keyO)).controls)) });
    const uN = await withEvents(spec, state, { ...values(state, 'ZZPN', 1), ...(await childValues(spec, state, 'ZZPN', 1, (await displayState(spec, ctx, keyN)).controls)) });
    const uo = original({ id: 0, mode: 'update', key: keyO, spec: { top: spec.top, view: spec.view, controls: spec.controls, formModuleId: spec.formModuleId, file: spec.file, titleBar: spec.titleBar, inherits: spec.inherits }, ctx, values: uO });
    const disp = await displayState(spec, ctx, keyN);
    const cur = sent(disp);
    let un = null;
    try {
      await update(spec, await collect(spec, { ...cur, ...uN }, ctx), ctx);
    } catch (e) {
      un = e.message;
    }
    if (!uo.ok || un) report.push(`update: original ${uo.ok ? 'ok' : `ERROR ${uo.error}`} / new ${un ? `ERROR ${un}` : 'ok'}`);
    await cmp('update');
    // --- cancel
    const co = original({ id: 0, mode: 'cancel', key: keyO, remark: 'parity', spec: { top: spec.top, view: spec.view, controls: spec.controls, formModuleId: spec.formModuleId, file: spec.file, titleBar: spec.titleBar, inherits: spec.inherits }, ctx });
    const d2 = await displayState(spec, ctx, keyN);
    let cn = null;
    try {
      await cancel(spec, await collect(spec, sent(d2), ctx), ctx, 'parity');
    } catch (e) {
      cn = e.message;
    }
    if (!co.ok || cn) report.push(`cancel: original ${co.ok ? 'ok' : `ERROR ${co.error}`} / new ${cn ? `ERROR ${cn}` : 'ok'}`);
    await cmp('cancel');
    results.push([route, report.length ? report.join(' | ') : 'IDENTICAL']);
  } catch (e) {
    results.push([route, `harness error: ${e.message}`]);
  } finally {
    // cleanup: test rows, their EventLog rows, key counters
    for (const k of created) {
      for (const [table, fk] of children(spec)) await execute(`delete from ${table} where ${fk} = @k`, { k }).catch((e) => console.error('cleanup child', route, e.message));
      await execute(`delete from ${main.name} where ${main.pk} = @k`, { k }).catch((e) => console.error('cleanup row', route, e.message));
    }
    if (created.length) await execute(`delete from EventLog where EventID > @floor and DocRef in (${created.map((_, i) => `@k${i}`).join(',')})`, { floor: snap.maxEvent, ...Object.fromEntries(created.map((k, i) => [`k${i}`, k])) });
    const failLogs = await query("select count(*) n from EventLog where EventID > @floor and EventUser = @u and AppResponse = 0", { floor: snap.maxEvent, u: Number(ctx.userCode) });
    if (failLogs[0].n) await execute('delete from EventLog where EventID > @floor and EventUser = @u and AppResponse = 0', { floor: snap.maxEvent, u: Number(ctx.userCode) });
    // Restore counters only if nobody else wrote meanwhile (otherwise a key could be issued twice).
    const others = (await query('select count(*) n from EventLog where EventID > @floor and EventUser <> @u', { floor: snap.maxEvent, u: Number(ctx.userCode) }))[0].n;
    if (others) console.error('NOT restoring key counters for', route, '- other activity detected');
    else for (const [t, v] of snap.counters) {
      if (v === null) await execute('delete from IDValue where IDTable=@t and Year=@y', { t, y: yy });
      else await execute('update IDValue set SLNo=@v where IDTable=@t and Year=@y', { v, t, y: yy });
    }
  }
}
for (const [r, m] of results) console.log(`${m === 'IDENTICAL' ? 'OK  ' : 'DIFF'} ${r}: ${m}`.slice(0, 500));
console.log(`pages: ${results.length}, identical: ${results.filter(([, m]) => m === 'IDENTICAL').length}`);
process.exit(0);
