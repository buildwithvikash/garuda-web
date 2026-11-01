// The Routing screen's "Images on WIP Capture": a request may only set one known image kind (or none) per stage of
// that routing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeOf, stagesOf } from '../src/modules/masters/routing-stage-images.rules.js';

const codes = [12202, 12304, 12212];

test('a routing code is a positive whole number', () => {
  assert.equal(routeOf('15'), 15);
  for (const bad of ['0', '-1', 'abc', '1.5', "1; drop"]) assert.throws(() => routeOf(bad), /routing code/);
});

test('each stage of the routing: one kind, or none', () => {
  assert.deepEqual(
    stagesOf({ stages: [{ processCode: 12202, imageKind: 'artwork' }, { processCode: '12304', imageKind: '' }, { processCode: 12212, imageKind: null }] }, codes),
    [{ processCode: 12202, imageKind: 'artwork' }, { processCode: 12304, imageKind: null }, { processCode: 12212, imageKind: null }],
  );
});

test('refused: a stage of another routing, a stage twice, an unknown kind, no list', () => {
  assert.throws(() => stagesOf({ stages: [{ processCode: 999, imageKind: 'artwork' }] }, codes), /not a stage of this routing/);
  assert.throws(() => stagesOf({ stages: [{ processCode: 12202, imageKind: 'basket' }, { processCode: 12202, imageKind: null }] }, codes), /twice/);
  assert.throws(() => stagesOf({ stages: [{ processCode: 12202, imageKind: 'logo' }] }, codes), /must be one of/);
  assert.throws(() => stagesOf({}, codes), /as a list/);
});
