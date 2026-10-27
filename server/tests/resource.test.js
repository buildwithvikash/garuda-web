// The screens' REST body check (modules/forms/resource.validation.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBody } from '../src/modules/forms/resource.validation.js';

const check = validateBody({ uomCode: 'PrimaryKey', name: 'TextBox3', shiftBreaks: 'GVTransData', processes: 'CBProcess', qc: 'QC' }, new Set(['qc']));

test('takes the screen fields: text, checked values, grid rows', () => {
  const { value, errors } = check({ record: { name: 'Box', uomCode: null, processes: ['1', '2'], shiftBreaks: [{ Name: 'Tea', StartTime: '10:30' }] }, index: 2 });
  assert.equal(errors, null);
  assert.deepEqual(value.record, { name: 'Box', uomCode: '', processes: ['1', '2'], shiftBreaks: [{ Name: 'Tea', StartTime: '10:30' }] });
  assert.deepEqual([value.index, value.viewState, value.printer], [2, {}, '']);
});

test('refuses unknown fields, nested values, bad index / viewState', () => {
  const { errors } = check({ record: { colour: 'x', name: { a: 1 }, shiftBreaks: [{ a: { b: 1 } }] }, index: 1.5, viewState: [] });
  assert.deepEqual(Object.keys(errors).sort(), ['index', 'record.colour', 'record.name', 'record.shiftBreaks', 'viewState']);
  assert.ok(check({ record: { name: 'x'.repeat(20001) } }).errors['record.name']);
  assert.ok(check({ record: 'x' }).errors.record);
});

test("a nested field (QC panel, footer, file) keeps the screen's structure", () => {
  const qc = { rows: [{ LineCode: '1', Result: { pass: true } }], index: 0 };
  assert.deepEqual(check({ record: { qc } }).value.record.qc, qc);
});
