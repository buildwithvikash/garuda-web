// Model To Model Transfer: the server calls (/api/production/model-transfers, docs/API.md).
import { api } from '@/api.js';

const BASE = '/production/model-transfers';
const enc = encodeURIComponent;

export const transfersApi = {
  /** what the screen chooses from: { materials: [{ value, label }], printers: [{ value, label }] } */
  options: () => api(`${BASE}/options`),
  /** the serials checked and grouped by product: { groups, refused } */
  check: (serials) => api(`${BASE}/check`, { method: 'POST', body: { serials } }),
  /** up to 50 units of one product moved; key: one per part, so a retry never moves them twice */
  transfer: (body, key) => api(BASE, { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
  /** a page of the transfers so far, in the list shape { columns, rows, count, page, pageSize } */
  history: (query) => api(`${BASE}/history?${query}`),
  /** the columns the history can be filtered on: [{ name, operators: [[value, text]] }] */
  historyColumns: () => api(`${BASE}/history/columns`),
  historyValues: (column) => api(`${BASE}/history/values/${enc(column)}`),
};
