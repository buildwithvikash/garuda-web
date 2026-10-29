// A page's `texts` block: every text the page shows, written in the page file to change there, each with `hidden` to
// take it off the page. The form and list views apply it (the server still gets every control as before).
//   texts.title          the page's title
//   texts.fields[id]     a field / button / panel: { label, hidden }
//   texts.grids[id]      a grid's columns: { dataField: { header, hidden } }
//   texts.list           the list's columns: { column: { header, hidden } }
// The block starts from what the page shows today: the screen's own texts (server/scripts/screen-texts.js, read from the
// database), with the page's layout labels, grid columns / headers, `layout.hide` and `page.labels` moved into it (so a
// text or a hide is in one place). Needs server/.env (it reads the screen as a signed-in parity user would).
//   node scripts/page-texts.mjs <page.jsx> ...     (a page that has a texts block already is left as it is)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { prettyHeader } from '../src/lib/headers.js';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../server');

/** the screen's texts as the server reads them */
function screenTexts(route) {
  const out = execFileSync(process.execPath, ['--env-file=.env', 'scripts/screen-texts.js', route], { cwd: SERVER, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out);
}

const q = (s) => `'${String(s).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : q(k));
const lit = (n) => (n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : undefined);
const prop = (obj, name) => obj?.properties?.find((p) => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === name);

/** the declaration `const <name> = …` at the top of the file */
const topConst = (ast, name) => ast.program.body.find((n) => n.type === 'VariableDeclaration' && n.declarations[0]?.id?.name === name);

export function addTexts(file) {
  let src = fs.readFileSync(file, 'utf8');
  const crlf = src.includes('\r\n');
  if (crlf) src = src.replace(/\r\n/g, '\n');
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'], attachComment: true });
  if (topConst(ast, 'texts')) return `${file}: has a texts block already (left as it is)`;
  const route = /export const route = ['"]([^'"]+)['"]/.exec(src)?.[1];
  if (!route) return `${file}: no route`;
  const pageDecl = topConst(ast, 'page');
  const layoutDecl = topConst(ast, 'layout');
  if (!pageDecl) return `${file}: no page settings`;
  const screen = screenTexts(route);
  const edits = []; // { from, to, text }

  // what the layout says: item labels, grid columns / headers, hidden ids; their props come out of the layout
  const labels = new Map();
  const gridHeaders = new Map();
  const gridColumns = new Map();
  const hidden = new Set();
  const layout = layoutDecl?.declarations[0].init;
  if (layout?.type === 'ObjectExpression') {
    const items = [];
    const take = (arr) => arr?.type === 'ArrayExpression' && items.push(...arr.elements.filter((e) => e?.type === 'ObjectExpression'));
    take(prop(layout, 'header')?.value);
    for (const sec of prop(layout, 'sections')?.value?.elements ?? []) {
      if (sec?.type !== 'ObjectExpression') continue;
      take(prop(sec, 'ids')?.value);
      take(prop(sec, 'actions')?.value);
    }
    for (const it of items) {
      const id = lit(prop(it, 'id')?.value);
      if (!id) continue;
      const moved = ['label', 'columns', 'headers'].map((n) => prop(it, n)).filter(Boolean);
      if (!moved.length) continue;
      const label = lit(prop(it, 'label')?.value);
      if (label !== undefined) labels.set(id, label);
      const cols = prop(it, 'columns')?.value;
      if (cols?.type === 'ArrayExpression') gridColumns.set(id, cols.elements.map(lit).filter(Boolean));
      const heads = prop(it, 'headers')?.value;
      if (heads?.type === 'ObjectExpression') gridHeaders.set(id, Object.fromEntries(heads.properties.map((p) => [p.key.name ?? p.key.value, lit(p.value)])));
      const kept = it.properties.filter((p) => !moved.includes(p));
      edits.push({ from: it.start, to: it.end, text: kept.length === 1 ? q(id) : `{ ${kept.map((p) => src.slice(p.start, p.end)).join(', ')} }` });
    }
    const hide = prop(layout, 'hide');
    if (hide?.value?.type === 'ArrayExpression') {
      for (const e of hide.value.elements) if (lit(e)) hidden.add(lit(e));
      const from = hide.leadingComments?.[0]?.start ?? hide.start;
      let to = hide.end;
      if (src[to] === ',') to++;
      edits.push({ from: src.lastIndexOf('\n', from - 1) + 1, to: src[to] === '\n' ? to + 1 : to, text: '  // hidden fields: texts.fields (hidden: true)\n' });
    }
  }
  const page = pageDecl.declarations[0].init;
  const pageLabels = prop(page, 'labels');
  if (pageLabels?.value?.type === 'ObjectExpression') {
    for (const p of pageLabels.value.properties) labels.set(p.key.name ?? p.key.value, labels.get(p.key.name ?? p.key.value) ?? lit(p.value));
    let to = pageLabels.end;
    while (src[to] === ',' || src[to] === ' ') to++;
    edits.push({ from: pageLabels.start, to, text: '' });
  }

  // the texts block, after the page settings
  const lines = [];
  lines.push('');
  lines.push('// ────────────────────────────────────────────────────────────────────────────');
  lines.push('// TEXTS');
  lines.push("// Every text this page shows: change one here; `hidden: true` takes it off the page (the screen's logic still has it).");
  lines.push('// Written from the screen (scripts/page-texts.mjs); the layout above places the fields.');
  lines.push('// ────────────────────────────────────────────────────────────────────────────');
  lines.push('const texts = {');
  lines.push(`  title: ${q(screen.title)},`);
  lines.push('  // fields, buttons and panels: { label, hidden }');
  lines.push('  fields: {');
  for (const f of screen.fields) {
    // a grid's label is its step's title, shown readable ("BOMInput" -> "BOM Input"): written as it shows
    const label = labels.get(f.id) ?? (f.type === 'GridView' ? prettyHeader(f.label) : f.label);
    const note = [f.type, f.where, f.screenHidden ? 'hidden by the screen until its logic shows it' : ''].filter(Boolean).join(' · ');
    lines.push(`    ${key(f.id)}: { label: ${q(label)}, hidden: ${hidden.has(f.id)} }, // ${note}`);
  }
  lines.push('  },');
  lines.push("  // grids: each one's columns { header, hidden } (its rows keep every field)");
  lines.push('  grids: {');
  for (const [id, cols] of Object.entries(screen.grids)) {
    lines.push(`    ${key(id)}: {`);
    const keep = gridColumns.get(id);
    const heads = gridHeaders.get(id) ?? {};
    for (const c of cols) lines.push(`      ${key(c.field)}: { header: ${q(heads[c.field] ?? c.header)}, hidden: ${keep ? !keep.includes(c.field) : false} },`);
    lines.push('    },');
  }
  lines.push('  },');
  if (screen.list.length) {
    lines.push('  // the list of saved records: its columns { header, hidden } (RECNO is the # column)');
    lines.push('  list: {');
    for (const c of screen.list) lines.push(`    ${key(c)}: { header: ${q(prettyHeader(c))}, hidden: false },`);
    lines.push('  },');
  }
  lines.push('};');
  edits.push({ from: pageDecl.end, to: pageDecl.end, text: `\n${lines.join('\n')}` });

  // the page uses it: title, the list, the form
  // (a page whose list is its own, e.g. a history, has no RecordList line: its list texts are not used)
  // (the title in either quote style; a page whose list is its own, e.g. a history, has no RecordList line)
  const wire = [
    ["const title = spec?.title || screen?.caption || 'Screen';", "const title = texts.title || spec?.title || screen?.caption || 'Screen';", 'title'],
    ['const title = spec?.title || screen?.caption || "Screen";', 'const title = texts.title || spec?.title || screen?.caption || "Screen";', 'title'],
    ['<RecordList path={path} spec={spec} onOpen={open} filter={listFilter} />', '<RecordList path={path} spec={spec} onOpen={open} filter={listFilter} texts={texts} />', 'optional'],
    ['            page={page}\n', '            page={{ ...page, texts }}\n'],
  ];
  for (const [a, b, kind] of wire) {
    const at = src.indexOf(a);
    if (at < 0 && kind) continue;
    if (at < 0) return `${file}: cannot wire "${a.trim().slice(0, 40)}…" (changed by hand?): nothing written`;
    edits.push({ from: at, to: at + a.length, text: b });
  }
  if (!wire.some(([a, , kind]) => kind === 'title' && src.includes(a))) return `${file}: cannot wire the title (changed by hand?): nothing written`;

  for (const e of edits.sort((x, y) => y.from - x.from)) src = src.slice(0, e.from) + e.text + src.slice(e.to);
  if (pageDecl && /const page = undefined;/.test(src)) src = src.replace('const page = undefined;', 'const page = {};');
  fs.writeFileSync(file, crlf ? src.replace(/\n/g, '\r\n') : src);
  return `${file}: ${screen.fields.length} fields, ${Object.keys(screen.grids).length} grids, ${screen.list.length} list columns${labels.size || hidden.size ? ` (${labels.size} labels, ${hidden.size} hidden from the layout)` : ''}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  for (const f of process.argv.slice(2)) {
    try {
      console.log(addTexts(f));
    } catch (e) {
      console.log(`${f}: ${e.message}`);
    }
  }
}
