// Builds form specs from the original pages that use TitleControl + TopPanel (the Avctions/ControlA engine):
// tables (TopPanel Tag), list key (ViewPanel Tag), every tagged control in document order with its type, ID, Tag,
// caption text, static ListItems and relevant attributes, the module ID given to Initialize_Form, TitleControl
// switches, and how much custom code-behind the page has.
// Usage: node scripts/extract-forms.mjs <Garuda web root> <menu.json> <out.json>
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { KEEP } from '../src/modules/menu/keep.js';

const [root, menuFile, out] = process.argv.slice(2);
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Tokenize tags, honouring quotes so SQL inside attributes (with < >) stays intact. */
function* tags(html) {
  let i = 0;
  while ((i = html.indexOf('<', i)) >= 0) {
    if (html.startsWith('<%', i)) {
      const e = html.indexOf('%>', i);
      i = e < 0 ? html.length : e + 2;
      continue;
    }
    let q = null;
    let j = i + 1;
    for (; j < html.length; j++) {
      const c = html[j];
      if (q) {
        if (c === q) q = null;
      } else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
    }
    const raw = html.slice(i, j + 1);
    const m = /^<(\/?)([\w:.-]+)/.exec(raw);
    if (m) {
      const attrs = {};
      for (const a of raw.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = decode(a[3] ?? a[4] ?? '');
      // text up to the next tag (for Label/ListItem/option inner text)
      const next = html.indexOf('<', j + 1);
      const text = decode(html.slice(j + 1, next < 0 ? html.length : next)).trim();
      yield { close: !!m[1], name: m[2].toLowerCase(), attrs, selfClose: raw.endsWith('/>'), text };
    }
    i = j + 1;
  }
}

const TYPES = {
  'asp:textbox': 'TextBox', 'asp:dropdownlist': 'DropDownList', 'asp:label': 'Label', 'asp:checkbox': 'CheckBox',
  'asp:checkboxlist': 'CheckBoxList', 'asp:gridview': 'GridView', 'asp:image': 'Image', 'asp:panel': 'Panel',
  'asp:button': 'Button', 'asp:treeview': 'TreeView', 'asp:listbox': 'ListBox', 'asp:radiobuttonlist': 'RadioButtonList',
  'asp:imagebutton': 'ImageButton', 'asp:fileupload': 'FileUpload',
};

const moduleIds = new Map();
(function walk(ns) {
  for (const n of ns) {
    if (n.url) moduleIds.set(n.url.toLowerCase(), n.moduleId);
    walk(n.children);
  }
})(JSON.parse(readFileSync(menuFile, 'utf8')));

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.toLowerCase().endsWith('.aspx')) files.push(p);
  }
})(join(root, 'View'));

