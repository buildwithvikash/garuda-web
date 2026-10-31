// Production order input: locked fields never taken from a request, coded values only from the screen's lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCKED, NO_CHANGE_AFTER_CREATE, unlistedChoices, unlocked, validateOrder } from '../src/modules/production-orders/production-orders.validation.js';

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

test('a coded value the screen does not offer is refused', () => {
  const allowed = { material: [{ value: '500' }, { value: '501' }], bom: [{ value: '7' }], status: [{ value: '1' }] };
  const was = { material: '', bom: '', status: '1' };
  assert.deepEqual(unlistedChoices({ material: '500', bom: '7', status: '1' }, was, allowed), {});
  const e = unlistedChoices({ material: '999', bom: '8', status: '1' }, was, allowed);
  assert.deepEqual(Object.keys(e).sort(), ['bom', 'material']);
});

test('empty, not sent, or the value the order already has: allowed', () => {
  const allowed = { material: [{ value: '500' }], bom: [] };
  assert.deepEqual(unlistedChoices({ material: '' }, { material: '' }, allowed), {});
  assert.deepEqual(unlistedChoices({ bom: '3' }, { bom: '3' }, allowed), {}); // an old BOM no longer listed
});

test('the rule has its message', () => {
  assert.match(NO_CHANGE_AFTER_CREATE, /cannot be changed/);
});
