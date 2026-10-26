// Entry point: connect to the database, load the Settings table, listen.
import { app } from './app.js';
import { config } from './config/env.js';
import { dbReady } from './db/connection.js';
import { loadSettings } from './services/settings/settings.service.js';
import { log } from './shared/utils/log.js';

await dbReady();
await loadSettings();
app.listen(config.port, () => log('info', `Garuda API on http://localhost:${config.port}`));
