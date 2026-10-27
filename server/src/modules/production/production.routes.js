// /api/production/<name>: the shop-floor screens (WIP capture, FG scrap, RM replacement, model transfer, process guide,
// plan upload, image display) as REST resources; the calls are in forms/resource.routes.js, the reference in
// docs/API.md. Orders and assignments have modules of their own (production-orders/, production-assignments/).
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../middlewares/auth.js';
import { AppError } from '../../shared/AppError.js';
import { ok } from '../../shared/http.js';
import { netString } from '../../shared/net.js';
import { log } from '../../config/logger.js';
import { screensRouter } from '../forms/resource.routes.js';
import { cabinetByLabel, routeByLabel } from './wip.service.js';

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
router.use(screensRouter(PRODUCTION));

export default router;
