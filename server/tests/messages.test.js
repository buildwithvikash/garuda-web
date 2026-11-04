// Operator wording of the original messages (shared/utils/messages.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendly, friendlyBody } from '../src/shared/messages.js';

test('runtime and SQL internals become plain advice', () => {
  // as exceptionAlert / errorMsg leave them: no dots or commas
  assert.match(friendly('There is no row at position 0'), /^Nothing was found/);
  assert.match(friendly('Object reference not set to an instance of an object'), /missing/);
  assert.match(friendly("Invalid column name 'Foo'"), /tell your supervisor/);
  assert.match(friendly('Transaction (Process ID 61) was deadlocked on lock resources'), /busy/);
});

test('shop-floor messages and typos', () => {
  assert.equal(friendly('Invalid Work Center'), 'Station not found. Scan the station barcode again.');
  assert.equal(friendly('Invalid barcode/Not for this Station'), 'This barcode is not known, or it is not for this station.');
  assert.equal(friendly('Printer if Offline'), 'The printer is offline. Check the printer, or choose another one.');
  assert.equal(friendly('Select Departmet'), 'Select Department');
  assert.equal(friendly('Entered Quantiry is more than Pending Quantity '), 'Entered Quantity is more than Pending Quantity ');
});

test('anything else is left as it was', () => {
  assert.equal(friendly('Record Created Successfully'), 'Record Created Successfully');
  assert.equal(friendly('✔'), '✔');
  assert.equal(friendly(''), '');
  assert.equal(friendly(undefined), undefined);
});

test('response bodies: only alert / message / statusMessage, the original kept when unchanged', () => {
  const body = { alert: 'Invalid Work Center', set: { X: { value: 'Invalid Work Center' } } };
  const out = friendlyBody(body, 'test');
  assert.equal(out.alert, 'Station not found. Scan the station barcode again.');
  assert.equal(out.set.X.value, 'Invalid Work Center');
  assert.equal(body.alert, 'Invalid Work Center'); // not mutated
  const same = { ok: true, message: 'Saved' };
  assert.equal(friendlyBody(same, 'test'), same);
  assert.deepEqual(friendlyBody([1], 'test'), [1]);
});

test('Production Assignment: the original texts in plain words, a value kept', () => {
  assert.equal(friendly(' Select A Order'), 'Choose a production order first.');
  assert.equal(friendly('Enter Positive Qty'), 'Enter a quantity above zero.');
  assert.equal(friendly('Quantity Can not be greater Than 12.5'), 'Only 12.5 can still be assigned at this stage.');
  assert.equal(friendly('Assigned Succefully'), 'Job cards printed.');
});

test('the alerts list of a body is reworded too', () => {
  const b = friendlyBody({ message: 'Assigned Succefully', alerts: ['Select a BOM', 'as it was'] }, 'x', () => {});
  assert.deepEqual(b, { message: 'Job cards printed.', alerts: ['This order has no BOM: the job cards were printed without BOM lines.', 'as it was'] });
});

test('WIP Capture: a refused scan names the stage the unit is at', () => {
  assert.equal(friendly('Pending Process- POST-FOAMING QA'), 'Not this stage: this unit is now at POST-FOAMING QA.');
});
