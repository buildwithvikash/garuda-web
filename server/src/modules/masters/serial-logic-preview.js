// /api/masters/serial-logics/preview: what a Serial Generation Logic makes (owner, 29 Oct 2026), read only. The lines
// on the form (saved or not), in sequence order, built as production builds an asset tag (wip.service.js
// assetSegment: dates in their format, the week, fixed values, the model's AltName) with the serial number padded to
// its length: the first serial (its Starting No), the last (its Ending No, else the largest the length holds), how many,
// and each line's part. Nothing is taken or counted (no SerialBarcode row).
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../middlewares/auth.js';
import { query } from '../../db/pool.js';
import { AppError } from '../../shared/AppError.js';
import { ok } from '../../shared/http.js';
import { netString } from '../../shared/net.js';
import { assetSegment } from '../production/wip.service.js';

const SERIAL_NO = '10'; // SequenceVariant: the running number
const MODEL = '11'; // the material's AltName
const MAX_LINES = 50;

const text = (v) => netString(v).trim();
const big = (v) => (/^\d+$/.test(text(v)) ? BigInt(text(v)) : 0n);
/** a line's separator as production adds it ("spc" a space) */
const separator = (r) => (text(r.Seperator).toLowerCase() === 'spc' ? ' ' : netString(r.Seperator ?? ''));

/** { first, last, count, length, parts: [{ name, first, last, separator, note? }], problems: [] } */
export async function previewSerial({ rows, material, barcodeLength }) {
  if (!Array.isArray(rows)) throw AppError.badRequest('Send the logic\'s lines as a list.');
  if (rows.length > MAX_LINES) throw AppError.badRequest(`A logic has at most ${MAX_LINES} lines.`);
  const mat = /^\d{1,18}$/.test(text(material)) ? text(material) : '';
  const lines = [...rows].sort((a, b) => Number(text(a.Seq)) - Number(text(b.Seq)));
  const problems = [];
  const parts = [];
  let range = null;
  for (const r of lines) {
    const code = text(r.VariantCode);
    const name = text(r.VariantName) || `Line ${text(r.Seq)}`;
    const sep = separator(r);
    if (code === SERIAL_NO) {
      const length = Number(text(r.Length)) || 0;
      const start = big(r.StartingNo) > 0n ? big(r.StartingNo) : 1n;
      const top = length > 0 ? 10n ** BigInt(length) - 1n : 0n;
      const end = big(r.EndingNo) > 0n ? big(r.EndingNo) : top;
      if (length <= 0) problems.push(`${name}: no Length, so the number is not padded.`);
      if (end > 0n && start > end) problems.push(`${name}: Starting No ${start} is after Ending No ${end}.`);
      if (top > 0n && end > top) problems.push(`${name}: Ending No ${end} has more digits than its Length ${length}.`);
      const pad = (n) => (length > 0 ? n.toString().padStart(length, '0') : n.toString());
      if (range) problems.push('The logic has more than one serial number line: the preview counts the first.');
      range ??= { start, end };
      parts.push({ name, first: pad(start), last: end > 0n ? pad(end) : '…', separator: sep, note: end > 0n ? '' : 'no end: it runs on' });
      continue;
    }
    let value;
    let note = '';
    if (code === MODEL && !mat) {
      value = '[Model]';
      note = 'the material\'s Alt Name';
    } else {
      try {
        value = await assetSegment({ VariantCode: code, Format: text(r.Format), Value: text(r.Value) }, mat || '0');
      } catch (e) {
        value = '?';
        problems.push(`${name}: ${e.message}`);
      }
      if (['1', '2', '4'].includes(code)) note = 'today\'s date';
    }
    parts.push({ name, first: value, last: value, separator: sep, note });
  }
  const join = (k) => parts.map((p) => p[k] + p.separator).join('');
  const first = join('first');
  const last = join('last');
  const count = range && range.end > 0n && range.end >= range.start ? (range.end - range.start + 1n).toString() : range ? 'no end' : '1';
  const want = Number(text(barcodeLength)) || 0;
  if (want > 0 && first.length !== want) problems.push(`The serial is ${first.length} characters, the Barcode Length is ${want}.`);
  if (!lines.length) problems.push('The logic has no lines yet.');
  return { first, last, count, length: first.length, parts, problems };
}

/** the materials that use a saved logic (as their asset tag or FG serial logic), for the Model line's material */
const materialsOf = async (serialCode) =>
  (await query('select top 100 MatCode, Name from Material where (AssetTagType=@s or TrackNoType=@s) and Status=1 order by Name', { s: serialCode })).map((r) => ({ value: netString(r.MatCode), text: netString(r.Name) }));

const router = Router();
// { rows, barcodeLength, serialCode?, material? }: a saved logic offers its materials, the first one by default
router.post('/serial-logics/preview', requireAuth, authorizeScreen('/materialsetup/serialgenerationlogicform'), async (req, res) => {
  const body = req.body ?? {};
  const code = text(body.serialCode);
  const materials = /^\d{1,18}$/.test(code) && code !== '0' ? await materialsOf(code) : [];
  const material = /^\d{1,18}$/.test(text(body.material)) ? text(body.material) : (materials[0]?.value ?? '');
  ok(res, { ...(await previewSerial({ ...body, material })), material, materials });
});

export default router;
