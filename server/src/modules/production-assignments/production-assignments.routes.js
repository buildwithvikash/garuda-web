// /api/production/assignments: start a production order at its first stage and print the job cards.
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../middlewares/auth.js';
import { portedErrors } from '../../middlewares/errorHandler.js';
import { operatorMessages } from '../../middlewares/operatorMessages.js';
import { validate } from '../../middlewares/validate.js';
import { ok } from '../../shared/http.js';
import { netString } from '../../shared/net.js';
import { sessionContext as ctx } from '../auth/context.js';
import * as assignments from './production-assignments.service.js';
import { validateAssignment } from './production-assignments.validation.js';

const router = Router();
router.use(requireAuth, authorizeScreen(assignments.SCREEN), operatorMessages);

router.get('/new', async (req, res) => ok(res, await assignments.blank(ctx(req)))); // the screen as it opens, with its lists
router.post('/changes/:field', validate(validateAssignment), async (req, res) => {
  ok(res, await assignments.change(ctx(req), netString(req.params.field), req.valid.body)); // department | order | routing | process | station
});
router.post('/print', validate(validateAssignment), async (req, res) => ok(res, await assignments.print(ctx(req), req.valid.body))); // job cards + labels

router.use(portedErrors);

export default router;
