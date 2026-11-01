// /api/production/rm-replacements: scan a unit, replace one of its raw material components, and the history.
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
import { replacementHistory } from '../production/production.service.js';
import { rangeOf } from '../production/production.routes.js';
import * as replacements from './rm-replacements.service.js';
import { serialProblem, validateReplacement } from './rm-replacements.validation.js';

const router = Router();
router.use(requireAuth, authorizeScreen(replacements.SCREEN), operatorMessages);

// the replacements done in the user's business unit, newest first (read only; ?page=&start=&end=)
router.get('/history', async (req, res) => {
  ok(res, await replacementHistory(req.session.businessUnit, Math.max(0, Number(req.query.page) || 0), rangeOf(req.query)));
});
router.get('/units/:serial', async (req, res) => {
  const serial = netString(req.params.serial).trim();
  const problem = serial === '' ? 'Scan the unit' : serialProblem(serial);
  if (problem) throw AppError.badRequest(problem);
  ok(res, await replacements.unit(serial));
});
// Idempotency-Key: a repeated scan or a retry gets the first answer, not a second replacement
router.post('/', idempotent, validate(validateReplacement), async (req, res) => ok(res, await replacements.replace(req.valid.body, ctx(req))));

router.use(portedErrors);

export default router;
