// ReportControl query composition (checked against the original controls by scripts/parity/reports-parity.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, { DB_SERVER: 'x', DB_NAME: 'x', DB_USER: 'x', DB_PASSWORD: 'x', PASSWORD_AES_KEY: 'k', SESSION_SECRET: 's' });
const { compose, composeSearch } = await import('../src/modules/reports/engine.js');

const spec = (variant, tag) => ({ variant, tag: tag.split('|') });
const inputs = { bu: '12201', department: '1230001', filter: '', from: '2024-04-01', to: '2024-04-30' };

test('date variant: BU condition, department, Cast(date) range, GROUP BY', () => {
  const q = compose(spec('date', 'select * from GRN gh|Where gh.BusinessUnit=<BU>|gh.GRNDate|gh.Department|group by x'), inputs);
  assert.equal(q.text, 'select * from GRN gh Where gh.BusinessUnit=@bu and gh.Department=@dept and Cast(gh.GRNDate as date)  between @from and @to group by x');
  assert.deepEqual(q.params, { bu: '12201', dept: '1230001', from: '2024-04-01', to: '2024-04-30' });
});

test('no WHERE yet: the first condition uses "where" with the original spacing', () => {
  const q = compose(spec('date', 'select * from T||d|'), { ...inputs, department: '' });
  assert.equal(q.text, 'select * from T  where Cast(d as date)  between @from and @to ');
});

test('time variant formats dd-MMM-yyyy HH:mm:ss and appends ORDER BY (not for search)', () => {
  const s = spec('time', 'select * from T||d|||order by d');
  const q = compose(s, { ...inputs, department: '', from: '2024-04-23T08:00:00', to: '2024-04-23T18:00:00' });
  assert.equal(q.text, 'select * from T  where d between @from and @to   order by d');
  assert.deepEqual([q.params.from, q.params.to], ['23-Apr-2024 08:00:00', '23-Apr-2024 18:00:00']);
  assert.ok(!compose(s, { ...inputs, department: '', from: '2024-04-23T08:00', to: '2024-04-23T18:00' }, { search: true }).text.includes('order by'));
});

test('adv variant: custom filter field, raw range, search cuts GROUP BY at order by', () => {
  const s = spec('adv', 'select * from T where 1=1||d|qn.ID~select ID,Type from Q|group by a order by b|Qty');
  const q = compose(s, { ...inputs, filter: '3', from: '2024-04-23T08:00:00', to: '2024-04-23T18:00:00' });
  assert.equal(q.text, 'select * from T where 1=1 and qn.ID=@filter and d between @from and @to group by a order by b');
  assert.equal(compose(s, { ...inputs, filter: '' }, { search: true }).text.endsWith(' group by a '), true);
});

test('short Tag fails like the original Split(...)[3]', () => {
  assert.throws(() => compose(spec('adv', 'select 1'), inputs), /outside the bounds/);
});

test('search: whitelisted column/operator, value parameterized', () => {
  const cols = [{ name: 'Model', type: 'string' }, { name: 'Qty', type: 'integer' }];
  const s = spec('date', 'select * from T||||');
  const q = composeSearch(s, inputs, cols, { column: 'Model', op: 'like', value: "x' or 1=1 --" });
  assert.match(q.text, /where \[Model\] like @v$/);
  assert.equal(q.params.v, "%x' or 1=1 --%");
  assert.throws(() => composeSearch(s, inputs, cols, { column: 'Nope', op: '=', value: '1' }), /Unknown column/);
  assert.throws(() => composeSearch(s, inputs, cols, { column: 'Qty', op: 'like', value: '1' }), /Unknown operator/);
});
