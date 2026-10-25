// Cross-cutting HTTP pieces: security headers, request IDs with one log line per API call, and the log itself.
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, readFileSync } from 'node:fs';
import { config } from '../config.js';

/** console, and the log file when LOG_FILE is set (a failed write never breaks a request) */
export function log(level, line) {
  const text = `${new Date().toISOString()} ${level.toUpperCase()} ${line}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(text);
  if (config.logFile) appendFile(config.logFile, `${text}\n`, () => {});
}

/** sha256 sources for the inline <script>s of the built index.html (the dark-mode pre-paint), for script-src */
function inlineScriptHashes(indexHtml) {
  try {
    const html = readFileSync(indexHtml, 'utf8');
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  } catch {
    return []; // no build yet (development uses Vite's own server)
  }
}

/** Security headers on every response. The CSP is report-only unless CSP=enforce (CSP=off: none). */
export function securityHeaders(indexHtml) {
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(indexHtml).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // React style attributes, Google Fonts css
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:", // QC photos and logos arrive as data URLs
    "connect-src 'self'",
    "frame-src 'self' https://sharecad.org http://sharecad.org", // guide files: PDFs here, drawings in sharecad's viewer
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
  const mode = (process.env.CSP ?? 'report').toLowerCase();
  const cspHeader = mode === 'enforce' ? 'Content-Security-Policy' : mode === 'off' ? null : 'Content-Security-Policy-Report-Only';
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (cspHeader) res.setHeader(cspHeader, csp);
    if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    next();
  };
}

/** X-Request-Id on every response; one line per /api call: id, method, path (no query), status, time, user */
export function requestLog(req, res, next) {
  req.id = randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  // the full path now: routers rewrite req.path while they handle the request
  const path = req.path;
  if (!path.startsWith('/api/')) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const user = req.session?.userId ? ` user=${req.session.userId}` : '';
    log(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', `${req.id} ${req.method} ${path} ${res.statusCode} ${ms.toFixed(0)}ms${user}`);
  });
  next();
}
