// The station state WIP Capture keeps on the server, one copy per page load (tab), never taken from a request.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SERVER_STATE, tabOf, uiOf, applyAnswer, start, stateOf, save, _forgetAll } from '../src/modules/forms/screenSessions.js';

const WIP = '/production/wipcaptureform';
const first = {
  viewState: { ControlID: '10000' },
  controls: [
    { id: 'BtnWorkStationScan', text: 'Go' },
    { id: 'MainPanel', visible: false },
    { id: 'DDLPrinter', page: true, options: [{ value: '5', text: 'Zebra' }] },
    { id: 'TBJobCoard', enabled: false },
  ],
};

beforeEach(() => _forgetAll());

test('WIP Capture is a screen whose state the server keeps', () => {
  assert.ok(SERVER_STATE.has(WIP));
});

test('a tab id is a plain random token, nothing else', () => {
  assert.equal(tabOf('3f2a9c1e-77aa-4b1e-9c0d-1234567890ab'), '3f2a9c1e-77aa-4b1e-9c0d-1234567890ab');
  for (const bad of [undefined, '', 'short', 'has space here', 'x'.repeat(101), { a: 1 }, "1'; drop"]) assert.equal(tabOf(bad), null);
});

test('the first state is the page as the browser showed it (the client uiOf)', () => {
  assert.deepEqual(uiOf(first.controls), {
    BtnWorkStationScan: { visible: true, enabled: true, text: 'Go' },
    MainPanel: { visible: false, enabled: true, text: '' },
    DDLPrinter: { visible: true, enabled: true, text: '', options: [{ value: '5', text: 'Zebra' }] },
    TBJobCoard: { visible: true, enabled: false, text: '' },
  });
});

test("an answer is laid over the kept page: its changes and its ViewState", () => {
  const s = start(1, WIP, 'tab-aaaaaaaa', first);
  const r = { set: { BtnWorkStationScan: { text: 'Clr' }, MainPanel: { visible: true }, DDlProdOrder: { options: [{ value: '9', text: 'PS 9' }], value: '9' } }, viewState: { ControlID: '10000', 'Tag:TBWorkStation': '1220001' } };
  const n = applyAnswer(s, r);
  assert.equal(n.ui.BtnWorkStationScan.text, 'Clr');
  assert.equal(n.ui.MainPanel.visible, true);
  assert.deepEqual(n.ui.DDlProdOrder.options, [{ value: '9', text: 'PS 9' }]);
  assert.equal(n.viewState['Tag:TBWorkStation'], '1220001');
  assert.equal(applyAnswer(n, { set: {} }).viewState['Tag:TBWorkStation'], '1220001'); // an answer without ViewState keeps it
});

test('each tab and each user has its own state', () => {
  start(1, WIP, 'tab-aaaaaaaa', first);
  start(1, WIP, 'tab-bbbbbbbb', first);
  save(1, WIP, 'tab-aaaaaaaa', applyAnswer(stateOf(1, WIP, 'tab-aaaaaaaa'), { viewState: { 'Tag:TBWorkStation': 'A' } }));
  assert.equal(stateOf(1, WIP, 'tab-aaaaaaaa').viewState['Tag:TBWorkStation'], 'A');
  assert.equal(stateOf(1, WIP, 'tab-bbbbbbbb').viewState['Tag:TBWorkStation'], undefined);
  assert.equal(stateOf(2, WIP, 'tab-aaaaaaaa'), null); // another user with the same tab id has nothing
});

test('a page load starts the tab afresh', () => {
  save(1, WIP, 'tab-aaaaaaaa', applyAnswer(start(1, WIP, 'tab-aaaaaaaa', first), { viewState: { 'Tag:TBWorkStation': 'A' } }));
  start(1, WIP, 'tab-aaaaaaaa', first);
  assert.equal(stateOf(1, WIP, 'tab-aaaaaaaa').viewState['Tag:TBWorkStation'], undefined);
});

test('a state older than a shift is gone', () => {
  const t0 = 1_000_000;
  start(1, WIP, 'tab-aaaaaaaa', first, t0);
  assert.ok(stateOf(1, WIP, 'tab-aaaaaaaa', t0 + 11 * 3600_000));
  assert.equal(stateOf(1, WIP, 'tab-aaaaaaaa', t0 + 13 * 3600_000), null);
});
