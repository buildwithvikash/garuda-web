// Finds every page file and exposes them as `import { pages } from 'virtual:pages'`.
//
// A page is any file  src/pages/<group>/<PageName>.jsx  that exports its sidebar route:
//
//     export const route = '/production/productionorderform';
//
// The plugin builds { '<route>': lazy(() => import('<file>')) }, so a new page needs no registration anywhere:
// create the file and it is routed (and code-split) automatically. Folders starting with "_" are ignored.
import fs from 'node:fs';
import path from 'node:path';

const VIRTUAL = 'virtual:pages';
const RESOLVED = '\0' + VIRTUAL;
const ROUTE_RE = /export\s+const\s+route\s*=\s*['"`]([^'"`]+)['"`]/;

export default function pages({ dir = 'src/pages' } = {}) {
  const root = path.resolve(dir);

  function scan() {
    const found = [];
    if (!fs.existsSync(root)) return found;
    for (const group of fs.readdirSync(root, { withFileTypes: true })) {
      if (!group.isDirectory() || group.name.startsWith('_')) continue;
      for (const file of fs.readdirSync(path.join(root, group.name))) {
        if (!file.endsWith('.jsx')) continue;
        const full = path.join(root, group.name, file);
        const match = ROUTE_RE.exec(fs.readFileSync(full, 'utf8'));
        if (match) found.push({ route: match[1].toLowerCase(), full });
      }
    }
    return found;
  }

  return {
    name: 'garuda-pages',
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return undefined;
      const entries = scan();
      const seen = new Map();
      for (const e of entries) {
        if (seen.has(e.route)) this.warn(`Two pages declare the route ${e.route}: ${seen.get(e.route)} and ${e.full}`);
        seen.set(e.route, e.full);
        this.addWatchFile(e.full);
      }
      const lines = entries.map(
        (e) => `  ${JSON.stringify(e.route)}: lazy(() => import(${JSON.stringify(path.relative(process.cwd(), e.full).split(path.sep).join('/').replace(/^/, '/'))}))`,
      );
      return `import { lazy } from 'react';\nexport const pages = {\n${lines.join(',\n')}\n};\n`;
    },
    configureServer(server) {
      const touch = (file) => {
        if (!path.resolve(file).startsWith(root)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', touch).on('unlink', touch);
    },
  };
}
