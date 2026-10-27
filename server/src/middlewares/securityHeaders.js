// Security headers on every response, the CSP allowing the built page's own inline script by its hash.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from '../config/env.js';

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
