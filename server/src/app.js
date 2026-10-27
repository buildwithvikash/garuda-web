// The Express app: security headers, request IDs, the API, station guide files and the built React app.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config/env.js';
import { requestLog } from './middlewares/requestLog.js';
import { securityHeaders } from './middlewares/securityHeaders.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import formsRoutes from './modules/forms/forms.routes.js';
import productionAssignmentsRoutes from './modules/production-assignments/production-assignments.routes.js';
import productionOrdersRoutes from './modules/production-orders/production-orders.routes.js';
import mastersRoutes from './modules/masters/masters.routes.js';
import qualityRoutes from './modules/quality/quality.routes.js';
import productionRoutes, { PRODUCTION } from './modules/production/production.routes.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
app.use(requestLog);
app.use(securityHeaders(`${dist}/index.html`));

// screens send whole forms (grids, images, picked files) as the original pages posted them
for (const p of ['/api/forms', '/api/masters', '/api/quality', ...Object.keys(PRODUCTION).map((n) => `/api/production/${n}`)]) app.use(p, express.json({ limit: '100mb' }));
app.use('/api', express.json({ limit: '1mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/production/orders', productionOrdersRoutes);
app.use('/api/production/assignments', productionAssignmentsRoutes);
app.use('/api/masters', mastersRoutes);
app.use('/api/quality', qualityRoutes);
app.use('/api/production', productionRoutes); // the shop-floor screens, after orders / assignments
app.use('/api', notFoundHandler);

// ~/GuideFiles/… as on the original site
app.use('/GuideFiles', express.static(config.guideFilesDir));

// Production: serve the built React app; client-side routes fall back to index.html.
app.use(express.static(dist));
app.get(/^(?!\/api\/|\/GuideFiles\/).*/, (_req, res) => res.sendFile('index.html', { root: dist }));

// Errors: log details server-side, show users a plain message (decision S7).
app.use(errorHandler);
