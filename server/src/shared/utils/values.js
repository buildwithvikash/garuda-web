// Value.ToString() as the original printed database values (server culture en-IN).
import { netNum } from './net.js';
import { enInDateTime } from './format.js';

const pad = (n) => String(n).padStart(2, '0');

export function toText(v, col) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (col?.sqlType === 'time') return `${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
    return enInDateTime(v);
  }
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (Buffer.isBuffer(v)) return 'System.Byte[]';
  if (typeof v === 'number') {
    if (col && /decimal|numeric|money/.test(col.sqlType)) return v.toFixed(col.scale ?? 0);
    return netNum(v);
  }
  return String(v);
}
