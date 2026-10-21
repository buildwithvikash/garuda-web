// Builds the menu tree from the original Layout.Master so module IDs, captions and URLs stay identical.
// Usage: node scripts/extract-menu.mjs <Layout.Master> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out] = process.argv.slice(2);
const html = readFileSync(src, 'utf8').replace(/<%--[\s\S]*?--%>/g, '').replace(/<!--[\s\S]*?-->/g, '');

const token = /<asp:HyperLink\b([^>]*)>([\s\S]*?)<\/asp:HyperLink>|<ul\b[^>]*>|<\/ul>|<\/li>/gi;
const root = { children: [] };
const stack = [root];
let last = null; // hyperlink seen in the current <li>; a following <ul> makes it a parent

for (const m of html.matchAll(token)) {
  const tag = m[0].toLowerCase();
  if (tag.startsWith('<asp:hyperlink')) {
    const attrs = m[1];
    const id = /\bID="i(\d+)"/i.exec(attrs)?.[1];
    if (!id) continue;
    const url = /NavigateUrl="~\/([^"]+)"/i.exec(attrs)?.[1] ?? null;
    const icon = /ResolveUrl\("~\/([^"]+)"\)/.exec(m[2])?.[1] ?? null;
    const text = m[2].replace(/<%=[\s\S]*?%>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    last = { moduleId: Number(id), caption: text, url, icon, children: [] };
    stack.at(-1).children.push(last);
  } else if (tag.startsWith('<ul')) {
    stack.push(last ?? stack.at(-1));
    last = null;
  } else if (tag === '</ul>') {
    if (stack.length > 1) stack.pop();
    last = null;
  } else {
    last = null;
  }
}

const prune = (n) => ({ ...n, children: n.children.map(prune) });
const tree = root.children.map(prune);
const count = (ns) => ns.reduce((s, n) => s + 1 + count(n.children), 0);
writeFileSync(out, JSON.stringify(tree, null, 1));
console.log(`${count(tree)} menu items -> ${out}`);
