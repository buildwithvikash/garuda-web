// A small DataTable stand-in for ports of C# code that builds tables row by row:
// columns keep their SQL kind (for GridView/Excel formatting) and C#-added columns are text.
import { queryTable } from '../../db/index.js';
import { toGrid } from './format.js';
import { netNum } from '../../lib/net.js';

export async function sqlTable(text, params = {}) {
  const t = await queryTable(text, params);
  return { columns: t.columns.map((c) => ({ ...c })), rows: t.rows.map((r) => t.columns.map((c) => r[c.name])) };
}

export function newTable(names) {
  return { columns: names.map((name) => ({ name, type: 'nvarchar', scale: 0 })), rows: [] };
}

export const col = (t, name) => {
  const i = t.columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
  if (i < 0) throw new Error(`Column '${name}' does not belong to table .`);
  return i;
};
export const get = (t, row, name) => row[col(t, name)];

export function addColumn(t, name) {
  t.columns.push({ name, type: 'nvarchar', scale: 0 });
  for (const r of t.rows) r.push(null);
}

export function removeColumn(t, name) {
  const i = col(t, name);
  t.columns.splice(i, 1);
  for (const r of t.rows) r.splice(i, 1);
}

export function newRow(t) {
  return new Array(t.columns.length).fill(null);
}

/** Value stored into a string DataColumn: .NET Convert.ToString (doubles via ToString()). */
export function asText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return netNum(v);
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return String(v);
}

export function set(t, row, name, value) {
  const i = col(t, name);
  row[i] = t.columns[i].type === 'nvarchar' && !t.columns[i].fromSql ? asText(value) : value;
}

/** Grid model for the UI and for parity comparisons. */
export function grid(t) {
  return toGrid({ columns: t.columns, rows: t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c.name, r[i]]))) });
}
