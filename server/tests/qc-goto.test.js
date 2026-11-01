// The checklist's "goto" event (WIP Capture's checklist table): a clicked row becomes the shown item.
import test from 'node:test';
import assert from 'node:assert/strict';
// qc.js reaches the database module, which wants its settings (none is used here: yes/no items need no query)
Object.assign(process.env, { DB_SERVER: process.env.DB_SERVER ?? 'none', DB_NAME: process.env.DB_NAME ?? 'none', DB_USER: process.env.DB_USER ?? 'none', DB_PASSWORD: process.env.DB_PASSWORD ?? 'none', PASSWORD_AES_KEY: process.env.PASSWORD_AES_KEY ?? 'test-key', SESSION_SECRET: process.env.SESSION_SECRET ?? 's' });
const { QC_EVENTS } = await import('../src/modules/forms/qc.js');

const state = () => ({
  rows: [
    { LineCode: '1', Name: 'JOINT-1', Description: 'SUCTION', InputType: 'bit', qcvalue: '1', remark: null, qcstatus: '1' },
    { LineCode: '2', Name: 'JOINT-6', Description: 'DISCHARGE', InputType: 'bit', qcvalue: '0', remark: 'leak', qcstatus: '0' },
    { LineCode: '3', Name: 'JOINT-7', Description: 'DRIER', InputType: 'bit', qcvalue: null, remark: null, qcstatus: null },
  ],
  index: 0,
  f: { DdlQCStatus: { visible: true, value: '1' }, LblMaxMin: { visible: false }, GuideImage: { visible: false }, TBValue: { visible: false }, DDLUom: { visible: false }, DDLList: { visible: false }, BtnPrevious: {}, BtnNext: {} },
});

test('goto shows the clicked item, with its remark and value, and no error', async () => {
  const s = state();
  const r = await QC_EVENTS.goto(s, '', 1);
  assert.deepEqual(r, {});
  assert.equal(s.index, 1);
  assert.equal(s.f.LblDescription, 'DISCHARGE');
  assert.equal(s.f.TBRemark, 'leak');
  assert.equal(s.f.DDLList.value, '0');
  assert.deepEqual(s.f.BtnPrevious, { enabled: true, text: '1 <<  ' });
  assert.deepEqual(s.f.BtnNext, { enabled: true, text: '  >> 1' });
});

test('goto the last and the first items sets the arrows like Next / Previous', async () => {
  const s = state();
  await QC_EVENTS.goto(s, '', 2);
  assert.deepEqual(s.f.BtnNext, { enabled: false, text: '  >> ' });
  assert.equal(s.rows[2].qcvalue, '1'); // a yes/no item with no value counts as passed
  await QC_EVENTS.goto(s, '', 0);
  assert.deepEqual(s.f.BtnPrevious, { enabled: false, text: ' <<  ' });
});

test('goto a row that is not there changes nothing', async () => {
  const s = state();
  assert.deepEqual(await QC_EVENTS.goto(s, '', 9), {});
  assert.equal(s.index, 0);
});
