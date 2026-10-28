// Creates a page file for every sidebar tab that does not have one yet.
//
//   One page:        npm run page -- /production/productionguideform "Production Guide"
//   Every menu tab:  npm run pages:sync            (reads ./menu.json)
//
// menu.json is the menu the server gives the signed-in user. To get it, sign in to the app, open the browser
// console (F12) and run:   copy(JSON.stringify((await (await fetch('/api/auth/me')).json()).menu))
// then paste into a file named menu.json in the project root. Run the sync again whenever tabs are added.
//
// A page is  src/pages/<group>/<PageName>.jsx  (group = first part of the route) with its views beside it in
// <PageName>/List.jsx (saved records) and <PageName>/Form.jsx (create / update; the state and server calls it uses).
// Existing files are never touched. A new page is COMPLETE in those three files, so you can change it without touching
// any other. Only the UI components (@/components/ui, @/components/shared) are shared.
import fs from 'node:fs';
import path from 'node:path';
import { splitPage } from './split-page.mjs';
import { designForm } from './form-design.mjs';

const PAGES = path.resolve('src/pages');
const HIDDEN_GROUP = 10000; // not shown in the sidebar
const HIDDEN_ITEM = 10001;

const pascal = (s) =>
  s
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

function existingRoutes() {
  const found = new Map();
  for (const g of fs.existsSync(PAGES) ? fs.readdirSync(PAGES, { withFileTypes: true }) : []) {
    if (!g.isDirectory() || g.name.startsWith('_')) continue;
    for (const f of fs.readdirSync(path.join(PAGES, g.name))) {
      if (!f.endsWith('.jsx')) continue;
      const m = /export\s+const\s+route\s*=\s*['"`]([^'"`]+)['"`]/.exec(fs.readFileSync(path.join(PAGES, g.name, f), 'utf8'));
      if (m) found.set(m[1].toLowerCase(), path.join(g.name, f));
    }
  }
  return found;
}

// The complete page (the same code as every other page): scripts/templates/engine-page.jsx.tpl
const TEMPLATE = path.resolve('scripts/templates/engine-page.jsx.tpl');
const template = (name, caption, group, route) =>
  fs
    .readFileSync(TEMPLATE, 'utf8')
    .replaceAll('__NAME__', name)
    .replaceAll('__CAPTION__', caption)
    .replaceAll('__GROUP__', group)
    .replaceAll('__ROUTE__', route);

function create({ route, caption, groupCaption }, known) {
  route = route.toLowerCase();
  if (known.has(route)) return { status: 'exists', file: known.get(route) };
  const segs = route.split('/').filter(Boolean);
  const group = (segs[0] ?? 'misc').replace(/[^a-z0-9]/g, '');
  const dir = path.join(PAGES, group);
  fs.mkdirSync(dir, { recursive: true });
  let name = pascal(caption) || pascal(segs.at(-1));
  if (/^\d/.test(name)) name = `Page${name}`;
  let file = path.join(dir, `${name}.jsx`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${name}${i}.jsx`);
  const comp = path.basename(file, '.jsx');
  fs.writeFileSync(file, template(comp, caption, groupCaption ?? pascal(group), route));
  designForm(splitPage(file).form); // the template is one file: kept as page + List + Form, in the shared form design
  known.set(route, path.relative(PAGES, file));
  return { status: 'created', file: path.relative(PAGES, file) };
}

function flatten(nodes, trail = []) {
  return (nodes ?? []).flatMap((n) => [
    ...(n.route && n.moduleId !== HIDDEN_ITEM ? [{ route: n.route, caption: n.caption, groupCaption: trail[0] }] : []),
    ...flatten(n.children, [...trail, n.caption]),
  ]);
}

const [, , a, b] = process.argv;
const known = existingRoutes();

if (a === '--menu') {
  const file = b ?? 'menu.json';
  if (!fs.existsSync(file)) {
    console.error(`${file} not found. See the instructions at the top of scripts/pages.mjs.`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const menu = (Array.isArray(raw) ? raw : raw.menu).filter((n) => n.moduleId !== HIDDEN_GROUP);
  let created = 0;
  for (const item of flatten(menu)) {
    const r = create(item, known);
    if (r.status === 'created') {
      created++;
      console.log(`+ src/pages/${r.file}   (${item.route})`);
    }
  }
  console.log(created ? `\nCreated ${created} page file(s).` : 'Every tab already has a page file.');
} else if (a) {
  const route = a;
  const caption = b ?? pascal(route.split('/').filter(Boolean).at(-1) ?? 'Page');
  const r = create({ route, caption }, known);
  console.log(r.status === 'created' ? `+ src/pages/${r.file}` : `Already exists: src/pages/${r.file}`);
} else {
  console.log('Usage:\n  npm run page -- /group/someform "Caption"\n  npm run pages:sync');
}
