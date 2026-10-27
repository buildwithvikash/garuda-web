// The parity scripts' --api side: a step through a screen's REST API (modules/forms/resource.js behind /api/masters,
// /api/quality and /api/production/<screen>) instead of its page code directly. The control values become the API's
// record, its validator checks the body, and the answer is turned back into the handler's own shape ({ set, alert,
// viewState, ok, message }) so the scripts compare it as before. Both translations are the client page's own
// (client/src/lib/screenApiCore.js). A refusal (400) comes back as { ok: false, message, alert }.
import { MASTERS } from '../../src/modules/masters/masters.routes.js';
import { QUALITY } from '../../src/modules/quality/quality.routes.js';
import { PRODUCTION } from '../../src/modules/production/production.routes.js';
import { FORMS } from '../../src/modules/forms/specs.js';
import { screenResource } from '../../src/modules/forms/resource.js';
import { validateBody } from '../../src/modules/forms/resource.validation.js';
import { eventOf, toPatch, toRecord } from '../../../client/src/lib/screenApiCore.js';

const byFile = new Map([...Object.values(MASTERS), ...Object.values(QUALITY), ...Object.values(PRODUCTION)].map((r) => [FORMS[r].file, screenResource(r)]));
/** the screen's API, or undefined when it has none */
export const apiOf = (spec) => byFile.get(spec.file);

// the client's translation (client/src/lib/screenApiCore.js), with the maps GET /layout gives the page
const mapsOf = (m, spec) => ({ fields: m.FIELDS, names: m.NAMES, events: m.EVENTS, grids: new Set(spec.controls.filter((c) => c.type === 'GridView').map((c) => c.id)) });
/** control values -> the API's validated body */
function body(m, maps, v, opts = {}) {
  const { value, errors } = validateBody(m.FIELDS, m.NESTED)({ record: toRecord(v, maps), viewState: opts.viewState ?? {}, ui: opts.ui ?? {}, ...(opts.arg !== undefined && { arg: opts.arg }), index: opts.index ?? -1, ...(opts.printer !== undefined && { printer: String(opts.printer) }) });
  if (errors) throw new Error(`validator refused: ${JSON.stringify(errors)}`);
  return value;
}
const refused = (e) => {
  if (e.statusCode === 400) return { ok: false, message: e.message, ...(e.alert && { alert: e.alert }) };
  throw e;
};

/** an event (control ID as the registry names it: 'Go', 'Footer:save', 'GVTransData:delete' ...) through the API */
export async function apiEvent(spec, ctx, control, v, opts) {
  const m = apiOf(spec);
  const maps = mapsOf(m, spec);
  const event = eventOf(control, maps);
  if (!event) throw new Error(`no API event for ${control}`);
  return toPatch(await m.event(ctx, event, body(m, maps, v, opts)), maps);
}
/** TitleControl Save through the API (POST /) */
export async function apiSave(spec, ctx, v, opts) {
  const m = apiOf(spec);
  const maps = mapsOf(m, spec);
  return m.create(ctx, body(m, maps, v, opts)).then((r) => toPatch(r, maps), refused);
}
