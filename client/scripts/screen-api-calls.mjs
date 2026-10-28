// A page's /api/forms calls -> screenApi(path) (lib/screenApi.js: the screen engine, or the screen's own API for the
// screens in API_SCREENS). Works on a one-file page, the page template, or a split page's three files; each call is
// swapped where the file has it. The generator runs it on every new page.
//   node scripts/screen-api-calls.mjs <file> ...
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SWAPS = [
  ["const r = await api('/forms/event', { method: 'POST', body: { path, control, values: next, viewState, arg, index, ui: uiOf(base) } });", 'const r = await screenApi(path).event({ control, values: next, viewState, arg, index, ui: uiOf(base) });'],
  ['api(`/forms/list?path=${enc(path)}&page=${page}${q}`)', 'screenApi(path).list(`&page=${page}${q}`)'],
  ['await api(`/forms/distinct?path=${enc(path)}&column=${enc(name)}`)', 'await screenApi(path).distinct(name)'],
  ["const r = await api('/forms/print', { method: 'POST', body: { path, values, printer } });", 'const r = await screenApi(path).print({ values, printer });'],
  ["const r = await api(`/forms/${kind}`, { method: 'POST', body: { path, values, viewState, ui: uiOf(controls), ...extra } });", 'const r = await screenApi(path).write(kind, { values, viewState, ui: uiOf(controls), ...extra });'],
  ['api(`/forms/record?path=${enc(path)}&key=${enc(key)}`)', 'screenApi(path).record(key)'],
  ['api(`/forms/copy?path=${enc(path)}&key=${enc(key)}`)', 'screenApi(path).copy(key)'],
  ['api(`/forms/spec?path=${enc(path)}`)', 'screenApi(path).spec()'],
];

export function useScreenApi(file) {
  let s = fs.readFileSync(file, 'utf8');
  const crlf = s.includes('\r\n');
  if (crlf) s = s.replace(/\r\n/g, '\n');
  let n = 0;
  for (const [a, b] of SWAPS) while (s.includes(a)) (s = s.replace(a, b)), n++;
  s = s.replace('sends the form to /forms/event; the reply is applied here.', "sends the form to the server (lib/screenApi.js: the engine or the screen's API); the reply is applied here.");
  // the import: screenApi where it is now used, api only while something still calls it
  const uses = (name) => new RegExp(`\\b${name}\\(`).test(s.replace(/^import .*$/gm, ''));
  if (uses('screenApi') && !/import \{ screenApi \}/.test(s)) s = s.replace(/^import \{ api \} from '@\/api\.js';$/m, uses('api') ? "import { api } from '@/api.js';\nimport { screenApi } from '@/lib/screenApi.js';" : "import { screenApi } from '@/lib/screenApi.js';");
  if (!uses('enc')) s = s.replace(/^const enc = encodeURIComponent;\n\n?/m, '');
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
  return n;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) for (const f of process.argv.slice(2)) console.log(`${f}: ${useScreenApi(f)} call(s) through screenApi`);
