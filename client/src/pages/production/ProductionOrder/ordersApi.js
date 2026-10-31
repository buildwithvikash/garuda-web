// Production Order: the server calls (/api/production/orders, docs/API.md). Orders travel as plain JSON by field name
// (material, qty, ...); the server keeps the screen's rules.
import { api } from '@/api.js';

const BASE = '/production/orders';
const enc = encodeURIComponent;

const searchQuery = (search) => (search ? `&column=${enc(search.column)}&op=${enc(search.op)}&value=${enc(search.value)}` : '');

export const ordersApi = {
  /** { columns, rows, keys, total, page, pageSize } */
  list: ({ page = 0, search = null } = {}) => api(`${BASE}?page=${page}${searchQuery(search)}`),
  /** [{ name, operators: [{ value, text }] }] */
  searchFields: () => api(`${BASE}/search-fields`),
  columnValues: (column) => api(`${BASE}/search-fields/${enc(column)}/values`),
  /** { order, options, ui } */
  blank: () => api(`${BASE}/new`),
  get: (prodNo) => api(`${BASE}/${enc(prodNo)}`),
  /** what choosing a material / order type / sales order changes: { order, options, ui, message } */
  change: (field, order) => api(`${BASE}/changes/${field}`, { method: 'POST', body: order }),
  /** key: one per form, so a repeated click or a retry never creates a second order. A saved order cannot be changed
   *  (owner's rule), so there is no update. */
  create: (order, key) => api(BASE, { method: 'POST', body: order, headers: { 'Idempotency-Key': key } }),
};
