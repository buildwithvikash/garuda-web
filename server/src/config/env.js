// All configuration comes from environment variables (.env in development).
import { fileURLToPath } from 'node:url';
const env = process.env;

function required(name) {
  const v = env[name];
  if (!v) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return v;
}

export const config = {
  port: Number(env.PORT ?? 4000),
  db: {
    server: required('DB_SERVER'),
    port: Number(env.DB_PORT ?? 1433),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
  },
  // Same meaning as the original Web.config appSettings.
  erp: env.ERP ?? 'WRL',
  defaultBusinessUnit: env.DBU ?? '',
  qrSpecial: env.QR_SPECIAL ?? '',
  passwordKey: required('PASSWORD_AES_KEY'),
  sessionSecret: required('SESSION_SECRET'),
  sessionMinutes: Number(env.SESSION_MINUTES ?? 525600), // original sessionState timeout
  // the site's ~/GuideFiles folder (routing guides shown on the shop floor); point it at the old site's folder
  guideFilesDir: env.GUIDE_FILES_DIR ?? fileURLToPath(new URL('../../GuideFiles', import.meta.url)),
  // security (Phase 6)
  // Secure cookie: only sent over HTTPS. Default on in production; set COOKIE_SECURE=false while the plant serves HTTP.
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
  // behind IIS / a reverse proxy: the proxy's hop count or address list (Express "trust proxy"), so req.ip is the client
  trustProxy: env.TRUST_PROXY ?? false,
  loginMaxFailures: Number(env.LOGIN_MAX_FAILURES ?? 10), // per user ID; per client address 5x this
  loginWindowMinutes: Number(env.LOGIN_WINDOW_MINUTES ?? 15),
  // the original sign-in page showed "<server> <database>"; off unless asked for (it tells anyone where the data is)
  showDbOnLogin: env.SHOW_DB_ON_LOGIN === 'true',
  logFile: env.LOG_FILE ?? '', // also append request / error lines here (blank: console only)
};
