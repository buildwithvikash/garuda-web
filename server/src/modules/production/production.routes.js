// /api/production/<name>: the shop-floor screens (WIP capture, FG scrap, RM replacement, model transfer, process guide,
// plan upload, image display) as REST resources; the calls are in forms/resource.routes.js, the reference in
// docs/API.md. Orders and assignments have modules of their own (production-orders/, production-assignments/).
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../middlewares/auth.js';
import { AppError } from '../../shared/AppError.js';
import { ok } from '../../shared/http.js';
import { netString } from '../../shared/net.js';
import { log } from '../../config/logger.js';
import { sessionContext } from '../auth/context.js';
import { screensRouter } from '../forms/resource.routes.js';
import { cabinetByLabel, routeByLabel } from './wip.service.js';
import { replacementHistory, scrapHistory } from './production.service.js';
import { checkTransfer, transferMany } from './model-transfer-bulk.js';

/** API name -> screen */
export const PRODUCTION = {
  'wip-capture': '/production/wipcaptureform',
  'fg-scrap': '/production/fgscrapform',
  'rm-replacements': '/production/rmreplacementform',
  'model-transfers': '/production/modeltomodeltransferform',
  'process-guides': '/production/processguideform',
  'plan-uploads': '/production/prodplanupload',
  'image-display': '/production/wrlimagedisply',
};

const router = Router();
// WIP Capture's unit view: the scanned label's route and cabinet details (read only). Each part fails on its own, so a
// missing table or column never hides the other.
router.get('/wip-capture/units/:label', requireAuth, authorizeScreen(PRODUCTION['wip-capture']), async (req, res) => {
  const label = netString(req.params.label).trim();
  if (label === '' || label.length > 100) throw AppError.badRequest('Scan a unit serial');
  const [route, cabinet] = await Promise.allSettled([routeByLabel(label), cabinetByLabel(label)]);
  for (const r of [route, cabinet]) if (r.status === 'rejected') log('error', `${req.id} production/units: ${r.reason?.message}`);
  ok(res, { route: route.value ?? null, cabinet: cabinet.value ?? null });
});
/** a history's optional time range: ?start=&end= as a date-time box sends them (YYYY-MM-DDTHH:mm), else refused */
export function rangeOf(q) {
  const range = {};
  for (const [name, key] of [['start', 'startTime'], ['end', 'endTime']]) {
    const v = netString(q[name]).trim();
    if (v === '') continue;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v) || Number.isNaN(Date.parse(v))) throw AppError.badRequest(`The ${name} time is not a date and time`);
    range[key] = v.length === 16 ? `${v}:00` : v; // SQL Server reads YYYY-MM-DDTHH:mm:ss (with the seconds)
  }
  if (range.startTime && range.endTime && range.startTime > range.endTime) throw AppError.badRequest('The start time is after the end time');
  return range;
}
const pageOf = (q) => Math.max(0, Number(q.page) || 0);
// RM Replacement's history (read only): the replacements done in the user's business unit, newest first
// (?page=&start=&end=)
router.get('/rm-replacements/history', requireAuth, authorizeScreen(PRODUCTION['rm-replacements']), async (req, res) => {
  ok(res, await replacementHistory(req.session.businessUnit, pageOf(req.query), rangeOf(req.query)));
});
// FG Scrap's history (read only): the units / items scrapped in the user's business unit, newest first
// (?page=&start=&end=)
router.get('/fg-scrap/history', requireAuth, authorizeScreen(PRODUCTION['fg-scrap']), async (req, res) => {
  ok(res, await scrapHistory(req.session.businessUnit, pageOf(req.query), rangeOf(req.query)));
});
// Model To Model Transfer by a list of FG serials (model-transfer-bulk.js): { serials } checked and grouped by product,
// then { source, destination, barcodeNos, printer } moved MAX_MOVE at a time
router.post('/model-transfers/bulk/check', requireAuth, authorizeScreen(PRODUCTION['model-transfers']), async (req, res) => {
  ok(res, await checkTransfer(req.body?.serials));
});
router.post('/model-transfers/bulk', requireAuth, authorizeScreen(PRODUCTION['model-transfers']), async (req, res) => {
  ok(res, await transferMany(req.body ?? {}, sessionContext(req)));
});
router.use(screensRouter(PRODUCTION));

export default router;
