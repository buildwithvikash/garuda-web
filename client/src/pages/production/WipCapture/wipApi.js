// WIP Capture: the server calls (/api/production/wip-capture, docs/API.md). The station's state is the server's: a call
// says what the operator did and what they typed, and answers the screen to draw.
import { api } from '@/api.js';

const BASE = '/production/wip-capture';
const enc = encodeURIComponent;

export const wipApi = {
  open: () => api(`${BASE}/sessions`, { method: 'POST', body: {} }),
  call: (id, method, path, body, headers) => api(`${BASE}/sessions/${enc(id)}/${path}`, { method, body: body ?? {}, headers }),
  /** the scanned unit's route and cabinet */
  unit: (id) => api(`${BASE}/sessions/${enc(id)}/unit`),
  imageUrl: (serial, kind) => `/api${BASE}/units/${enc(serial)}/image/${enc(kind)}`,
};
