// RM Replacement: the server calls (/api/production/rm-replacements, docs/API.md). Serials only: the server finds the
// job card and row itself.
import { api } from '@/api.js';

const BASE = '/production/rm-replacements';

export const replacementsApi = {
  /** the unit and its components: { serial, components: [{ category, material, process, serial, replaceable }] } */
  unit: (serial) => api(`${BASE}/units/${encodeURIComponent(serial)}`),
  /** key: one per replacement, so a repeated scan or a retry never replaces twice. The unit again, plus { message } */
  replace: (body, key) => api(BASE, { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
  /** a page of the history, in the list shape { columns, rows, count, page, pageSize } */
  history: (query) => api(`${BASE}/history?${query}`),
};
