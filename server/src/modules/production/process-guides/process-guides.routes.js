// /api/production/process-guides: a station's guide for a job card, and the station logins.
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../../middlewares/auth.js';
import { portedErrors } from '../../../middlewares/errorHandler.js';
import { operatorMessages } from '../../../middlewares/operatorMessages.js';
import { validate } from '../../../middlewares/validate.js';
import { AppError } from '../../../shared/AppError.js';
import { ok } from '../../../shared/http.js';
import { netString } from '../../../shared/net.js';
import { sessionContext as ctx } from '../../auth/context.js';
import * as guides from './process-guides.service.js';

const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const digits = (v) => /^\d+$/.test(v);

/** a login as the API takes it; the rules on an empty station or user are the service's, in the original's order */
export function validateLogin(body) {
  const value = { station: text(body?.station), user: text(body?.user), password: typeof body?.password === 'string' ? body.password : '', qr: text(body?.qr) };
  if (value.station !== '' && !digits(value.station)) return { value, errors: { station: 'Select a Station from the list' } };
  return { value };
}

const router = Router();
router.use(requireAuth, authorizeScreen(guides.SCREEN), operatorMessages);

router.get('/options', async (req, res) => ok(res, await guides.options(ctx(req))));
router.get('/stations/:code', async (req, res) => ok(res, await guides.station(req.params.code, req.query.department, ctx(req))));
router.get('/guide', async (req, res) => {
  const [serial, station] = [netString(req.query.serial).trim(), netString(req.query.station).trim()];
  if (serial === '') throw AppError.badRequest('Scan the order');
  if (station === '') throw AppError.badRequest('Scan the station first');
  ok(res, await guides.guide(serial, station, req.query.department, ctx(req)));
});
router.get('/logins', async (_req, res) => ok(res, await guides.logins()));
router.post('/logins', validate(validateLogin), async (req, res) => ok(res, await guides.logIn(req.valid.body)));
router.delete('/logins/:userCode', async (req, res) => {
  if (!digits(req.params.userCode)) throw AppError.badRequest('Choose a user from the list');
  await guides.logOut(req.params.userCode);
  ok(res, await guides.logins());
});

router.use(portedErrors);

export default router;
