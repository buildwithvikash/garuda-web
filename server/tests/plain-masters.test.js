// The setup screens with plain pages (modules/masters/plain-masters.js): their field names and requests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAIN, PLAIN_SERVICES } from '../src/modules/masters/plain-masters.js';
import { MASTERS } from '../src/modules/masters/masters.routes.js';
import { validateBody } from '../src/modules/forms/resource.validation.js';

test('every plain screen is a master, and every field names one of its controls (else the import throws)', () => {
  for (const [n, d] of Object.entries(PLAIN)) assert.equal(MASTERS[n], d.route, n);
  assert.deepEqual(Object.keys(PLAIN_SERVICES).sort(), Object.keys(PLAIN).sort());
});

test('pictures travel as they are; anything not a field of the screen is refused', () => {
  const s = PLAIN_SERVICES['business-units'];
  assert.ok(s.NESTED.has('logo'));
  const check = validateBody(s.FIELDS, s.NESTED);
  assert.deepEqual(check({ record: { name: 'Plant', isVirtual: 'False' } }).value.record, { name: 'Plant', isVirtual: 'False' });
  assert.ok(check({ record: { TextBox2: 'Plant' } }).errors['record.TextBox2']);
  assert.deepEqual(validateBody(PLAIN_SERVICES.users.FIELDS)({ record: { processes: ['12301', '12302'] } }).value.record, { processes: ['12301', '12302'] });
});
