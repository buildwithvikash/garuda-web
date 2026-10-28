// Splits a one-file engine page (src/pages/<group>/<Page>.jsx with the sections 1. SETTINGS, 2. STATE, 3. ENGINE,
// 4. LIST VIEW, 5. FORM VIEW, 6. PAGE) into
//   <Page>.jsx        1. SETTINGS + 6. PAGE: the route, this page's layout, loading the screen, switching list / form
//   <Page>/List.jsx   4. LIST VIEW: the saved records
//   <Page>/Form.jsx   2. STATE + 3. ENGINE + 5. FORM VIEW: create / update one record (and settings pieces only the form
//                     uses, e.g. a custom step header)
// The pages plugin routes <Page>.jsx only (it reads src/pages/<group>/*.jsx), so the folder needs no registration.
// Each file keeps only the imports it uses. Code is moved, not changed.
//   node scripts/split-page.mjs src/pages/<group>/<Page>.jsx [...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const SECTION = /^\/\/ ─+\r?\n\/\/ (\d)\. ([A-Z ]+)$/gm;
const KEEP_IN_PAGE = new Set(['route', 'layout', 'page']);

/** names a top-level statement declares */
function declared(node) {
  const d = node.type.startsWith('Export') && node.declaration ? node.declaration : node;
  if (d.type === 'VariableDeclaration') return d.declarations.map((x) => x.id.name).filter(Boolean);
  if (d.id?.name) return [d.id.name];
  return [];
}
const words = (code) => new Set(code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').match(/[A-Za-z_$][\w$]*/g) ?? []);

/** the import declarations a piece of code needs (specifiers it does not use dropped; relative paths moved down a folder) */
function importsFor(imports, code, deeper) {
  const used = words(code);
  const out = [];
  for (const imp of imports) {
    const def = imp.specifiers.find((s) => s.type === 'ImportDefaultSpecifier');
    const ns = imp.specifiers.find((s) => s.type === 'ImportNamespaceSpecifier');
    const named = imp.specifiers.filter((s) => s.type === 'ImportSpecifier' && used.has(s.local.name));
    const parts = [];
    if (def && used.has(def.local.name)) parts.push(def.local.name);
    if (ns && used.has(ns.local.name)) parts.push(`* as ${ns.local.name}`);
    if (named.length) parts.push(`{ ${named.map((s) => (s.imported.name === s.local.name ? s.local.name : `${s.imported.name} as ${s.local.name}`)).join(', ')} }`);
    if (!imp.specifiers.length) parts.push(null); // a side-effect import: kept as it is
    if (!parts.length) continue;
    let src = imp.source.value;
    if (deeper && src.startsWith('.')) src = `../${src}`;
    const q = imp.source.extra?.raw?.[0] ?? "'";
    out.push(parts[0] === null ? `import ${q}${src}${q};` : `import ${parts.join(', ')} from ${q}${src}${q};`);
  }
  return out.join('\n');
}

export function splitPage(file) {
  const abs = path.resolve(file);
  let src = fs.readFileSync(abs, 'utf8');
  const crlf = src.includes('\r\n');
  if (crlf) src = src.replace(/\r\n/g, '\n');
  const marks = [...src.matchAll(SECTION)].map((m) => ({ n: Number(m[1]), at: m.index }));
  if (marks.map((m) => m.n).join('') !== '123456') throw new Error(`${file}: not a one-file engine page (sections ${marks.map((m) => m.n).join(',') || 'none'})`);
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const body = ast.program.body;
  const imports = body.filter((n) => n.type === 'ImportDeclaration');
  const banner = src.slice(0, imports[0].start).trimEnd(); // the file's top comment (Babel counts it as the first import's)
  const part = (n) => src.slice(marks[n - 1].at, n < 6 ? marks[n].at : src.length);
  const name = path.basename(abs, '.jsx');
  const dir = path.join(path.dirname(abs), name);

  // settings pieces that are not the page's settings (e.g. a form's step header) go with the form
  const settingsStart = marks[0].at;
  const settingsEnd = marks[1].at;
  let settings = part(1);
  let formExtras = '';
  const extras = body.filter((n) => n.start >= settingsStart && n.end <= settingsEnd && n.type !== 'ImportDeclaration' && declared(n).length && !declared(n).some((x) => KEEP_IN_PAGE.has(x)));
  for (const n of [...extras].reverse()) {
    const from = n.leadingComments?.length ? n.leadingComments[0].start : n.start;
    const text = src.slice(from, n.end);
    formExtras = `${text}\n\n${formExtras}`;
    settings = settings.replace(text, '');
  }
  settings = settings.replace(/\n{3,}/g, '\n\n');

  const formCode = `${formExtras}${part(2)}${part(3)}${part(5)}`;
  const listCode = part(4);
  const pageCode = `${settings}${part(6)}`;
  // what the list and the page use of the form file's own names (besides the form itself)
  const formNames = body.filter((n) => (n.start >= marks[1].at && n.start < marks[3].at) || (n.start >= marks[4].at && n.start < marks[5].at) || extras.includes(n)).flatMap(declared);
  const need = (code) => formNames.filter((x) => x !== 'RecordForm' && x !== 'enc' && words(code).has(x));
  const fromForm = [...new Set([...need(listCode), ...need(pageCode)])];
  const enc = (code) => (/\benc\(/.test(code) && !/const enc = /.test(code) ? 'const enc = encodeURIComponent;\n\n' : '');

  const form = [
    `// ${name}: the form view (create / update one record), with the state and engine only it uses.`,
    `// The page (../${name}.jsx) opens it with the screen's state; the list is ./List.jsx.`,
    '',
    importsFor(imports, formCode, true),
    '',
    enc(formCode) + formCode.trimEnd(),
    '',
    `export default RecordForm;${fromForm.length ? `\nexport { ${fromForm.join(', ')} };` : ''}`,
    '',
  ].join('\n');
  const listUses = need(listCode);
  const list = [
    `// ${name}: the list view (the saved records). The page (../${name}.jsx) shows it; a row opens the form (./Form.jsx).`,
    '',
    importsFor(imports, listCode, true),
    ...(listUses.length ? [`import { ${listUses.join(', ')} } from './Form.jsx';`] : []),
    '',
    enc(listCode) + listCode.trimEnd(),
    '',
    'export default RecordList;',
    '',
  ].join('\n');
  const pageUses = need(pageCode);
  const pageImports = [importsFor(imports, pageCode, false), `import RecordList from './${name}/List.jsx';`, `import RecordForm${pageUses.length ? `, { ${pageUses.join(', ')} }` : ''} from './${name}/Form.jsx';`].join('\n');
  const w = `${name}/List.jsx`.length + 3;
  const row = (file, text) => `//    ${file.padEnd(w)}${text}`;
  const map = [
    '//  This page is three files (the router opens this one; the folder beside it holds the views):',
    row(`${name}.jsx`, "1. SETTINGS   this page's layout and captions          <- start here"),
    row('', '6. PAGE       loads the screen and switches between list and form'),
    row(`${name}/List.jsx`, '4. LIST VIEW  saved records: search, table, paging'),
    row(`${name}/Form.jsx`, "2. STATE      how the form's state is read and patched"),
    row('', '3. ENGINE     sends events to the server and applies its reply'),
    row('', '5. FORM VIEW  one record: fields, buttons, grids, print ...'),
  ].join('\n');
  const head = banner
    .replace(/\/\/  Map of this file\n(\/\/ {4}\d\..*\n?)+/, `${map}\n`)
    .replace('THIS FILE IS THE WHOLE PAGE. Change how it works or looks right here: nothing in this\n//  file is used by any other page.', 'Change how this page works or looks in its three files: nothing in them is used by\n//  any other page.')
    .replace('Change how it works or looks right here: nothing in this\n//  file is used by any other page.', 'Change how it works or looks in its three files: nothing in them\n//  is used by any other page.');
  const page = [head, '', pageImports, '', enc(pageCode) + pageCode.trimEnd(), ''].join('\n');

  fs.mkdirSync(dir, { recursive: true });
  const write = (f, text) => fs.writeFileSync(f, crlf ? text.replace(/\n/g, '\r\n') : text);
  write(path.join(dir, 'Form.jsx'), form);
  write(path.join(dir, 'List.jsx'), list);
  write(abs, page);
  return { page: abs, list: path.join(dir, 'List.jsx'), form: path.join(dir, 'Form.jsx') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const f of process.argv.slice(2)) {
    const r = splitPage(f);
    console.log(`split ${path.relative(process.cwd(), r.page)} -> ${path.basename(path.dirname(r.list))}/List.jsx, Form.jsx`);
  }
}
