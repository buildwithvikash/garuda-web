// Row sets a parity case may change: captured before it, compared after each side, put back exactly (deleted and
// inserted again, identity values kept). A set is { table, where, params? }; "where" must select the same rows before
// and after (e.g. by job card), so rows a side adds are inside it and removed by the restore.
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, execute } from '../../src/db/pool.js';
import { transaction } from '../../src/db/tx.js';

const meta = new Map();
async function columnsOf(table) {
  if (!meta.has(table)) {
    const cols = await query(
      "select c.name, c.is_identity, c.is_computed, t.name type from sys.columns c inner join sys.types t on t.user_type_id=c.user_type_id where c.object_id=object_id(@t) order by c.column_id",
      { t: table },
    );
    if (!cols.length) throw new Error(`rowset: no table ${table}`);
    meta.set(table, cols);
  }
  return meta.get(table);
}

/** the sets' current rows */
export async function capture(sets) {
  const out = [];
  for (const s of sets) out.push({ ...s, rows: await query(`select * from ${s.table} where ${s.where}`, s.params ?? {}) });
  return out;
}

/** the captured rows back (in one transaction) */
export async function restore(snap) {
  try {
    await restoreOnce(snap);
  } catch (e) {
    // the rows stay as the case left them: keep the snapshot for putting them back by hand
    const file = join(mkdtempSync(join(tmpdir(), 'rowset-')), 'snapshot.json');
    writeFileSync(file, JSON.stringify(snap, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
    throw new Error(`rowset restore failed (${e.message}); snapshot saved to ${file}`);
  }
}
async function restoreOnce(snap) {
  await transaction(async (tx) => {
    for (const s of [...snap].reverse()) await execute(`delete from ${s.table} where ${s.where}`, s.params ?? {}, tx);
    for (const s of snap) {
      if (!s.rows.length) continue;
      const cols = (await columnsOf(s.table)).filter((c) => !c.is_computed && c.type !== 'timestamp');
      const identity = cols.some((c) => c.is_identity);
      for (const r of s.rows) {
        const use = cols.filter((c) => c.name in r);
        const params = Object.fromEntries(use.map((c, i) => [`p${i}`, r[c.name]]));
        const sql = `insert into ${s.table} (${use.map((c) => `[${c.name}]`).join(',')}) values (${use.map((c, i) => `@p${i}`).join(',')})`;
        await execute(identity ? `set identity_insert ${s.table} on; ${sql}; set identity_insert ${s.table} off` : sql, params, tx);
      }
    }
  });
}

/** the sets' rows in a comparable form: identity columns left out, dates to the day, each set's rows sorted */
export async function state(sets) {
  const o = {};
  for (const s of sets) {
    const idCols = new Set((await columnsOf(s.table)).filter((c) => c.is_identity).map((c) => c.name));
    const rows = await query(`select * from ${s.table} where ${s.where}`, s.params ?? {});
    o[s.name ?? s.table] = rows.map((r) => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !idCols.has(k)).map(([k, x]) => [k, x instanceof Date ? x.toISOString().slice(0, 10) : Buffer.isBuffer(x) ? x.toString('base64') : x])))).sort();
  }
  return o;
}

/** the differences between two state() results, one line per set */
export function differences(a, b) {
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const [x, y] = [a[k] ?? [], b[k] ?? []];
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    const onlyA = x.filter((r) => !y.includes(r));
    const onlyB = y.filter((r) => !x.includes(r));
    out.push(`${k}: original-only ${onlyA.join(' ').slice(0, 700)} | new-only ${onlyB.join(' ').slice(0, 700)}`);
  }
  return out;
}
