// The production orders API (server: routes/production/orders.routes.js).
import { api } from '@/api.js';

const BASE = '/production/orders';
const enc = encodeURIComponent;

export const listOrders = ({ page = 0, search = null } = {}) =>
  api(`${BASE}?page=${page}${search ? `&column=${enc(search.column)}&op=${enc(search.op)}&value=${enc(search.value)}` : ''}`);
export const searchFields = () => api(`${BASE}/search-fields`);
export const columnValues = (column) => api(`${BASE}/search-fields/${enc(column)}/values`);

/** { order, options, ui } */
export const blankOrder = () => api(`${BASE}/new`);
export const getOrder = (prodNo) => api(`${BASE}/${enc(prodNo)}`);
/** what choosing a material / order type / sales order fills: { order, options, ui, message } */
export const changeOrder = (field, order) => api(`${BASE}/changes/${field}`, { method: 'POST', body: order });
export const addServiceRequest = (order) => api(`${BASE}/service-requests`, { method: 'POST', body: order });

export const createOrder = (order) => api(BASE, { method: 'POST', body: order });
export const saveOrder = (prodNo, order) => api(`${BASE}/${enc(prodNo)}`, { method: 'PUT', body: order });
export const cancelOrder = (prodNo, remark) => api(`${BASE}/${enc(prodNo)}`, { method: 'DELETE', body: { remark } });
