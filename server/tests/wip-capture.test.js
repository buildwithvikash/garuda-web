// The station WIP Capture keeps on the server: one per opened screen, never taken from a request.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, _forgetAll, applyAnswer, find, inTurn, start, takeChecklist, takeFields, uiOf, viewOf } from '../src/modules/production/wip-capture/wip-capture.station.js';

const first = () => ({
  viewState: { ControlID: '10000' },
  controls: [
    { id: 'BtnWorkStationScan', text: 'Go' },
    { id: 'BtnWorderScan', text: 'Go' },
    { id: 'WorkStationPanel' },
    { id: 'TBWorkStation', parent: 'WorkStationPanel', value: '' },
    { id: 'DDLDepartment', type: 'DropDownList', enabled: false, value: '7', options: [{ value: '7', text: 'A' }, { value: '8', text: 'B' }] },
    { id: 'MainPanel', visible: false },
    { id: 'QCPanel', parent: 'MainPanel' },
    { id: 'TbASsetTag', parent: 'QCPanel', value: 'GEN-1', enabled: false },
    { id: 'DDLQCPrinter', parent: 'QCPanel', type: 'DropDownList', value: '', options: [{ value: '', text: 'Select' }, { value: '5', text: 'Zebra' }] },
    { id: 'TBWQCRemark', parent: 'QCPanel', value: '' },
    { id: 'InspectionCheckList', value: { rows: [{ qcvalue: null }], index: 0, f: { TBValue: { text: '' }, TBBarcode: { text: '', tag: '' }, DDLUom: { value: '' }, DDLList: { value: '' }, DdlQCStatus: { value: '1' }, TBRemark: '', TBImage: '', Image: '' } } },
  ],
});

beforeEach(() => _forgetAll());

test('each opened screen and each user has its own station', () => {
  const a = start(1, first());
  const b = start(1, first());
  assert.notEqual(a.id, b.id);
  applyAnswer(a, { viewState: { 'Tag:TBWorkStation': 'A' } });
  assert.equal(find(1, a.id).viewState['Tag:TBWorkStation'], 'A');
  assert.equal(find(1, b.id).viewState['Tag:TBWorkStation'], undefined);
  assert.equal(find(2, a.id), null); // another user cannot use it
  assert.equal(find(1, 'nope'), null);
});

test('a station older than a shift is gone', () => {
  const t0 = 1_000_000;
  const s = start(1, first(), t0);
  assert.ok(find(1, s.id, t0 + 11 * 3600_000));
  assert.equal(find(1, s.id, t0 + 11 * 3600_000 + 13 * 3600_000), null);
});

test('an answer is laid over the station: lists first, then the item it picks, and its ViewState', () => {
  const s = start(1, first());
  applyAnswer(s, { set: { BtnWorkStationScan: { text: 'Clr' }, MainPanel: { visible: true }, DDLQCPrinter: { options: [{ value: '', text: 'x' }, { value: '9', text: 'Y' }], index: 1 } }, viewState: { I: '30' } });
  assert.equal(viewOf(s).station.locked, true);
  assert.equal(s.values.DDLQCPrinter, '9');
  assert.deepEqual(uiOf(s).DDLQCPrinter.options[1], { value: '9', text: 'Y' });
  assert.equal(viewOf(s).result, 'qc');
  applyAnswer(s, { set: {} });
  assert.equal(viewOf(s).result, 'qc'); // an answer without ViewState keeps it
});

test('only boxes shown open take what a request sends', () => {
  const s = start(1, first());
  // a hidden panel's box
  takeFields(s, ['remark'], { remark: 'x' });
  assert.equal(s.values.TBWQCRemark, '');
  applyAnswer(s, { set: { MainPanel: { visible: true } } });
  takeFields(s, ['remark'], { remark: 'x' });
  assert.equal(s.values.TBWQCRemark, 'x');
  // a generated tag, a fixed department
  takeFields(s, ['assetTag', 'department'], { assetTag: 'FORGED', department: '8' });
  assert.equal(s.values.TbASsetTag, 'GEN-1');
  assert.equal(s.values.DDLDepartment, '7');
  // a printer that is not in the list, then one that is
  takeFields(s, ['printer'], { printer: '77' });
  assert.equal(s.values.DDLQCPrinter, '');
  takeFields(s, ['printer'], { printer: '5' });
  assert.equal(s.values.DDLQCPrinter, '5');
  // not text; not a box of this action
  takeFields(s, ['remark'], { remark: { a: 1 }, station: 'FORGED' });
  assert.equal(s.values.TBWQCRemark, 'x');
  assert.equal(s.values.TBWorkStation, '');
});

