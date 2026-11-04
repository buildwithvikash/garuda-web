// /api/production/model-transfers: FG units moved to another model by their serials, and the history.
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../../middlewares/auth.js';
import { portedErrors } from '../../../middlewares/errorHandler.js';
import { idempotent } from '../../../middlewares/idempotency.js';
import { operatorMessages } from '../../../middlewares/operatorMessages.js';
import { ok } from '../../../shared/http.js';
import { netString } from '../../../shared/net.js';
import { sessionContext as ctx } from '../../auth/context.js';
import * as transfers from './model-transfers.service.js';

const router = Router();
router.use(requireAuth, authorizeScreen(transfers.SCREEN), operatorMessages);

router.get('/options', async (_req, res) => ok(res, await transfers.options()));
// the transfers so far (?page=&column=&op=&value=), the columns they can be filtered on, a column's values
router.get('/history', async (req, res) => {
  const search = req.query.column ? { column: netString(req.query.column), op: netString(req.query.op), value: netString(req.query.value) } : null;
  ok(res, await transfers.history(ctx(req), Math.max(0, Number(req.query.page) || 0), search));
});
router.get('/history/columns', async (req, res) => ok(res, await transfers.historyColumns(ctx(req))));
router.get('/history/values/:column', async (req, res) => ok(res, await transfers.historyValues(ctx(req), netString(req.params.column))));
// { serials }: checked and grouped by product
router.post('/check', async (req, res) => ok(res, await transfers.checkTransfer(req.body?.serials)));
// { source, destination, barcodeNos, printer }: moved MAX_MOVE at a time. Idempotency-Key: a retry gets the first answer
router.post('/', idempotent, async (req, res) => ok(res, await transfers.transferMany(req.body ?? {}, ctx(req))));

router.use(portedErrors);

export default router;
