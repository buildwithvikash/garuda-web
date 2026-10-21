import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { dbReady } from './db/index.js';
import { loadSettings } from './modules/settings/service.js';
import { authRoutes } from './modules/auth/routes.js';
import { dashboardRoutes } from './modules/dashboards/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { wrlReportRoutes } from './modules/reports/wrlRoutes.js';
import { formRoutes } from './modules/forms/routes.js';

const app = express();
app.disable('x-powered-by');
// form posts can carry files (guides, images) as base64
app.use('/api/forms', express.json({ limit: '100mb' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/reports/generic', reportRoutes);
app.use('/api/reports/wrl', wrlReportRoutes);
app.use('/api/forms', formRoutes);
// Migrated modules register here, each guarded with requireAuth + authorize(<ModuleID>).

app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

// ~/GuideFiles/… as on the original site
app.use('/GuideFiles', express.static(config.guideFilesDir));

// Production: serve the built React app; client-side routes fall back to index.html.
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
app.use(express.static(dist));
app.get(/^(?!\/api\/|\/GuideFiles\/).*/, (_req, res) => res.sendFile('index.html', { root: dist }));

// Errors: log details server-side, show users a plain message (decision S7).
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong. Please try again or contact the administrator.' });
});

await dbReady();
await loadSettings();
app.listen(config.port, () => console.log(`Garuda API on http://localhost:${config.port}`));
