// Production Assignment: the server calls (/api/production/assignments, docs/API.md). The choices travel by field name
// (department, order, routing, ...); the server replays and checks them through the screen's own rules.
import { api } from '@/api.js';

const BASE = '/production/assignments';

export const assignmentsApi = {
  /** the screen as it opens: { assignment, options, ui, details, left, message } */
  blank: () => api(`${BASE}/new`),
  /** what choosing a department / order / routing / process / station fills: the same shape */
  change: (field, assignment) => api(`${BASE}/changes/${field}`, { method: 'POST', body: assignment }),
  /** prints the job cards; key: one per print, so a double click or a retry never prints the batch twice.
   *  The same shape, plus { message, alerts } */
  print: (assignment, key) => api(`${BASE}/print`, { method: 'POST', body: assignment, headers: { 'Idempotency-Key': key } }),
};
