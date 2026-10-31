// WIP Capture: a refused scan says where the unit is, and why this station cannot take it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingText } from '../src/modules/production/wip-words.js';

const route = [
  { code: '12202', name: 'QC-FOAMING', status: 2 },
  { code: '12304', name: 'POST-FOAMING QA', status: 1 },
  { code: '12212', name: 'FG LABEL PRINTING', status: 0 },
];

test('this stage already done: says so, and where the unit is now', () => {
  assert.deepEqual(pendingText({ code: '12202', name: 'QC-FOAMING' }, route), { title: 'Already completed', text: 'QC-FOAMING is already complete for this unit. It is now at: POST-FOAMING QA.' });
});

test('a later stage: not reached yet', () => {
  assert.deepEqual(pendingText({ code: '12212', name: 'FG LABEL PRINTING' }, route), { title: 'Not at this stage yet', text: 'This unit has not reached FG LABEL PRINTING yet. It is now at: POST-FOAMING QA.' });
});

test('a stage not on the route', () => {
  assert.equal(pendingText({ code: '99', name: 'GAS CHARGING' }, route).title, "Not on this unit's route");
});

test('every stage done', () => {
  const done = route.map((r) => ({ ...r, status: 2 }));
  assert.equal(pendingText({ code: '12202', name: 'QC-FOAMING' }, done).text, 'QC-FOAMING is already complete for this unit. All its stages are complete.');
});
