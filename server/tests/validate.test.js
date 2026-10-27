// Domain API input checks (shared/utils/validate.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, rules } from '../src/shared/validate.js';

const schema = { material: rules.code(), dept: rules.code({ required: true }), qty: rules.number({ required: true, min: 0 }), on: rules.date({ required: true }), remark: rules.text({ max: 5 }) };

test('clean input passes as strings', () => {
  const r = validate({ material: 22600118, dept: '1220001', qty: '2.5', on: '2026-10-25', remark: 'ok' }, schema);
  assert.equal(r.errors, null);
  assert.deepEqual(r.value, { material: '22600118', dept: '1220001', qty: '2.5', on: '2026-10-25', remark: 'ok' });
});

test('each problem named per field', () => {
  const r = validate({ material: "1'; drop", dept: '', qty: 'x', on: '2026-02-30', remark: 'too long' }, schema);
  assert.deepEqual(Object.keys(r.errors).sort(), ['dept', 'material', 'on', 'qty', 'remark']);
  assert.match(r.errors.material, /digits only/);
  assert.match(r.errors.dept, /required/);
  assert.match(r.errors.on, /date/);
  assert.equal(validate({ dept: '1', qty: '-1', on: '2026-01-01' }, schema).errors.qty, 'qty must be at least 0');
  assert.equal(validate({ dept: { x: 1 }, qty: '1', on: '2026-01-01' }, schema).errors.dept, 'dept has the wrong type');
});

test('fields not sent: required ones are errors, optional ones are left out', () => {
  const r = validate({ dept: '1', qty: '1', on: '2026-01-01' }, schema);
  assert.equal(r.errors, null);
  assert.deepEqual(r.value, { dept: '1', qty: '1', on: '2026-01-01' });
  assert.match(validate({ qty: '1', on: '2026-01-01' }, schema).errors.dept, /required/);
});
