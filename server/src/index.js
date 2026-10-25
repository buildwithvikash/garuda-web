import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { dbReady } from './db/index.js';
import { loadSettings } from './modules/settings/service.js';
import { authRoutes } from './modules/auth/routes.js';
import { formRoutes } from './modules/forms/routes.js';
import { securityHeaders, requestLog, log } from './lib/http.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
app.use(requestLog);
app.use(securityHeaders(`${dist}/index.html`));
// form posts can carry files (guides, images) as base64
app.use('/api/forms', express.json({ limit: '100mb' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/forms', formRoutes);
// Migrated modules register here, each guarded with requireAuth + authorize(<ModuleID>).

app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

// ~/GuideFiles/… as on the original site
app.use('/GuideFiles', express.static(config.guideFilesDir));

// Production: serve the built React app; client-side routes fall back to index.html.
app.use(express.static(dist));
app.get(/^(?!\/api\/|\/GuideFiles\/).*/, (_req, res) => res.sendFile('index.html', { root: dist }));

// Errors: log details server-side, show users a plain message (decision S7).
app.use((err, req, res, _next) => {
  // a body the client sent that is not valid JSON / too large: the client's mistake, not the server's
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    log('warn', `${req.id} ${req.method} ${req.originalUrl.split('?')[0]} unreadable body: ${err.message}`);
    return void res.status(err.status ?? 400).json({ message: 'The request could not be read.' });
  }
  log('error', `${req.id} ${req.method} ${req.originalUrl.split('?')[0]} ${err.stack ?? err}`);
  res.status(500).json({ message: `Something went wrong. Please try again or contact the administrator (reference ${req.id}).` });
});

await dbReady();
await loadSettings();
app.listen(config.port, () => log('info', `Garuda API on http://localhost:${config.port}`));
