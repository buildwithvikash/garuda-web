// /api/quality/rework-confirmations: scan a rejected unit, its checklist, confirm the rework, and the units waiting.
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../../middlewares/auth.js';
import { portedErrors } from '../../../middlewares/errorHandler.js';
import { idempotent } from '../../../middlewares/idempotency.js';
import { operatorMessages } from '../../../middlewares/operatorMessages.js';
import { validate } from '../../../middlewares/validate.js';
import { AppError } from '../../../shared/AppError.js';
import { ok } from '../../../shared/http.js';
import { netString } from '../../../shared/net.js';
import { sessionContext as ctx } from '../../auth/context.js';
import { writeSession } from '../../auth/sessions.js';
import * as rework from './rework-confirmations.service.js';

const MAX_REMARK = 500;
const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const code = (v) => /^\d*$/.test(v);

/** a confirmation as the API takes it, trimmed; the rules with the operator's messages are the service's */
export function validateConfirmation(body) {
  const value = Object.fromEntries(['serial', 'qty', 'rootCause', 'actionTaken', 'remark', 'status', 'newAction', 'department'].map((k) => [k, text(body?.[k])]));
  const errors = {};
  if (value.serial === '') errors.serial = 'Please scan Right Barcode';
  if (value.remark.length > MAX_REMARK) errors.remark = `A remark has at most ${MAX_REMARK} characters`;
  for (const k of ['rootCause', 'actionTaken', 'status', 'newAction', 'department']) if (!code(value[k])) errors[k] = 'Choose from the list';
  return Object.keys(errors).length ? { value, errors } : { value };
}

const router = Router();
router.use(requireAuth, authorizeScreen(rework.SCREEN), operatorMessages);

router.get('/', async (req, res) => ok(res, await rework.list(ctx(req), req.query.department, Math.max(0, Number(req.query.page) || 0), null)));
router.get('/options', async (req, res) => ok(res, await rework.options(ctx(req))));
router.get('/units/:serial', async (req, res) => {
  const serial = netString(req.params.serial).trim();
  if (serial === '' || serial.length > 100) throw AppError.badRequest('Scan a unit serial');
  ok(res, await rework.unit(serial));
});
router.get('/records/:id/serial', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) throw AppError.notFound('Inspection');
  ok(res, { serial: await rework.serialOf(req.params.id) });
});
// the checklist's state travels with the screen, as the panel's did: nothing here is stored
router.post('/checklist', async (req, res) => {
  if (!req.body?.state || !Array.isArray(req.body?.rows)) throw AppError.badRequest('Scan the unit first');
  ok(res, await rework.openChecklist(req.body.state, req.body.rows));
});
router.post('/checklist/:event', async (req, res) => {
  if (!req.body?.state) throw AppError.badRequest('Scan the unit first');
  ok(res, await rework.checklistEvent(req.params.event, req.body.state, req.body.arg, Number(req.body.index ?? -1)));
});
// Idempotency-Key: a double click or a retry gets the first answer, not a second confirmation
router.post('/', idempotent, validate(validateConfirmation), async (req, res) => {
  const r = await rework.confirm(req.valid.body, ctx(req));
  writeSession(res, { ...req.session, department: req.valid.body.department }); // the department chosen stays for the session, as the original
  ok(res, r);
});

router.use(portedErrors);

export default router;
