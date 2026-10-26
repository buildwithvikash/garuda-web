// /api/production/orders: read the request, check it, call the orders service, answer. Wired in
// routes/production/orders.routes.js.
import * as orders from '../../services/production/orders.service.js';
import { validateOrder, validateDraft } from '../../validators/production/orders.validator.js';
import { sessionContext } from '../../shared/session/session.js';
import { netString } from '../../shared/utils/net.js';

/** an input problem (400 with the fields), a missing order (404), else what the service raised (400, its message) */
const invalid = (res, errors) => res.status(400).json({ message: 'Check the highlighted fields.', errors });
const missing = (res, prodNo) => res.status(404).json({ message: `Production order ${prodNo} not found` });
const run = (fn) => async (req, res) => {
  try {
    await fn(req, res, sessionContext(req));
  } catch (e) {
    res.status(e.status ?? 400).json({ message: e.message });
  }
};
const prodNoOf = (req) => netString(req.params.prodNo);
const page = (req) => Math.max(0, Number(req.query.page) || 0);
const search = (req) => (req.query.column ? { column: netString(req.query.column), op: netString(req.query.op), value: netString(req.query.value) } : null);

export const list = run(async (req, res, ctx) => res.json(await orders.list(ctx, { page: page(req), search: search(req) })));
export const searchFields = run(async (_req, res, ctx) => res.json(await orders.searchFields(ctx)));
export const columnValues = run(async (req, res, ctx) => res.json(await orders.columnValues(ctx, netString(req.params.column))));
export const blank = run(async (_req, res, ctx) => res.json(await orders.blank(ctx)));

export const get = run(async (req, res, ctx) => {
  if (!/^\d+$/.test(prodNoOf(req))) return void missing(res, prodNoOf(req));
  const r = await orders.get(ctx, prodNoOf(req));
  return r ? res.json(r) : missing(res, prodNoOf(req));
});

export const change = run(async (req, res, ctx) => {
  const { value, errors } = validateDraft(req.body);
  if (errors) return invalid(res, errors);
  res.json(await orders.change(ctx, netString(req.params.field), value));
});

export const addServiceRequest = run(async (req, res, ctx) => {
  const { value, errors } = validateDraft(req.body);
  if (errors) return invalid(res, errors);
  res.json(await orders.addServiceRequest(ctx, value));
});

export const create = run(async (req, res, ctx) => {
  const { value, errors } = validateOrder(req.body);
  if (errors) return invalid(res, errors);
  res.status(201).json(await orders.create(ctx, value));
});

export const save = run(async (req, res, ctx) => {
  if (!/^\d+$/.test(prodNoOf(req))) return void missing(res, prodNoOf(req));
  const { value, errors } = validateOrder(req.body);
  if (errors) return invalid(res, errors);
  const r = await orders.save(ctx, prodNoOf(req), value);
  return r ? res.json(r) : missing(res, prodNoOf(req));
});

export const cancel = run(async (req, res, ctx) => {
  if (!/^\d+$/.test(prodNoOf(req))) return void missing(res, prodNoOf(req));
  const remark = typeof req.body?.remark === 'string' ? req.body.remark.slice(0, 250) : '';
  const r = await orders.cancel(ctx, prodNoOf(req), remark);
  return r ? res.json(r) : missing(res, prodNoOf(req));
});
