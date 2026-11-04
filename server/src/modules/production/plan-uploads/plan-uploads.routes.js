// /api/production/plan-uploads: read an Excel sheet, apply it, and the plans so far.
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
import * as plans from './plan-uploads.service.js';

/** the sheet as /read gave it back; the column count is the file's check, as the original's "Invalid File" */
export function validateSheet(body) {
  const { columns, rows } = body ?? {};
  if (!Array.isArray(columns) || !Array.isArray(rows)) return { value: {}, errors: { sheet: 'Import the file first' } };
  if (columns.length !== plans.UPLOAD_COLUMNS) return { value: {}, errors: { sheet: 'Invalid File' } };
  const cell = (v) => v === null || typeof v === 'string';
  if (!rows.every((r) => Array.isArray(r) && r.every(cell))) return { value: {}, errors: { sheet: 'Invalid File' } };
  return { value: { columns, rows } };
}

const router = Router();
router.use(requireAuth, authorizeScreen(plans.SCREEN), operatorMessages);

router.get('/', async (req, res) => {
  const search = req.query.column ? { column: netString(req.query.column), op: netString(req.query.op), value: netString(req.query.value) } : null;
  ok(res, await plans.list(ctx(req), Math.max(0, Number(req.query.page) || 0), search));
});
router.get('/columns', async (req, res) => ok(res, await plans.listColumns(ctx(req))));
router.get('/values/:column', async (req, res) => ok(res, await plans.listValues(ctx(req), netString(req.params.column))));
router.post('/read', async (req, res) => {
  if (!req.body?.file?.data) throw AppError.badRequest('Choose the Excel file');
  ok(res, await plans.importExcel(req.body.file));
});
// Idempotency-Key: a double click or a retry gets the first answer
router.post('/', idempotent, validate(validateSheet), async (req, res) => ok(res, await plans.applySheet(req.valid.body, ctx(req))));

router.use(portedErrors);

export default router;
