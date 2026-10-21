// Helpers that reproduce .NET conversions the original code relies on, so comparisons behave the same.

/** Object.ToString() as .NET prints it (bool -> "True"/"False", null -> ""). */
export function netString(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (Buffer.isBuffer(v)) return 'System.Byte[]';
  return String(v);
}

/** WrapperAvatar.ParseBool: true for bit 1 / "true" / "1". */
export function netBool(v) {
  if (typeof v === 'boolean') return v;
  const s = netString(v).trim().toLowerCase();
  return s === 'true' || s === '1';
}

/** WrapperAvatar.ParseInt: ""/null -> 0, "true"/"false" -> 1/0, drops "," and "|", truncates at ".", throws otherwise. */
function parseWhole(v) {
  const s = netString(v);
  if (s.replace(/\|/g, '').trim() === '') return 0;
  if (s.toLowerCase() === 'true') return 1;
  if (s.toLowerCase() === 'false') return 0;
  const t = s.replace(/[,|]/g, '').split('.')[0].trim();
  if (!/^[+-]?\d+$/.test(t)) throw new Error('Input string was not in a correct format');
  return Number(t);
}
export function netInt(v) {
  const n = parseWhole(v);
  if (n > 2147483647 || n < -2147483648) throw new Error('Value was either too large or too small for an Int32.'); // Convert.ToInt32
  return n;
}

/** WrapperAvatar.ParseDouble: number, or 0 for empty / unparsable. */
export function netDouble(v) {
  const s = netString(v).replace(/\|/g, '');
  if (s.trim() === '') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** WrapperAvatar.ParseLong: like ParseInt but returns 0 instead of throwing. */
export function netLong(v) {
  try {
    return parseWhole(v);
  } catch {
    return 0;
  }
}

/** double.ToString() on .NET Framework, en-IN culture (15 significant digits, "NaN", "∞"). */
export function netNum(d) {
  if (Number.isNaN(d)) return 'NaN';
  if (!Number.isFinite(d)) return d > 0 ? '∞' : '-∞'; // en-IN PositiveInfinitySymbol on .NET Framework
  return String(Number(d.toPrecision(15)));
}

/** double.ToString("0.0") on .NET Framework: one decimal, midpoint away from zero, no "-0.0". */
export function netFixed1(d) {
  if (Number.isNaN(d)) return 'NaN';
  if (!Number.isFinite(d)) return d > 0 ? '∞' : '-∞'; // en-IN PositiveInfinitySymbol on .NET Framework
  const v = Number(d.toPrecision(15));
  const r = (Math.sign(v) * Math.round(Math.abs(v) * 10)) / 10;
  return r === 0 ? '0.0' : r.toFixed(1);
}

/** Math.Round(decimal): midpoint to even (banker's rounding). */
export function roundHalfEven(x) {
  const v = Number(x.toPrecision(15));
  const f = Math.floor(v);
  const diff = v - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

const MONTHS =['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** DateTime.ToString("dd-MMM-yyyy hh:mm:ss") — 12-hour clock without AM/PM, exactly as the original writes it. */
export function netDateString(d = new Date()) {
  const h12 = d.getHours() % 12 || 12;
  return `${pad(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${pad(h12)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** TimeSpan.Days of (a - b): whole days, truncated toward zero. */
export function netDaysBetween(a, b) {
  return Math.trunc((a.getTime() - b.getTime()) / 86400000);
}

/** Exception message as LoginForm shows it: dots and line breaks removed. */
export function alertText(message) {
  return String(message).replace(/[.\r\n]/g, '');
}

/** WrapperAvatar.ExceptionAlert as displayed: without , . ' " ; _ and cut to 75 characters (counted with backslashes
 *  doubled for the script; the browser then shows them single). */
export function exceptionAlert(message) {
  const m = String(message).replaceAll('\\', '\\\\').replace(/[,.'";_]/g, '');
  return (m.length <= 75 ? m : m.slice(0, 75)).replaceAll('\\\\', '\\');
}
