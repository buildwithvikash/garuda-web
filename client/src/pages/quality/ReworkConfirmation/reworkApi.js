// Rework Confirmation: the server calls (/api/quality/rework-confirmations, docs/API.md). The server finds the inspection itself.
import { api } from '@/api.js';

const BASE = '/quality/rework-confirmations';
const enc = encodeURIComponent;

export const reworkApi = {
  options: () => api(`${BASE}/options`),
  unit: (serial) => api(`${BASE}/units/${enc(serial)}`),
  serialOf: (id) => api(`${BASE}/records/${enc(id)}/serial`),
  /** the checklist panel opened on rows; its state stays with the screen */
  openChecklist: (state, rows) => api(`${BASE}/checklist`, { method: 'POST', body: { state, rows } }),
  checklistEvent: (name, state, arg, index) => api(`${BASE}/checklist/${enc(name)}`, { method: 'POST', body: { state, arg, index } }),
  /** key: one per confirmation, so a double click or a retry never confirms twice */
  confirm: (body, key) => api(BASE, { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
  /** the units waiting in a department, for RecordsList */
  waiting: (department) => ({
    list: (query) => api(`${BASE}?department=${enc(department)}&${query}`),
    columns: async () => [], // no search on this list, as the original
    values: async () => [],
  }),
};
