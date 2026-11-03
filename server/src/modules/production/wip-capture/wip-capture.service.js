// WIP Capture: the station's calls. The scan rules are the page's own ported code (forms/screens/production/
// wip-capture-form.js, on wip.service.js), which the parity runs proved; here it runs on the state the server keeps.
import { log } from '../../../config/logger.js';
import { netString } from '../../../shared/net.js';
import { eventHelpers, PAGE_EVENTS } from '../../forms/pages.js';
import { specPayload } from '../../forms/resource.js';
import { FORMS } from '../../forms/specs.js';
import { artworkByLabel, cabinetByLabel, routeByLabel } from '../wip.service.js';
import { ACTIONS, applyAnswer, find, inTurn, start, takeChecklist, takeFields, uiOf, unitOf, valuesOf, viewOf } from './wip-capture.station.js';

export const SCREEN = '/production/wipcaptureform';
const spec = () => FORMS[SCREEN];

export const stationOf = find;

/** opens a station: the screen's first load, on the session's department */
export async function openStation(ctx) {
  const payload = await specPayload(spec(), ctx);
  const s = start(ctx.userCode, payload);
  return { id: s.id, station: viewOf(s), ...(payload.statusMessage ? { alert: payload.statusMessage } : {}) };
}

/** runs a control's handler on the kept state and keeps its answer. A refusal is an answer too (it clears the box, and the
 *  screen shows the state it leaves); a handler's exception leaves the state as it was. */
async function run(s, ctx, control, opts = {}) {
  const handler = PAGE_EVENTS[spec().file]?.[control];
  if (!handler) return { station: viewOf(s) };
  const v = valuesOf(s);
  try {
    const r = await handler(v, eventHelpers(spec(), ctx, v, { viewState: s.viewState, arg: opts.arg, index: Number(opts.index ?? -1), ui: uiOf(s) }));
    applyAnswer(s, r);
    const model = r.set?.tbFG ? netString(r.set.tbFG.value).split('|')[0] : '';
    return { station: viewOf(s), model, ...(r.alert ? { alert: r.alert } : {}), ...(r.success ? { success: true } : {}), ...(r.explain ? { explain: r.explain } : {}), ...(r.session ? { session: r.session } : {}) };
  } catch (e) {
    return { station: viewOf(s), alert: e.message };
  }
}

/** what the operator did (ACTIONS), with the boxes it takes */
export const act = (s, ctx, name, body = {}) =>
  inTurn(s, async () => {
    const { control, fields, when } = ACTIONS[name];
    if (when && !when(s)) return { station: viewOf(s) };
    takeFields(s, fields, body);
    return run(s, ctx, control, { arg: body.arg, index: body.index });
  });

/** a checklist event (next, prev, save, value, list, go, goto, Pass, Fail, close) with its inputs as the operator left them */
export const checklistEvent = (s, ctx, event, body = {}) =>
  inTurn(s, async () => {
    if (!/^[A-Za-z]+$/.test(event) || !viewOf(s).checklist) return { station: viewOf(s) };
    takeChecklist(s, body.f);
    return run(s, ctx, `InspectionCheckList:${event}`, { arg: body.arg, index: body.index });
  });

/** the scanned unit's route and cabinet (read only); each part fails on its own, so a missing table or column never
 *  hides the other. The image shown is the one the routing asks for at this station's process. */
export async function unitDetails(s, requestId) {
  const label = unitOf(s);
  if (label === '') return { route: null, cabinet: null };
  const [route, cabinet] = await Promise.allSettled([routeByLabel(label), cabinetByLabel(label, s.viewState.ProcessCode ?? null)]);
  for (const r of [route, cabinet]) if (r.status === 'rejected') log('error', `${requestId} wip-capture/unit: ${r.reason?.message}`);
  return { route: route.value ?? null, cabinet: cabinet.value ?? null };
}

export const unitImage = artworkByLabel;
