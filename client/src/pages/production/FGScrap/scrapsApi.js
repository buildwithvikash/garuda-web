// FG Scrap: the server calls (/api/production/fg-scrap, docs/API.md). The server finds the job card and components itself.
import { api } from '@/api.js';

const BASE = '/production/fg-scrap';

export const scrapsApi = {
  /** the scrap reasons: [{ value, label }] */
  categories: () => api(`${BASE}/categories`),
  /** the unit and its components: { serial, components: [{ category, material, process, serial }] } */
  unit: (serial) => api(`${BASE}/units/${encodeURIComponent(serial)}`),
  /** key: one per scrap, so a double click or a retry never scraps twice */
  scrap: (body, key) => api(BASE, { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
  /** a page of the history, in the list shape { columns, rows, count, page, pageSize } */
  history: (query) => api(`${BASE}/history?${query}`),
};
