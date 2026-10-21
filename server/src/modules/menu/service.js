// Port of AVLogin.GetDefaultForm / GetUserForms: the menu tree is Layout.Master (menu.json);
// UserRoleForm decides which entries a non-system user sees and overrides their captions.
import { readFileSync } from 'node:fs';
import { authRepo } from '../auth/repo.js';
import { netString, netBool } from '../../lib/net.js';
import { KEEP } from './keep.js';

const ALWAYS = new Set([10000, 10001]); // Logout group + link
// shop-floor scope: entries for kept screens, the folders that hold them, and Logout
const prune = (nodes) =>
  nodes.flatMap((n) => {
    const children = prune(n.children);
    return ALWAYS.has(n.moduleId) || KEEP.has(routeFor(n.url)) || children.length ? [{ ...n, children }] : [];
  });
const MENU = prune(JSON.parse(readFileSync(new URL('./menu.json', import.meta.url), 'utf8')));

/** Original page path ("View/X/Y.aspx") -> React route ("/x/y"). */
export function routeFor(url) {
  if (!url) return null;
  return '/' + url.replace(/^View\//i, '').replace(/\.aspx$/i, '').split('/').map((s) => s.toLowerCase()).join('/');
}

function shape(nodes, allowed, captions) {
  const out = [];
  for (const n of nodes) {
    if (allowed && !allowed.has(n.moduleId) && !ALWAYS.has(n.moduleId)) continue; // hidden parent hides its submenu
    out.push({
      moduleId: n.moduleId,
      caption: captions?.get(n.moduleId) ?? n.caption,
      route: n.moduleId === 10001 ? '/login' : routeFor(n.url),
      icon: n.icon,
      children: shape(n.children, allowed, captions),
    });
  }
  return out;
}

const cache = new Map(); // userCode -> { systemUser, allowed:Set|null, menu, defaultRoute, user }

/** Loads (or reloads after login) a user's menu and permissions. */
export async function loadUserMenu(userCode, repo = authRepo) {
  const users = await repo.userForMenu(userCode);
  const forms = await repo.roleForms(userCode);
  const user = users[0] ?? null;
  const systemUser = !user || netBool(user.SystemUser);

  let entry;
  if (systemUser) {
    // Original returns early for system users: every menu entry stays visible, no default page.
    entry = { systemUser: true, allowed: null, menu: shape(MENU, null, null), defaultRoute: null };
  } else {
    const allowed = new Set(forms.map((f) => Number(f.ModuleID ?? f.ModuleId)));
    const captions = new Map(forms.map((f) => [Number(f.ModuleID ?? f.ModuleId), netString(f.Caption)]));
    const menu = shape(MENU, allowed, captions);
    const flat = [];
    const walk = (ns) => ns.forEach((n) => (flat.push(n), walk(n.children)));
    walk(menu);
    const def = flat.find((n) => String(n.moduleId) === netString(user.DefaultForm));
    entry = { systemUser: false, allowed, menu, defaultRoute: def?.route ?? null };
  }
  // WrapperAvatar.FillUserForms ("Search the Menus"): every UserRoleForm entry of the role that has a page,
  // including entries whose parent menu is not granted (reachable only through search in the original).
  // System users: the original listed their role's entries (usually none); here they search the full menu.
  const trails = new Map();
  (function walk(ns, trail) {
    for (const n of ns) {
      if (n.url && n.moduleId !== 10001) trails.set(n.moduleId, { route: routeFor(n.url), trail: [...trail, n.caption].join(' › ') });
      walk(n.children, [...trail, n.caption]);
    }
  })(MENU, []);
  entry.search = systemUser
    ? [...trails].map(([moduleId, t]) => ({ moduleId, caption: t.trail.split(' › ').at(-1), ...t }))
    : forms
        .filter((f) => trails.has(Number(f.ModuleID ?? f.ModuleId)))
        .map((f) => {
          const moduleId = Number(f.ModuleID ?? f.ModuleId);
          return { moduleId, caption: netString(f.Caption), ...trails.get(moduleId) };
        });
  entry.user = user && {
    userName: netString(user.UserName),
    photo: Buffer.isBuffer(user.Photo) && user.Photo.length ? `data:image/png;base64,${user.Photo.toString('base64')}` : null,
  };
  cache.set(String(userCode), entry);
  return entry;
}

export async function userMenu(userCode) {
  return cache.get(String(userCode)) ?? loadUserMenu(userCode);
}

/** True when the user's role grants the module (server-side check the original did not have; decision S2). */
export async function canOpen(userCode, moduleId) {
  const m = await userMenu(userCode);
  return m.systemUser || m.allowed.has(Number(moduleId));
}
