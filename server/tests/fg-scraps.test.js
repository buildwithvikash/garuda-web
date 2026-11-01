// FG Scrap's rules (modules/fg-scraps): what the screen sees, the scrapped serial, the request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentView, scrappedSerial } from '../src/modules/fg-scraps/fg-scraps.service.js';
import { validateScrap } from '../src/modules/fg-scraps/fg-scraps.validation.js';

test('the screen never sees a job card, row or process code', () => {
  const row = { Category: 'Raw Material', Material: 'MOTOR', Process: 'SCAN', Serial: 'M1', PsNo: '9', RowID: '2', ProcessCode: '7', matCode: '5' };
  assert.deepEqual(componentView(row), { category: 'Raw Material', material: 'MOTOR', process: 'SCAN', serial: 'M1' });
});

test('a scrapped serial is marked as the original marks it', () => {
  assert.equal(scrappedSerial('M1', new Date(2026, 10, 1, 14, 7, 30)), 'M1-SCRAP01-11-26-07');
});

test('a scrap needs a unit, a category and a remark, trimmed; nothing else is taken', () => {
  assert.deepEqual(validateScrap({ unit: ' U1 ', category: '1220001', remark: ' bad ', PSNo: '1' }), { value: { unit: 'U1', category: '1220001', remark: 'bad' } });
  assert.deepEqual(Object.keys(validateScrap({ unit: 'U1', category: 'x', remark: '  ' }).errors).sort(), ['category', 'remark']);
  assert.ok(validateScrap({ unit: 'U1', category: '1', remark: 'r'.repeat(151) }).errors.remark);
  assert.ok(validateScrap({ unit: { a: 1 }, category: '1', remark: 'r' }).errors.unit);
  assert.equal(Object.keys(validateScrap(undefined).errors).length, 3);
});
