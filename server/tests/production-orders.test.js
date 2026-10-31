// Production order input: the fields the screen locks are never taken from a request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCKED, unlocked, validateOrder } from '../src/modules/production-orders/production-orders.validation.js';

test('locked fields are dropped, the rest kept', () => {
  const sent = { prodNo: '9', alias: 'X', businessUnit: '2', orderDate: '2020-01-01', qty: '5', material: '22600118' };
  assert.deepEqual(unlocked(sent), { qty: '5', material: '22600118' });
  for (const f of LOCKED) assert.ok(!(f in unlocked(sent)));
});

test('nothing sent: nothing kept', () => {
  assert.deepEqual(unlocked(undefined), {});
});

test('an order still needs its required fields', () => {
  const r = validateOrder({ orderDate: '2026-10-31', businessUnit: '1', status: '1', department: '', qty: '' });
  assert.deepEqual(Object.keys(r.errors).sort(), ['department', 'qty']);
});
