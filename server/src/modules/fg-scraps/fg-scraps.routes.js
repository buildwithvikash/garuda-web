// /api/production/fg-scrap: scan a unit, scrap it, and the history.
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../middlewares/auth.js';
import { portedErrors } from '../../middlewares/errorHandler.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { operatorMessages } from '../../middlewares/operatorMessages.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../shared/AppError.js';
import { ok } from '../../shared/http.js';
import { netString } from '../../shared/net.js';
import { sessionContext as ctx } from '../auth/context.js';
import { scrapHistory } from '../production/production.service.js';
import { rangeOf } from '../production/production.routes.js';
import * as scraps from './fg-scraps.service.js';
import { serialProblem, validateScrap } from './fg-scraps.validation.js';

const router = Router();
router.use(requireAuth, authorizeScreen(scraps.SCREEN), operatorMessages);

// the units / items scrapped in the user's business unit, newest first (read only; ?page=&start=&end=)
router.get('/history', async (req, res) => {
  ok(res, await scrapHistory(req.session.businessUnit, Math.max(0, Number(req.query.page) || 0), rangeOf(req.query)));
});
router.get('/categories', async (_req, res) => ok(res, await scraps.categories()));
router.get('/units/:serial', async (req, res) => {
  const serial = netString(req.params.serial).trim();
  const problem = serial === '' ? 'Scan the unit' : serialProblem(serial);
  if (problem) throw AppError.badRequest(problem);
  ok(res, await scraps.unit(serial));
});
// Idempotency-Key: a double click or a retry gets the first answer, not a second scrap
router.post('/', idempotent, validate(validateScrap), async (req, res) => ok(res, await scraps.scrap(req.valid.body, ctx(req))));

router.use(portedErrors);

export default router;
