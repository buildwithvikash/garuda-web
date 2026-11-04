// /api/production/wip-capture: the operator's station (docs/API.md). A station's state stays on the server; a call says
// what the operator did and what they typed, and answers { station, alert?, success?, explain? } with the screen to draw.
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../../middlewares/auth.js';
import { portedErrors } from '../../../middlewares/errorHandler.js';
import { idempotent } from '../../../middlewares/idempotency.js';
import { operatorMessages } from '../../../middlewares/operatorMessages.js';
import { AppError } from '../../../shared/AppError.js';
import { ok } from '../../../shared/http.js';
import { netString } from '../../../shared/net.js';
import { sessionContext as ctx } from '../../auth/context.js';
import { writeSession } from '../../auth/sessions.js';
import { KINDS } from '../../masters/image-kinds.js';
import { act, checklistEvent, openStation, SCREEN, stationOf, unitDetails, unitImage } from './wip-capture.service.js';

const router = Router();
router.use(requireAuth, authorizeScreen(SCREEN), operatorMessages);

const RESTARTED = { restarted: true, alert: 'The station was reset (the server restarted or the shift ended). Scan the station again.' };

/** the call's station, or the answer that it is gone (the screen starts afresh) */
const station = (req, res) => {
  const s = stationOf(req.session.userCode, netString(req.params.id));
  if (!s) ok(res, RESTARTED);
  return s;
};
/** the answer; a page code's choice of department follows into the session */
const answer = (req, res, r) => {
  if (r.session && 'department' in r.session) writeSession(res, { ...req.session, department: netString(r.session.department) });
  const { session: _, ...rest } = r;
  ok(res, rest);
};
const doing = (name, body = (req) => req.body) => async (req, res) => {
  const s = station(req, res);
  if (s) answer(req, res, await act(s, ctx(req), name, body(req) ?? {}));
};

router.post('/sessions', async (req, res) => ok(res, await openStation(ctx(req))));

router.post('/sessions/:id/department', doing('department'));
router.post('/sessions/:id/station', doing('station'));
router.delete('/sessions/:id/station', doing('clearStation'));
router.post('/sessions/:id/unit', doing('unit'));
router.delete('/sessions/:id/unit', doing('clearUnit'));
router.get('/sessions/:id/unit', async (req, res) => {
  const s = station(req, res);
  if (s) ok(res, await unitDetails(s, req.id));
});

router.post('/sessions/:id/inputs/scan', doing('component'));
router.post('/sessions/:id/inputs/consume', doing('consume'));
router.delete('/sessions/:id/inputs', doing('closeInputs'));

router.post('/sessions/:id/qc/status', doing('status'));
router.post('/sessions/:id/qc/defect-category', doing('defectCategory'));
router.post('/sessions/:id/qc/defects', doing('addDefect'));
router.post('/sessions/:id/qc/defects/remove', doing('removeDefect'));
router.post('/sessions/:id/qc/checklist', doing('openChecklist'));
router.post('/sessions/:id/qc/checklist/:event', async (req, res) => {
  const s = station(req, res);
  if (s) answer(req, res, await checklistEvent(s, ctx(req), netString(req.params.event), req.body ?? {}));
});
router.post('/sessions/:id/qc/clear', doing('clearQC'));
router.post('/sessions/:id/qc/save', idempotent, doing('saveQC'));

router.post('/sessions/:id/guide', doing('guide'));
router.post('/sessions/:id/guide/file', doing('guideFile'));
router.post('/sessions/:id/guide/document', doing('guideDocument'));
router.delete('/sessions/:id/guide', doing('closeGuide'));

// the cabinet: the scanned unit's FG material image of a kind (the Material screen's "Artwork & Packing Images"), served
// to the screen's operators (the Material screen's own image route needs that screen's access)
router.get('/units/:label/image/:kind', async (req, res) => {
  const label = netString(req.params.label).trim();
  if (label === '' || label.length > 100) throw AppError.badRequest('Scan a unit serial');
  const kind = netString(req.params.kind);
  if (!KINDS.includes(kind)) throw AppError.badRequest(`The image must be one of: ${KINDS.join(', ')}.`);
  const img = await unitImage(label, kind);
  if (!img) throw AppError.notFound('Image');
  res.set('Content-Type', img.mimeType);
  res.set('Cache-Control', 'private, max-age=300');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(img.image);
});

router.use(portedErrors);

export default router;
