// Material Barcode reprint (modules/masters/material-barcode-reprint.js): which label a barcode is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf } from '../src/modules/masters/material-barcode-reprint.js';

test('the label kind: FG by its stage label at an FG printing stage, else assembly (S…) or foaming (F…, L…)', () => {
  // most FG labels: barcode row at component scanning (stage 1), stage label at FG LABEL PRINTING (stage 6)
  assert.equal(kindOf({ stage: 1, labelProcess: 12212, labelStage: 6, serial: '42214260201910' }), 'FG');
  assert.equal(kindOf({ stage: 6, labelProcess: 12212, labelStage: 6, serial: '42734261000346' }), 'FG');
  assert.equal(kindOf({ stage: 6, labelProcess: null, labelStage: null, serial: '42734261000346' }), 'FG'); // no stage label
  assert.equal(kindOf({ stage: 1, labelProcess: 12202, labelStage: 8, serial: 'S42734261000353' }), 'Assembly');
  assert.equal(kindOf({ stage: 1, labelProcess: 12201, labelStage: 1, serial: 'F42734261000732' }), 'Foaming');
  assert.equal(kindOf({ stage: 8, labelProcess: 12202, labelStage: 8, serial: 'F42166250100001' }), 'Foaming');
  assert.equal(kindOf({ stage: 1, labelProcess: 12306, labelStage: 1, serial: 'L44401231215406' }), 'Foaming'); // door foaming
  assert.equal(kindOf({ stage: 1, labelProcess: null, labelStage: null, serial: '42670260800890' }), null); // a component scan
  assert.equal(kindOf({ stage: 1, labelProcess: 12202, labelStage: 8, serial: '42166250100001' }), null); // digits, not at FG printing
});

test('a bulk check or print refuses a list it cannot take, before the database', async () => {
  const { findLabels, reprintMany, MAX_CHECK, MAX_PRINT } = await import('../src/modules/masters/material-barcode-reprint.js');
  await assert.rejects(findLabels('42734261000346', '1'), /as a list/);
  await assert.rejects(findLabels(['', '  '], '1'), /at least one serial/);
  await assert.rejects(findLabels(Array.from({ length: MAX_CHECK + 1 }, (_, i) => `S${i}`), '1'), /at most 500/);
  await assert.rejects(findLabels(['x'.repeat(101)], '1'), /longer than 100/);
  const ctx = { businessUnit: '1', userId: '1', userCode: '1' };
  await assert.rejects(reprintMany({ barcodeNos: [], printer: '1', remark: 'r' }, ctx), /as a list/);
  await assert.rejects(reprintMany({ barcodeNos: Array(MAX_PRINT + 1).fill('1'), printer: '1', remark: 'r' }, ctx), /at most 50/);
  await assert.rejects(reprintMany({ barcodeNos: ['12a'], printer: '1', remark: 'r' }, ctx), /not valid/);
});
