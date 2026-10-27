// /api/production/orders: production orders (PRODHeader + its service-request lines).
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../middlewares/auth.js';
import { portedErrors } from '../../middlewares/errorHandler.js';
import { operatorMessages } from '../../middlewares/operatorMessages.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../shared/AppError.js';
import { created, ok } from '../../shared/http.js';
import { netString } from '../../shared/net.js';
import { sessionContext as ctx } from '../auth/context.js';
import * as orders from './production-orders.service.js';
import { validateDraft, validateOrder } from './production-orders.validation.js';

/** the order number in the path; not a number: no such order */
const prodNoOf = (req) => {
  const p = netString(req.params.prodNo);
  if (!/^\d+$/.test(p)) throw AppError.notFound(`Production order ${p}`);
  return p;
};
const found = (r, prodNo) => {
  if (!r) throw AppError.notFound(`Production order ${prodNo}`);
  return r;
};
const page = (req) => Math.max(0, Number(req.query.page) || 0);
const search = (req) => (req.query.column ? { column: netString(req.query.column), op: netString(req.query.op), value: netString(req.query.value) } : null);

const router = Router();
router.use(requireAuth, authorizeScreen(orders.SCREEN), operatorMessages);

router.get('/', async (req, res) => ok(res, await orders.list(ctx(req), { page: page(req), search: search(req) }))); // ?page=&column=&op=&value=
router.get('/search-fields', async (req, res) => ok(res, await orders.searchFields(ctx(req))));
router.get('/search-fields/:column/values', async (req, res) => ok(res, await orders.columnValues(ctx(req), netString(req.params.column))));
// Declared before /:prodNo so these words are not read as order numbers.
router.get('/new', async (req, res) => ok(res, await orders.blank(ctx(req)))); // a blank order with its options
router.post('/changes/:field', validate(validateDraft), async (req, res) => {
  ok(res, await orders.change(ctx(req), netString(req.params.field), req.valid.body)); // material | orderType | salesOrder chosen
});
router.post('/service-requests', validate(validateDraft), async (req, res) => ok(res, await orders.addServiceRequest(ctx(req), req.valid.body)));

router.get('/:prodNo', async (req, res) => {
  const prodNo = prodNoOf(req);
  ok(res, found(await orders.get(ctx(req), prodNo), prodNo));
});
router.post('/', validate(validateOrder), async (req, res) => created(res, await orders.create(ctx(req), req.valid.body)));
router.put('/:prodNo', validate(validateOrder), async (req, res) => {
  const prodNo = prodNoOf(req);
  ok(res, found(await orders.save(ctx(req), prodNo, req.valid.body), prodNo));
});
router.delete('/:prodNo', async (req, res) => {
  const prodNo = prodNoOf(req);
  const remark = typeof req.body?.remark === 'string' ? req.body.remark.slice(0, 250) : '';
  ok(res, found(await orders.cancel(ctx(req), prodNo, remark), prodNo));
});

router.use(portedErrors);

export default router;
