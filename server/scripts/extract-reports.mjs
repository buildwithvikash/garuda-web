// Builds report specs from the original pages that use ReportControl / ReportControlTime / ReportControlAdv:
// the ReportPanel "Tag" (SQL|BU condition|date field|department or filter|GROUP BY|ORDER BY or total) and page title.
// Usage: node scripts/extract-reports.mjs <Garuda web root> <menu.json> <out.json>
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const [root, menuFile, out] = process.argv.slice(2);
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// The SQL inside Tag contains ">" and "<BU>", so find the end of the tag by scanning outside quoted values.
function openingTag(html, start, id) {
  for (const m of html.matchAll(start)) {
    let quote = null;
    for (let i = m.index; i < html.length; i++) {
      const c = html[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '>') {
        const tag = html.slice(m.index, i + 1);
        if (new RegExp(`\\bID="${id}"`, 'i').test(tag)) return tag;
        break;
      }
    }
  }
  return null;
}

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.toLowerCase().endsWith('.aspx')) files.push(p);
  }
})(join(root, 'View'));

const moduleIds = new Map();
(function walk(ns) {
  for (const n of ns) {
    if (n.url) moduleIds.set(n.url.toLowerCase(), n.moduleId);
    walk(n.children);
  }
})(JSON.parse(readFileSync(menuFile, 'utf8')));

const specs = {};
for (const file of files) {
  const html = readFileSync(file, 'utf8').replace(/<%--[\s\S]*?--%>/g, '');
  const src = /<%@\s*Register[^>]*Src="~\/UserControl\/(ReportControl(?:Time|Adv)?)\.ascx"/i.exec(html)?.[1];
  if (!src) continue;
  const panel = openingTag(html, /<asp:Panel\b/gi, 'ReportPanel');
  const tagAttr = panel && /\bTag="([^"]*)"/i.exec(panel)?.[1];
  if (tagAttr == null) continue;
  const rel = relative(root, file).replace(/\\/g, '/');
  const title = decode(/<%@\s*Page[^>]*\bTitle="([^"]*)"/i.exec(html)?.[1] ?? '');
  const route = '/' + rel.replace(/^View\//i, '').replace(/\.aspx$/i, '').toLowerCase();
  specs[route] = {
    file: rel,
    title,
    variant: { ReportControl: 'date', ReportControlTime: 'time', ReportControlAdv: 'adv' }[src],
    moduleId: moduleIds.get(rel.toLowerCase()) ?? null,
    tag: decode(tagAttr).split('|'),
  };
}
writeFileSync(out, JSON.stringify(specs, null, 1));
console.log(`${Object.keys(specs).length} report specs -> ${out}`);
