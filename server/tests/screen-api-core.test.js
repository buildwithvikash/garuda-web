// The client's translation between the engine's control states and a screen's REST API
// (client/src/lib/screenApiCore.js), which the pages and the --api parity runs share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventOf, listShape, overlay, toPatch, toRecord } from '../../client/src/lib/screenApiCore.js';

const maps = {
  fields: { uomCode: 'PrimaryKey', name: 'TextBox3', breaks: 'GVTransData' },
  names: { PrimaryKey: 'uomCode', TextBox3: 'name', GVTransData: 'breaks', Label1: 'label1', BtnAdd: 'btnAdd' },
  events: { btnAdd: 'BtnAdd' },
  grids: new Set(['GVTransData']),
};

test('values -> record (fields only), control -> event name', () => {
  assert.deepEqual(toRecord({ PrimaryKey: '7', TextBox3: 'Box', Label1: '', GVTransData: [{ A: 1 }] }, maps), { uomCode: '7', name: 'Box', breaks: [{ A: 1 }] });
  assert.equal(eventOf('BtnAdd', maps), 'btnAdd');
  assert.equal(eventOf('Nope', maps), undefined);
});

test('an answer -> control patches (grid rows, items, ui), the rest kept', () => {
  const p = toPatch({ record: { name: 'x', breaks: [{ A: 2 }] }, options: { name: [{ value: '1' }] }, ui: { label1: { text: 'Hi' } }, alert: 'Done', ok: true, key: '9' }, maps);
  assert.deepEqual(p, { ok: true, key: '9', alert: 'Done', set: { TextBox3: { value: 'x', options: [{ value: '1' }] }, GVTransData: { rows: [{ A: 2 }] }, Label1: { text: 'Hi' } } });
});

test('a record laid over the layout: values, items and every control state replaced', () => {
  const layout = { title: 'UOM', controls: [{ id: 'PrimaryKey', value: '0', readOnly: true, visible: true, enabled: true }, { id: 'TextBox3', value: '', visible: false, enabled: true, refilled: true }, { id: 'Label1', text: 'old', visible: true, enabled: true }] };
  const answer = { record: { uomCode: '7', name: 'Box' }, options: {}, ui: { uomCode: { visible: true, enabled: false, readOnly: true }, name: { visible: true, enabled: true, readOnly: false }, label1: { visible: true, enabled: true, readOnly: false, text: 'new' } }, viewState: { a: '1' }, status: '200', statusMessage: 'Cancelled' };
  assert.deepEqual(overlay(layout, answer, maps), {
    title: 'UOM',
    controls: [{ id: 'PrimaryKey', value: '7', readOnly: true, visible: true, enabled: false }, { id: 'TextBox3', value: 'Box', visible: true, enabled: true }, { id: 'Label1', text: 'new', visible: true, enabled: true }],
    viewState: { a: '1' },
    recordStatus: '200',
    statusMessage: 'Cancelled',
  });
  assert.deepEqual(listShape({ columns: ['NAME'], rows: [['Box']], keys: ['7'], total: 1, page: 0, pageSize: 10 }), { columns: [{ name: 'NAME' }], rows: [['Box']], keys: ['7'], count: 1, page: 0, pageSize: 10 });
});
