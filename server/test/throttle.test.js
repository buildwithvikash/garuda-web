// Failed sign-in throttle (lib/throttle.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { throttle } from '../src/lib/throttle.js';

test('blocks after max failures, frees the key as failures age out, success clears', () => {
  let t = 0;
  const th = throttle({ max: 3, windowMs: 1000, now: () => t });
  for (let i = 0; i < 3; i++) {
    assert.equal(th.retryIn('u'), 0);
    th.fail('u');
    t += 100;
  }
  assert.equal(th.retryIn('u'), 700); // the first failure (t=0) leaves the window at 1000; now t=300
  assert.equal(th.retryIn('other'), 0); // keys are separate
  t = 1001;
  assert.equal(th.retryIn('u'), 0); // only 2 failures left in the window
  th.fail('u');
  assert.ok(th.retryIn('u') > 0);
  th.clear('u');
  assert.equal(th.retryIn('u'), 0);
});
