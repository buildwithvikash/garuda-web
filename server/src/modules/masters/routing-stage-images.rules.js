// The Routing screen's "Images on WIP Capture": the checks on what a request sends (no database: tested on its own).
import { AppError } from '../../shared/AppError.js';
import { KINDS } from './image-kinds.js';

/** a routing code from the path */
export function routeOf(code) {
  const c = Number(code);
  if (!/^\d+$/.test(String(code)) || !Number.isSafeInteger(c) || c <= 0) throw AppError.badRequest('The routing code is not valid.');
  return c;
}

/** The body { stages: [{ processCode, imageKind }] } checked against the routing's own processes: imageKind one of the
 *  material image kinds, or empty / null for none. [{ processCode, imageKind | null }] */
export function stagesOf(body, processCodes) {
  const stages = body?.stages;
  if (!Array.isArray(stages)) throw AppError.badRequest('Send the stages as a list.');
  const known = new Set(processCodes.map(String));
  const seen = new Set();
  return stages.map((s) => {
    const code = String(s?.processCode ?? '');
    if (!known.has(code)) throw AppError.badRequest(`Process ${code} is not a stage of this routing.`);
    if (seen.has(code)) throw AppError.badRequest(`Process ${code} is given twice.`);
    seen.add(code);
    const kind = s?.imageKind === '' || s?.imageKind == null ? null : String(s.imageKind);
    if (kind !== null && !KINDS.includes(kind)) throw AppError.badRequest(`The image must be one of: ${KINDS.join(', ')}.`);
    return { processCode: Number(code), imageKind: kind };
  });
}

