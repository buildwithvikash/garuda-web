// Cell text as the original GridView (AutoGenerateColumns) showed it: .NET ToString() in the server culture
// (en-IN: "23-04-2024 03:04:05 PM"), decimals keep their scale, bits are checkboxes, binary columns are not shown.
import { netNum } from './net.js';

const pad = (n) => String(n).padStart(2, '0');

export function enInDateTime(d) {
  const h = d.getHours() % 12 || 12;
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

const kind = (type) => {
  const t = type.toLowerCase();
  if (t === 'time') return 'time';
  if (t.includes('date')) return 'datetime';
  if (t === 'decimal' || t === 'numeric' || t.includes('money')) return 'decimal';
  if (t === 'float' || t === 'real') return 'float';
  if (t === 'bit') return 'bit';
  if (t.includes('binary') || t === 'image' || t === 'timestamp') return 'binary';
  return 'other';
};

/** Grid model: visible columns + display rows (bits stay booleans for checkbox rendering). */
export function toGrid({ columns, rows }) {
  const cols = columns.map((c) => ({ ...c, kind: kind(c.type) })).filter((c) => c.kind !== 'binary');
  return {
    columns: cols.map((c) => ({ name: c.name, kind: c.kind })),
    rows: rows.map((r) => cols.map((c) => cell(r[c.name], c))),
  };
}

function cell(v, c) {
  if (v === null || v === undefined) return '';
  switch (c.kind) {
    case 'datetime':
      return v instanceof Date ? enInDateTime(v) : String(v);
    case 'time':
      return v instanceof Date ? `${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}` : String(v); // driver returns local 1970-01-01 times
    case 'decimal':
      return typeof v === 'number' ? v.toFixed(c.scale) : String(v);
    case 'float':
      return netNum(v);
    case 'bit':
      return Boolean(v);
    default:
      return String(v);
  }
}
