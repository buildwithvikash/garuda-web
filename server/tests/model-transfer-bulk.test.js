// Model To Model Transfer by FG serials (modules/production/model-transfer-bulk.js): lists it refuses, before the database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CHECK, MAX_MOVE, checkTransfer, transferMany } from '../src/modules/production/model-transfer-bulk.js';

test('a check refuses what is not a usable list', async () => {
  await assert.rejects(checkTransfer('42214260201910'), /as a list/);
  await assert.rejects(checkTransfer([' ', '']), /at least one FG serial/);
  await assert.rejects(checkTransfer(Array.from({ length: MAX_CHECK + 1 }, (_, i) => `4${i}`)), /at most 500/);
  await assert.rejects(checkTransfer(['4'.repeat(101)]), /longer than 100/);
});

test('a transfer needs two different materials, a short list of barcode numbers and a printer', async () => {
  const ctx = { userCode: '1', userId: '1' };
  const ok = { source: '12500122', destination: '12500123', barcodeNos: ['1260556883'], printer: '7' };
  await assert.rejects(transferMany({ ...ok, destination: '' }, ctx), /source and the destination/);
  await assert.rejects(transferMany({ ...ok, destination: ok.source }, ctx), /same material/);
  await assert.rejects(transferMany({ ...ok, barcodeNos: [] }, ctx), /as a list/);
  await assert.rejects(transferMany({ ...ok, barcodeNos: Array(MAX_MOVE + 1).fill('1') }, ctx), /at most 50/);
  await assert.rejects(transferMany({ ...ok, barcodeNos: ['12a'] }, ctx), /not valid/);
  await assert.rejects(transferMany({ ...ok, printer: '' }, ctx), /Select a printer/);
});
