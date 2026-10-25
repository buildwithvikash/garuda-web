// The production assignment API (server: routes/production/assignments.routes.js).
import { api } from '@/api.js';

const BASE = '/production/assignments';

/** { assignment, options, ui, details: { route, bomInput, bomOutput }, left, message } */
export const blankAssignment = () => api(`${BASE}/new`);
/** department | order | routing | process | station chosen: the whole screen after it */
export const changeAssignment = (field, assignment) => api(`${BASE}/changes/${field}`, { method: 'POST', body: assignment });
/** prints the job cards: { message, alerts, left, ...the screen after it } */
export const printAssignment = (assignment) => api(`${BASE}/print`, { method: 'POST', body: assignment });