test('a scan or a clear only applies in the state the screen offers it', () => {
  const s = start(1, first());
  assert.equal(ACTIONS.clearStation.when(s), false);
  assert.equal(ACTIONS.station.when(s), true);
  applyAnswer(s, { set: { BtnWorkStationScan: { text: 'Clr' } } });
  assert.equal(ACTIONS.clearStation.when(s), true);
  assert.equal(ACTIONS.station.when(s), false);
  assert.equal(ACTIONS.saveQC.when(s), false); // no inspection open
  assert.equal(ACTIONS.component.when(s), false);
});

test("the checklist's rows and tool stay the server's", () => {
  const s = start(1, first());
  takeChecklist(s, { rows: [{ qcvalue: 'FORGED' }], index: 9, TBRemark: 'ok', TBValue: { text: '5' }, TBBarcode: { text: 'T1', tag: '123' }, DdlQCStatus: { value: '0' } });
  const c = s.values.InspectionCheckList;
  assert.deepEqual(c.rows, [{ qcvalue: null }]);
  assert.equal(c.index, 0);
  assert.equal(c.f.TBRemark, 'ok');
  assert.equal(c.f.TBValue.text, '5');
  assert.equal(c.f.DdlQCStatus.value, '0');
  assert.deepEqual(c.f.TBBarcode, { text: 'T1', tag: '' });
});

test('calls on a station run one at a time, in order, and a failure does not stop the next', async () => {
  const s = start(1, first());
  const seen = [];
  const slow = inTurn(s, async () => {
    await new Promise((r) => setTimeout(r, 20));
    seen.push('first');
    throw new Error('refused');
  });
  const next = inTurn(s, async () => seen.push('second'));
  await assert.rejects(slow);
  await next;
  assert.deepEqual(seen, ['first', 'second']);
});

test("the guide as the screen draws it: files, instructions, the document, each only when the page shows it", () => {
  const f = first();
  f.controls.push({ id: 'RightTopPanel', visible: false }, { id: 'LBGuideFiles', parent: 'RightTopPanel' }, { id: 'RightPanel', parent: 'RightTopPanel' }, { id: 'RightTop', parent: 'RightPanel' }, { id: 'GuideFileDisplayPanel', parent: 'RightTop' }, { id: 'RightBottom', parent: 'RightPanel' }, { id: 'GVInstruction', type: 'GridView', parent: 'RightBottom', columns: [], rows: [] });
  const s = start(1, f);
  assert.equal(viewOf(s).guide, null);
  applyAnswer(s, { set: { RightTopPanel: { visible: true }, GVInstruction: { rows: [{ Step: 'Fit it' }] }, LBGuideFiles: { options: [{ value: '', text: 'Select' }, { value: 'a.pdf', text: 'Drawing' }], index: 1 }, GuideFileDisplayPanel: { guide: { kind: 'pdf', url: '/a.pdf' } }, RightBottom: { visible: true }, RightTop: { visible: false } } });
  let g = viewOf(s).guide;
  assert.equal(g.file, 'a.pdf');
  assert.equal(g.files.length, 2);
  assert.deepEqual(g.instructions.rows, [{ Step: 'Fit it' }]);
  assert.equal(g.canShowDocument, true);
  assert.equal(g.document, null); // its panel is hidden until Show document
  applyAnswer(s, { set: { RightTop: { visible: true }, RightBottom: { visible: false }, LBGuideFiles: { value: '' } } });
  g = viewOf(s).guide;
  assert.deepEqual(g.document, { kind: 'pdf', url: '/a.pdf' });
  assert.equal(g.instructions, null);
});
