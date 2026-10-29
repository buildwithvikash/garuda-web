// Serial Generation Logic's preview (modules/masters/serial-logic-preview.js): a logic's lines put together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewSerial } from '../src/modules/masters/serial-logic-preview.js';

const line = (Seq, VariantCode, VariantName, more = {}) => ({ Seq: String(Seq), VariantCode: String(VariantCode), VariantName, Format: '', Value: '', Seperator: '', StartingNo: '0', EndingNo: '0', Length: '0', ...more });

test('a fixed value, the serial number padded to its length and a separator, first to last', async () => {
  const p = await previewSerial({ rows: [line(2, 10, 'SerialNo', { StartingNo: '7', EndingNo: '120', Length: '4', Seperator: '/' }), line(1, 9, 'Addl String', { Value: 'AB' })], barcodeLength: '7' });
  assert.equal(p.first, 'AB0007/');
  assert.equal(p.last, 'AB0120/');
  assert.equal(p.count, '114');
  assert.deepEqual(p.problems, []);
});

test('no end: the largest number the length holds; the Barcode Length checked; a start after the end flagged', async () => {
  const p = await previewSerial({ rows: [line(1, 10, 'SerialNo', { Length: '3' })], barcodeLength: '5' });
  assert.deepEqual([p.first, p.last, p.count], ['001', '999', '999']);
  assert.ok(p.problems.some((m) => /Barcode Length is 5/.test(m)));
  const q = await previewSerial({ rows: [line(1, 10, 'SerialNo', { StartingNo: '50', EndingNo: '10', Length: '3' })] });
  assert.ok(q.problems.some((m) => /after Ending No/.test(m)));
  await assert.rejects(previewSerial({ rows: 'x' }), /as a list/);
});

test('a Model line without a material shows a placeholder', async () => {
  const p = await previewSerial({ rows: [line(1, 11, 'Model')] });
  assert.equal(p.first, '[Model]');
});
