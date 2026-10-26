// The Express app: security headers, request IDs, the API, station guide files and the built React app.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config/env.js';
import { requestLog } from './middleware/request-log.js';
import { securityHeaders } from './middleware/security-headers.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRoutes } from './routes/index.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
app.use(requestLog);
app.use(securityHeaders(`${dist}/index.html`));

app.use('/api', apiRoutes);

// ~/GuideFiles/… as on the original site
app.use('/GuideFiles', express.static(config.guideFilesDir));

// Production: serve the built React app; client-side routes fall back to index.html.
app.use(express.static(dist));
app.get(/^(?!\/api\/|\/GuideFiles\/).*/, (_req, res) => res.sendFile('index.html', { root: dist }));

// Errors: log details server-side, show users a plain message (decision S7).
app.use(errorHandler);
