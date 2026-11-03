// /api/production/<name>: production screens still served by the screen engine (none now); the calls are in
// forms/resource.routes.js, the reference in docs/API.md. Every production screen has a module of its own under this folder.
import { Router } from 'express';
import { AppError } from '../../shared/AppError.js';
import { netString } from '../../shared/net.js';
import { screensRouter } from '../forms/resource.routes.js';

/** API name -> screen */
export const PRODUCTION = {};

const router = Router();
/** a history's optional time range: ?start=&end= as a date-time box sends them (YYYY-MM-DDTHH:mm), else refused */
export function rangeOf(q) {
  const range = {};
  for (const [name, key] of [['start', 'startTime'], ['end', 'endTime']]) {
    const v = netString(q[name]).trim();
    if (v === '') continue;
    if (!/^d{4}-d{2}-d{2}Td{2}:d{2}(:d{2})?$/.test(v) || Number.isNaN(Date.parse(v))) throw AppError.badRequest(`The ${name} time is not a date and time`);
    range[key] = v.length === 16 ? `${v}:00` : v; // SQL Server reads YYYY-MM-DDTHH:mm:ss (with the seconds)
  }
  if (range.startTime && range.endTime && range.startTime > range.endTime) throw AppError.badRequest('The start time is after the end time');
  return range;
}
router.use(screensRouter(PRODUCTION));

export default router;
