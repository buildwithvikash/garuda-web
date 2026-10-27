// Errors become responses (shared/AppError.js, middlewares/errorHandler.js, middlewares/validate.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/shared/AppError.js';
import { validate } from '../src/middlewares/validate.js';

// errorHandler / portedErrors log through config/logger.js, which reads .env: load them only when it is there
const handlers = process.env.DB_SERVER ? await import('../src/middlewares/errorHandler.js') : null;
const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const req = { id: 'r1', method: 'GET', originalUrl: '/api/x' };

test('AppError helpers carry status and field errors', () => {
  assert.equal(AppError.notFound('Production order 1').message, 'Production order 1 not found.');
  const e = AppError.unprocessable('Check the highlighted fields.', { qty: 'qty is required' });
  assert.deepEqual([e.statusCode, e.errors], [422, { qty: 'qty is required' }]);
});

test('validate: clean body to req.valid.body, problems to a 422 AppError', () => {
  const check = (b) => (b.qty ? { value: { qty: String(b.qty) }, errors: null } : { value: {}, errors: { qty: 'qty is required' } });
  const r = {};
  let passed;
  validate(check)(Object.assign(r, { body: { qty: 2 } }), null, (e) => (passed = e));
  assert.deepEqual([passed, r.valid.body], [undefined, { qty: '2' }]);
  validate(check)({ body: {} }, null, (e) => (passed = e));
  assert.deepEqual([passed.statusCode, passed.errors], [422, { qty: 'qty is required' }]);
});

test("errorHandler answers AppErrors as they are; portedErrors makes the old code's errors 400", { skip: !handlers }, () => {
  const a = res();
  handlers.errorHandler(AppError.unprocessable('Check the highlighted fields.', { qty: 'x' }), req, a);
  assert.deepEqual([a.code, a.body], [422, { message: 'Check the highlighted fields.', errors: { qty: 'x' } }]);
  let next;
  handlers.portedErrors(new Error('Invalid Work Center'), req, null, (e) => (next = e));
  assert.deepEqual([next.statusCode, next.message], [400, 'Invalid Work Center']);
  const b = res();
  handlers.errorHandler(new Error('boom'), req, b);
  assert.equal(b.code, 500);
  assert.match(b.body.message, /reference r1/);
});
