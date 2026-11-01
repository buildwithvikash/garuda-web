// /api/masters/routings/:route/stage-images: which of the material's images WIP Capture shows at each stage of a
// routing (owner, 1 Nov 2026: one image per stage, set on the Routing screen). Table RoutingStageImages
// (db/migrations/2026-11-routing-stage-images.sql); a stage with no row shows no image.
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../middlewares/auth.js';
import { execute, query } from '../../db/pool.js';
import { transaction } from '../../db/tx.js';
import { AppError } from '../../shared/AppError.js';
import { ok } from '../../shared/http.js';
import { routeOf, stagesOf } from './routing-stage-images.rules.js';

/** the table is missing on this database (its migration not run yet) */
const NO_TABLE = /invalid object name '?(dbo\.)?RoutingStageImages'?/i;
export const SETUP_NEEDED = 'Images on WIP Capture are not set up on this database yet: run server/db/migrations/2026-11-routing-stage-images.sql on it once.';

/** the routing's stages in order, each with the image WIP Capture shows there (null: none). { stages, setupNeeded }:
 *  setupNeeded when the table is not there yet (the stages come without images) */
export async function stageImages(route) {
  const sql = (withImages) =>
    `select rt.SeqNo seq, rt.ProcessCode processCode, pp.Name process, ${withImages ? 'si.ImageKind' : 'null'} imageKind
       from RoutingTrans rt
       left join ProductionProcess pp on pp.ProcessCode = rt.ProcessCode
       ${withImages ? 'left join RoutingStageImages si on si.RouteCode = rt.RouteCode and si.ProcessCode = rt.ProcessCode' : ''}
      where rt.RouteCode = @route order by rt.SeqNo`;
  let setupNeeded = false;
  let rows;
  try {
    rows = await query(sql(true), { route });
  } catch (e) {
    if (!NO_TABLE.test(e.message)) throw e;
    setupNeeded = true;
    rows = await query(sql(false), { route });
  }
  return { setupNeeded, stages: rows.map((s) => ({ seq: s.seq, processCode: s.processCode, process: s.process ?? '', imageKind: s.imageKind ?? null })) };
}

/** saves the routing's stage images (a stage set to none loses its row) */
export async function saveStageImages(route, body, user) {
  const codes = (await query('select ProcessCode from RoutingTrans where RouteCode=@route', { route })).map((r) => r.ProcessCode);
  if (!codes.length) throw AppError.notFound('Routing');
  const stages = stagesOf(body, codes);
  try {
    await transaction(async (tx) => {
      for (const s of stages) {
        if (s.imageKind === null) await execute('delete from RoutingStageImages where RouteCode=@route and ProcessCode=@p', { route, p: s.processCode }, tx);
        else
          await execute(
            `merge RoutingStageImages as t using (select @route RouteCode, @p ProcessCode) as s on t.RouteCode=s.RouteCode and t.ProcessCode=s.ProcessCode
             when matched then update set ImageKind=@kind, UpdatedOn=getdate(), UpdatedBy=@user
             when not matched then insert (RouteCode, ProcessCode, ImageKind, UpdatedBy) values (@route, @p, @kind, @user);`,
            { route, p: s.processCode, kind: s.imageKind, user: Number(user) || 0 },
            tx,
          );
      }
    });
  } catch (e) {
    if (NO_TABLE.test(e.message)) throw new AppError(409, SETUP_NEEDED);
    throw e;
  }
  return stageImages(route);
}

const router = Router();
const guard = [requireAuth, authorizeScreen('/productionsetup/routingform')];
router.get('/routings/:route/stage-images', ...guard, async (req, res) => ok(res, await stageImages(routeOf(req.params.route))));
router.put('/routings/:route/stage-images', ...guard, async (req, res) => ok(res, await saveStageImages(routeOf(req.params.route), req.body, req.session.userCode)));

export default router;