const specs = {};
for (const file of files) {
  const html = readFileSync(file, 'utf8').replace(/<%--[\s\S]*?--%>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  if (!/TagName="TitleBar"[^>]*Src="~\/UserControl\/TitleControl\.ascx"|Src="~\/UserControl\/TitleControl\.ascx"[^>]*TagName="TitleBar"/i.test(html)) continue;
  const cs = existsSync(`${file}.cs`) ? readFileSync(`${file}.cs`, 'utf8') : '';
  const rel = relative(root, file).replace(/\\/g, '/');
  const spec = {
    file: rel,
    title: decode(/<%@\s*Page[^>]*\bTitle="([^"]*)"/i.exec(html)?.[1] ?? ''),
    inherits: /<%@\s*Page[^>]*\bInherits="([^"]*)"/i.exec(html)?.[1] ?? null, // the page class (code-behind)
    menuModuleId: moduleIds.get(rel.toLowerCase()) ?? null,
    formModuleId: Number(/Initialize_Form\([^;]*?,\s*(\d+)\s*\)\s*;/.exec(cs)?.[1] ?? 0),
    topPanelVisible: /Initialize_Form\([^,]+,\s*(topPanelVisible:\s*)?true/.test(cs),
    titleBar: {},
    top: null,
    view: null,
    controls: [],
    custom: {
      handlers: (cs.match(/Handler \+=|\.newhandler \+=/g) ?? []).length,
      events: Math.max(0, (cs.match(/protected void \w+\(object sender/g) ?? []).length - 1),
    },
  };
  let depth = 0; // nesting depth inside TopPanel
  let current = null; // control receiving ListItems / grid columns
  const panels = []; // ids of the panels open inside TopPanel (a control's parent is the innermost)
  for (const t of tags(html)) {
    if (t.name === 'tc:titlebar' && !t.close) {
      for (const k of ['addbutton', 'viewbutton', 'update', 'delete', 'copybutton', 'print', 'printer', 'postbutton', 'callnewonsave']) {
        if (k in t.attrs) spec.titleBar[k] = t.attrs[k].toLowerCase() === 'true';
      }
    }
    if (t.name === 'asp:panel' && !t.close && t.attrs.id === 'ViewPanel') spec.view = { tag: t.attrs.tag ?? '' };
    if (t.name === 'asp:panel' && !t.close && t.attrs.id === 'TopPanel') {
      spec.top = { tag: t.attrs.tag ?? '' };
      depth = 1;
      continue;
    }
    if (!depth) continue;
    if (t.name === 'asp:panel') {
      if (t.close) {
        depth--;
        panels.pop();
      } else if (!t.selfClose) {
        depth++;
        panels.push(t.attrs.id ?? null);
      }
      if (!depth) continue;
    }
    if (t.close) {
      if (current && TYPES[t.name] === current.type) current = null;
      continue;
    }
    if (t.name === 'asp:listitem' && current) {
      current.items.push({ value: t.attrs.value ?? t.text, text: t.text || t.attrs.text || t.attrs.value || '', selected: t.attrs.selected?.toLowerCase() === 'true' });
      continue;
    }
    if (current?.type === 'GridView' && (t.name === 'asp:boundfield' || t.name === 'asp:templatefield' || t.name === 'asp:commandfield')) {
      const cmd = t.name === 'asp:commandfield' ? { select: t.attrs.showselectbutton?.toLowerCase() === 'true', delete: t.attrs.showdeletebutton?.toLowerCase() === 'true' } : {};
      current.columns.push({ kind: t.name.slice(4), dataField: t.attrs.datafield ?? null, header: t.attrs.headertext ?? '', footer: t.attrs.footertext ?? '', ...cmd });
      continue;
    }
    const type = TYPES[t.name] ?? (/^(?!asp:)[a-z]+\d*:/.test(t.name) ? `UserControl:${t.name}` : null);
    if (!type) continue;
    const c = {
      type,
      id: t.attrs.id ?? null,
      tag: t.attrs.tag != null ? t.attrs.tag.split('|') : null,
      text: type === 'Label' || type === 'CheckBox' || type === 'Button' ? (t.attrs.text ?? t.text ?? '') : type === 'ImageButton' ? (t.attrs.alternatetext ?? t.attrs.tooltip ?? '') : undefined,
      attrs: Object.fromEntries(['title', 'textmode', 'readonly', 'enabled', 'visible', 'maxlength', 'autopostback', 'placeholder', 'rows', 'datakeynames', 'type', 'onclick', 'onselectedindexchanged', 'oncheckedchanged', 'ontextchanged'].filter((k) => k in t.attrs).map((k) => [k, t.attrs[k]])),
    };
    if (type === 'DropDownList' || type === 'CheckBoxList' || type === 'ListBox' || type === 'RadioButtonList') c.items = [];
    if (type === 'GridView') c.columns = [];
    // the panel a control sits in (inside TopPanel), for page code that shows/hides panels
    const parent = (type === 'Panel' && !t.selfClose ? panels.slice(0, -1) : panels).at(-1) ?? null;
    if (parent) c.parent = parent;
    // a control inside a GridView TemplateField: one per row (a TextBox bound to a column, a row-command Button)
    if (current?.type === 'GridView' && current.columns.at(-1)?.kind === 'templatefield') {
      current.columns.at(-1).template ??= { type, id: c.id, command: t.attrs.commandname ?? null, onclick: t.attrs.onclick ?? null, text: c.text ?? null, bind: /(?:Bind|Eval)\("(\w+)"\)/.exec(t.attrs.text ?? '')?.[1] ?? null };
      c.inGrid = current.id;
    }
    if (c.tag || type === 'GridView' || c.items || c.id) spec.controls.push(c);
    // (a list inside a grid's template is per row: the grid stays the control receiving columns)
    if (!t.selfClose && (c.items || c.columns) && !c.inGrid) current = c;
  }
  if (!spec.top) continue;
  const route = '/' + rel.replace(/^View\//i, '').replace(/\.aspx$/i, '').toLowerCase();
  // Page_Load assignments ("TitleControl.CopyButton = true;") run after the markup attributes
  for (const [, k, v] of cs.matchAll(/TitleControl\.(\w+)\s*=\s*(true|false)\s*;/g)) spec.titleBar[k.toLowerCase()] = v === 'true';
  if (KEEP.has(route)) specs[route] = spec; // shop-floor scope (src/data/menu/keep.js)
}
writeFileSync(out, JSON.stringify(specs, null, 1));
const n = Object.keys(specs).length;
const pure = Object.values(specs).filter((s) => !s.custom.handlers && !s.custom.events).length;
console.log(`${n} form specs (${pure} with no custom code-behind) -> ${out}`);
