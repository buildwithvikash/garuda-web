// A scanned asset / green tag against its Serial Generation Logic (modules/production/tag-check.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagMismatch, tagMode } from '../src/modules/production/tag-check.js';

const fixed = (Value, Seperator = '') => ({ VariantCode: 9, Value, Seperator });
const serial = (Length, StartingNo = 0, EndingNo = 0, Seperator = '') => ({ VariantCode: 10, Length, StartingNo, EndingNo, Seperator });
const date = (VariantCode, Format, Seperator = '') => ({ VariantCode, Format, Seperator });

const WT = [fixed('MM-IC-WT-'), serial(5, 50000, 59999)];

test('fixed text and a number in its range', () => {
  assert.equal(tagMismatch('MM-IC-WT-52770', WT), null);
  assert.match(tagMismatch('MM-IC-XX-52770', WT), /expected "MM-IC-WT-" at character 1/);
  assert.match(tagMismatch('MM-IC-WT-5277', WT), /5-digit number at character 10/);
  assert.match(tagMismatch('MM-IC-WT-60000', WT), /above the logic's end 59999/);
  assert.match(tagMismatch('MM-IC-WT-49999', WT), /below the logic's start 50000/);
  assert.match(tagMismatch('MM-IC-WT-527701', WT), /"1" is left over/);
  assert.match(tagMismatch('', WT), /expected/);
});

test('dates by format only, with separators', () => {
  const lines = [fixed('42734'), serial(5, 0, 0, '/'), date(2, 'ALPHA-A', '/'), date(1, 'YY')];
  assert.equal(tagMismatch('4273400346/J/26', lines), null);
  assert.equal(tagMismatch('4273400346/A/19', lines), null, 'another month and year still pass');
  assert.match(tagMismatch('4273400346/M/26', lines), /month letter from A to L/);
  assert.match(tagMismatch('4273400346/J/XX', lines), /2-digit year/);
  assert.match(tagMismatch('4273400346-J/26', lines), /expected "\/"/);
  assert.equal(tagMismatch('2612', [date(1, 'yy'), date(2, 'MM')]), null);
  assert.match(tagMismatch('2613', [date(1, 'YY'), date(2, 'MM')]), /month from 01 to 12/);
  assert.equal(tagMismatch('202644', [date(1, 'YYYY'), date(4, 'WW')]), null);
  assert.match(tagMismatch('202654', [date(1, 'YYYY'), date(4, 'WW')]), /week from 01 to 53/);
  assert.match(tagMismatch('26', [date(1, '')]), /no format/);
});

test('the model, a space separator, a Day line adding nothing, a number of any length', () => {
  const lines = [{ VariantCode: 11, Seperator: 'spc' }, { VariantCode: 3, Format: 'DD' }, serial(0)];
  assert.equal(tagMismatch('AB7 12345', lines, 'AB7'), null);
  assert.match(tagMismatch('ZZ7 12345', lines, 'AB7'), /"AB7"/);
  assert.match(tagMismatch('AB7 ', lines, 'AB7'), /a number/);
  assert.match(tagMismatch('X', []), /no parts/);
});

test('how a tag is set', () => {
  assert.equal(tagMode(0, 1), 'none');
  assert.equal(tagMode(null, null), 'none');
  assert.equal(tagMode(124000087, null), 'generate');
  assert.equal(tagMode(124000087, 0), 'generate');
  assert.equal(tagMode(124000087, 1), 'check');
});
