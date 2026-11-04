// RM Replacement's rules (modules/production/rm-replacements): what the screen sees, which component can be replaced, the request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseComponent, componentView } from '../src/modules/production/rm-replacements/rm-replacements.service.js';
import { validateReplacement } from '../src/modules/production/rm-replacements/rm-replacements.validation.js';

const raw = { Category: ' Raw Material ', Material: 'MOTOR', Process: 'SCAN', Serial: 'M1 ', PsNo: '9', RowID: '2', ProcessCode: '7', matCode: '5' };
const inProcess = { Category: 'In Process', Material: 'CABINET', Process: 'FOAM', Serial: 'C1', PsNo: '9', RowID: '3', ProcessCode: '8', matCode: '6' };

test('the screen never sees a job card, row or process code', () => {
  assert.deepEqual(componentView(raw), { category: ' Raw Material ', material: 'MOTOR', process: 'SCAN', serial: 'M1 ', replaceable: true });
  assert.equal(componentView(inProcess).replaceable, false);
  assert.equal(componentView({ ...raw, Category: null }).replaceable, false);
});

test('only a raw material of this unit can be replaced', () => {
  assert.equal(chooseComponent([inProcess, raw], 'M1'), raw);
  assert.throws(() => chooseComponent([raw], 'OTHER'), /Serial No not found/);
  assert.throws(() => chooseComponent([inProcess], 'C1'), /Only raw material/);
});

test('a replacement needs its three serials, trimmed; nothing else is taken', () => {
  const ok = validateReplacement({ unit: ' U1 ', existing: 'M1', replacement: 'M2', PsNo: '1', RowID: '1' });
  assert.deepEqual(ok, { value: { unit: 'U1', existing: 'M1', replacement: 'M2' } });
  assert.deepEqual(Object.keys(validateReplacement({ unit: 'U1', existing: ' ' }).errors).sort(), ['existing', 'replacement']);
  assert.ok(validateReplacement({ unit: 'U'.repeat(101), existing: 'M1', replacement: 'M2' }).errors.unit);
  assert.ok(validateReplacement({ unit: { $ne: 1 }, existing: 'M1', replacement: 'M2' }).errors.unit);
  assert.equal(Object.keys(validateReplacement(undefined).errors).length, 3);
});
