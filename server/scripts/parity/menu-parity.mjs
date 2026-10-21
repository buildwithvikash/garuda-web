// Read-only menu check per role: what the original shows (Layout.Master links + UserRoleForm) vs the new menu.
import { readFileSync } from 'node:fs';
import { query } from '../../src/db/index.js';
import { loadUserMenu } from '../../src/modules/menu/service.js';

const MENU = JSON.parse(readFileSync(new URL('../../src/modules/menu/menu.json', import.meta.url), 'utf8'));
const parentOf = new Map();
const byId = new Map();
(function walk(ns, p) {
  for (const n of ns) {
    byId.set(n.moduleId, n);
    parentOf.set(n.moduleId, p);
    walk(n.children, n.moduleId);
  }
})(MENU, null);

const flat = (ns) => ns.flatMap((n) => [n, ...flat(n.children)]);
const roles = await query('select UserRole, min(UserCode) UserCode, sum(case when SystemUser=1 then 1 else 0 end) sys, count(*) n from Users group by UserRole');
for (const r of roles) {
  const forms = await query('select ModuleId, Caption from UserRoleForm where RoleCode=@r', { r: r.UserRole });
  const ids = new Set(forms.map((f) => f.ModuleId));
  const inMarkup = [...ids].filter((id) => byId.has(id));
  const notInMarkup = [...ids].filter((id) => !byId.has(id));
  // Original: a link is visible if its ModuleId is in the role; a hidden parent makes its submenu unreachable by click.
  const orphans = inMarkup.filter((id) => {
    for (let p = parentOf.get(id); p != null; p = parentOf.get(p)) if (!ids.has(p)) return true;
    return false;
  });
  const m = await loadUserMenu(r.UserCode);
  const newVisible = new Set(flat(m.menu).map((n) => n.moduleId));
  const origReachable = inMarkup.filter((id) => !orphans.includes(id));
  const missing = origReachable.filter((id) => !newVisible.has(id));
  const extra = [...newVisible].filter((id) => !ids.has(id) && id !== 10000 && id !== 10001);
  console.log(
    `role ${r.UserRole} (${r.n} users, ${r.sys} system): role entries ${ids.size}, in menu markup ${inMarkup.length}, ` +
      `not in markup ${notInMarkup.length}, hidden-parent ${orphans.length} | new menu: missing ${missing.length}, extra ${extra.length}` +
      (m.systemUser ? ' [checked as system user: full menu]' : ''),
  );
  if (orphans.length) console.log(`   hidden-parent examples: ${orphans.slice(0, 5).map((id) => `${id} ${byId.get(id).caption}`).join('; ')}`);
  if (notInMarkup.length) console.log(`   not-in-markup examples: ${notInMarkup.slice(0, 5).join(', ')}`);
}
process.exit(0);
