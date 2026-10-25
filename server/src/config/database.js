// mssql pool options for the Garuda database (server, name and login come from .env via env.js).
import { config } from './env.js';

export const poolOptions = {
  ...config.db,
  requestTimeout: 0, // original DataWrapper used CommandTimeout = 0
  options: { encrypt: false, trustServerCertificate: true, useUTC: false },
};
