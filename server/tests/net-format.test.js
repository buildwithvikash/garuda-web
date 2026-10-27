// .NET Framework number formatting the dashboards depend on (values confirmed by the UAT parity runs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netNum, netFixed1, roundHalfEven, netDouble } from '../src/shared/net.js';

test('double.ToString()', () => {
  assert.equal(netNum(450), '450');
  assert.equal(netNum(-118), '-118');
  assert.equal(netNum(100 / 3), '33.3333333333333'); // 15 significant digits
  assert.equal(netNum(0 / 0), 'NaN');
  assert.equal(netNum(1 / 0), '∞'); // en-IN, confirmed against the original PPM Rework report
});

test('ToString("0.0")', () => {
  assert.equal(netFixed1((332 / 450) * 100), '73.8');
  assert.equal(netFixed1(0.25), '0.3'); // midpoint away from zero
  assert.equal(netFixed1(-0.04), '0.0'); // no "-0.0" on .NET Framework
  assert.equal(netFixed1(0 / 0), 'NaN');
});

test('Math.Round banker\'s rounding (asking rate)', () => {
  assert.equal(roundHalfEven(2.5), 2);
  assert.equal(roundHalfEven(3.5), 4);
  assert.equal(roundHalfEven(-2.5), -2);
  assert.equal(roundHalfEven(7.4), 7);
});

test('ParseDouble', () => {
  assert.equal(netDouble(null), 0);
  assert.equal(netDouble(''), 0);
  assert.equal(netDouble('12'), 12);
  assert.equal(netDouble('abc'), 0);
});
