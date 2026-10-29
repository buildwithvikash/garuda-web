// Gives a screen's Form.jsx the Production Order design (components/shared/FormStep.jsx): numbered steps (its own
// layout, or autoLayout()), read-only fields locked, Back / record status / Save in the page header's slot.
// The generator (scripts/pages.mjs) runs it on every new page; run it by hand on a Form.jsx made the old way.
// Usage (from client/): node scripts/form-design.mjs src/pages/<group>/<Page>/Form.jsx ...
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('package.json'));
const { parse } = require('@babel/parser');
const here = path.dirname(fileURLToPath(import.meta.url));
const STEPS = fs.readFileSync(path.join(here, 'templates/form-steps.jsx.txt'), 'utf8');
const RETURN = fs.readFileSync(path.join(here, 'templates/form-return.jsx.txt'), 'utf8');

const ADD = {
  react: ['useEffect', 'useId', 'useState'],
  'react-dom': ['createPortal'],
  'lucide-react': ['ArrowLeft', 'Boxes', 'ClipboardCheck', 'ClipboardList', 'Copy', 'Printer', 'Save', 'Send', 'SlidersHorizontal', 'Trash2'],
  '@/components/shared/FormStep.jsx': ['LockedField', 'STEP_COLS', 'STEP_SPAN', 'Step', 'TONE_CYCLE'],
  '@/components/shared/DataTable.jsx': ['prettyHeader'],
  '@/lib/utils': ['cn'],
};
const DROP_LOCAL = new Set(['TONES', 'Step', 'LockedField']); // Production Order's own copies, now shared

const words = (code) => new Set(code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').match(/[A-Za-z_$][\w$]*/g) ?? []);
const startOf = (n) => (n.leadingComments?.length ? n.leadingComments[0].start : n.start);

export function designForm(file) {
  let src = fs.readFileSync(file, 'utf8');
  const crlf = src.includes('\r\n');
  if (crlf) src = src.replace(/\r\n/g, '\n');
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const body = ast.program.body;
  const rf = body.find((n) => n.type === 'FunctionDeclaration' && n.id?.name === 'RecordForm');
  if (!rf) throw new Error(`${file}: no RecordForm`);
  const inner = rf.body.body;
  const fn = (name) => inner.find((n) => n.type === 'FunctionDeclaration' && n.id?.name === name);
  const decl = (name) => inner.find((n) => n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id.name === name));
  const ret = [...inner].reverse().find((n) => n.type === 'ReturnStatement');
  const sections = fn('sections');
  const one = fn('one');
  if (!ret || !sections || !one) throw new Error(`${file}: RecordForm without sections() / one() / return`);
  const del = /\{\s*false\s*&&\s*mode\s*===\s*['"]edit['"]/.test(src.slice(rf.start, rf.end)) ? 'false && ' : '';

  // edits, applied from the end of the file backwards
  const edits = [];
  edits.push({ from: startOf(ret), to: ret.end, text: RETURN.trimEnd() });
  edits.push({ from: startOf(sections), to: sections.end, text: STEPS.replace('__DELETE__', del).trimEnd() });
  for (const name of ['itemsOf', 'bar', 'L']) {
    const d = decl(name);
    if (d && !(d.start > startOf(sections) && d.end < sections.end)) edits.push({ from: startOf(d), to: d.end, text: '' });
  }
  for (const name of ['slot']) {
    const d = inner.find((n) => n.type === 'VariableDeclaration' && n.declarations.some((x) => x.id.type === 'ArrayPattern' && x.id.elements[0]?.name === name));
    if (d) edits.push({ from: startOf(d), to: d.end, text: '' });
  }
  const oneBody = src.slice(one.body.start, one.body.end);
  if (!oneBody.includes('LockedField')) edits.push({ from: one.body.start + 1, to: one.body.start + 1, text: "\n    if (c.type === 'TextBox' && c.readOnly) return <LockedField key={c.id} c={c} label={l} value={values[c.id]} />;" });
  if (!src.slice(rf.start, rf.end).includes('formId = useId()')) edits.push({ from: rf.body.start + 1, to: rf.body.start + 1, text: "\n  const formId = useId();\n  // the page's texts (its settings: labels, grid headers, `hidden`), over what the screen gives\n  const texts = page.texts ?? {};\n  const hiddenIds = useMemo(() => new Set(Object.entries(texts.fields ?? {}).filter(([, t]) => t?.hidden).map(([id]) => id)), [texts]);" });
  for (const n of body) {
    const names = n.type === 'VariableDeclaration' ? n.declarations.map((d) => d.id.name) : n.type === 'FunctionDeclaration' ? [n.id.name] : [];
    if (names.length && names.every((x) => DROP_LOCAL.has(x))) edits.push({ from: startOf(n), to: n.end, text: '' });
  }
  edits.sort((a, b) => b.from - a.from);
  for (let i = 1; i < edits.length; i++) if (edits[i].to > edits[i - 1].from) throw new Error(`${file}: overlapping edits`);
  let out = src;
  for (const e of edits) out = out.slice(0, e.from) + e.text + out.slice(e.to);

  // imports: the file's own plus what the design needs, keeping only the names the code uses
  const imports = body.filter((n) => n.type === 'ImportDeclaration');
  const firstImport = imports[0].start;
  const lastImport = imports.at(-1).end;
  if (edits.some((e) => e.from < lastImport)) throw new Error(`${file}: an edit inside the imports`);
  const rest = out.slice(lastImport); // the code after the imports (every edit is after them)
  const used = words(rest);
  const bySource = new Map();
  for (const imp of imports) {
    const e = bySource.get(imp.source.value) ?? { def: null, ns: null, named: [], q: imp.source.extra?.raw?.[0] ?? "'" };
    for (const s of imp.specifiers) {
      if (s.type === 'ImportDefaultSpecifier') e.def = s.local.name;
      else if (s.type === 'ImportNamespaceSpecifier') e.ns = s.local.name;
      else if (!e.named.some((x) => x.local === s.local.name)) e.named.push({ imported: s.imported.name, local: s.local.name });
    }
    bySource.set(imp.source.value, e);
  }
  const q = bySource.values().next().value?.q ?? "'";
  for (const [source, names] of Object.entries(ADD)) {
    const e = bySource.get(source) ?? { def: null, ns: null, named: [], q };
    for (const nme of names) if (!e.named.some((x) => x.local === nme)) e.named.push({ imported: nme, local: nme });
    bySource.set(source, e);
  }
  const lines = [];
  for (const [source, e] of bySource) {
    const parts = [];
    if (e.def && used.has(e.def)) parts.push(e.def);
    if (e.ns && used.has(e.ns)) parts.push(`* as ${e.ns}`);
    const named = e.named.filter((x) => used.has(x.local));
    if (named.length) parts.push(`{ ${named.map((x) => (x.imported === x.local ? x.local : `${x.imported} as ${x.local}`)).join(', ')} }`);
    if (parts.length) lines.push(`import ${parts.join(', ')} from ${e.q}${source}${e.q};`);
  }
  out = out.slice(0, firstImport) + lines.join('\n') + rest;
  out = out.replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out);
  return del ? 'Delete hidden (as before)' : 'Delete shown (as before)';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) for (const f of process.argv.slice(2)) console.log(`${f}: ${designForm(f)}`);
