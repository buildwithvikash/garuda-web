// WIP Capture's cabinet card: the label a unit carries, and the graphics / customer fields whatever a model names them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMER, GRAPHICS, labelKind, variantValue } from '../src/modules/production/cabinet-view.js';

test('a foaming serial, an assembly serial, an FG label', () => {
  assert.equal(labelKind('F42122260801958', 2), 'Foaming');
  assert.equal(labelKind('L42122260801958', 8), 'Foaming');
  assert.equal(labelKind('S42741260800510', 2), 'Assembly');
  assert.equal(labelKind('S42741260800510', 6), 'FG');
  assert.equal(labelKind('12345', 1), null);
});

test('graphics and customer found by name, whatever the model calls them', () => {
  const nmn = [{ name: 'NMN_SYSTEM_VARIANT', value: 'D' }, { name: 'NMN_GRAPHICS', value: 'MELT N MELLOW' }, { name: 'NMN_CUSTOMER', value: 'MELT N MELLOW FOODS' }];
  const sus = [{ name: 'SUS Graphic', value: 'AMUL' }, { name: 'Customer Name', value: 'AMUL DAIRY' }];
  assert.equal(variantValue(nmn, GRAPHICS), 'MELT N MELLOW');
  assert.equal(variantValue(nmn, CUSTOMER), 'MELT N MELLOW FOODS');
  assert.equal(variantValue(sus, GRAPHICS), 'AMUL');
  assert.equal(variantValue(sus, CUSTOMER), 'AMUL DAIRY');
  assert.equal(variantValue([{ name: 'BASKET', value: 'x' }], CUSTOMER), '');
});
