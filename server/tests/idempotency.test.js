// Idempotency-Key: a repeated create answers like the first and runs once; a refused one can be sent again.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { idempotent, _forgetAll } from '../src/middlewares/idempotency.js';

async function server(handler) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => ((req.session = { userCode: req.get('x-user') ?? '1' }), next()));
  app.post('/orders', idempotent, handler);
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  const url = `http://127.0.0.1:${s.address().port}/orders`;
  const post = (key, user = '1') => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': user, ...(key ? { 'Idempotency-Key': key } : {}) }, body: '{}' }).then(async (r) => ({ status: r.status, body: await r.json() }));
  return { post, close: () => s.close() };
}

beforeEach(() => _forgetAll());

test('the same key twice (even at the same time): one create, the same answer', async () => {
  let runs = 0;
  const { post, close } = await server(async (_req, res) => {
    runs += 1;
    await new Promise((r) => setTimeout(r, 50));
    res.status(201).json({ prodNo: String(runs) });
  });
  const [a, b] = await Promise.all([post('k1'), post('k1')]);
  const c = await post('k1');
  close();
  assert.equal(runs, 1);
  for (const r of [a, b, c]) assert.deepEqual(r, { status: 201, body: { prodNo: '1' } });
});

test('no key, another key or another user: runs again', async () => {
  let runs = 0;
  const { post, close } = await server((_req, res) => res.status(201).json({ n: ++runs }));
  await post(null);
  await post(null);
  await post('k1');
  await post('k2');
  await post('k1', '2');
  close();
  assert.equal(runs, 5);
});

test('a refused request is forgotten: the corrected one runs', async () => {
  let runs = 0;
  const { post, close } = await server((_req, res) => (++runs === 1 ? res.status(422).json({ message: 'no' }) : res.status(201).json({ ok: true })));
  assert.equal((await post('k1')).status, 422);
  assert.equal((await post('k1')).status, 201);
  close();
  assert.equal(runs, 2);
});
