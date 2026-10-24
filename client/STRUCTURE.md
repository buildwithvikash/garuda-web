# Garuda client: structure

React 19 + Vite + Tailwind 4 + **shadcn/ui (JavaScript, no TypeScript)**.

```
src/
  main.jsx               routes: /login, /change-password, app shell, everything else -> ScreenRouter
  index.css              the whole theme (shadcn variables). Change --primary / --radius here, everything follows.
  lib/utils.js           cn() helper used by every shadcn component
  components/
    ui/                  shadcn primitives (button, input, card, dialog, table, select, ...). Add more with
                         `npx shadcn@latest add <name>` (components.json is set up for JS: "tsx": false)
    shared/              app pieces built from the primitives: Page, Section, DataTable, Modal, FormField, StatCard ...
    shopfloor/           scan-first building blocks (ScanBox, ResultBanner, StatusPill ...)
  engine/                the server-driven form engine (EngineScreen, RecordForm, RecordList ...). Pages wrap it.
  features/wip-capture/  the parts of the WIP Capture page (Station, Cabinet, Inspection ...)
  layouts/               AppLayout, Navbar, Sidebar, CommandPalette
  routes/ScreenRouter    picks the page file for the URL
  pages/
    <group>/<PageName>.jsx    ONE FILE PER SIDEBAR TAB   (production/ProductionOrder.jsx, quality/..., ...)
    _template/PageName.jsx    copy to start a custom page
    auth/  home/  system/     login, dashboard, "not available"
plugins/vite-pages.js    finds the page files (no list to maintain)
scripts/pages.mjs        creates page files for the sidebar tabs
```

## One file per sidebar tab
Every tab is `src/pages/<group>/<PageName>.jsx`. The file exports its sidebar route and the page:

```jsx
export const route = '/production/productionorderform';   // exactly as the server lists it, lower case
export default function ProductionOrder() { return <EngineScreen path={route} layout={layout} />; }
```
Nothing else is registered anywhere: the file is found, routed and code-split automatically.
Edit a page by editing its file. To build your own screen, replace the return with JSX made from shadcn
components (see `pages/_template/PageName.jsx`) and call the backend with `api()` as before.

Tabs without a file keep working through the generic engine screen (same as before). Create files for all of them:

1. Sign in, press F12, run in the console, and paste the result into `menu.json` in the project root:
   `copy(JSON.stringify((await (await fetch('/api/auth/me')).json()).menu))`
2. `npm run pages:sync`   (creates a file for each tab that has none; never overwrites)

One tab: `npm run page -- /production/productionguideform "Production Guide"`

## Building pages
```jsx
import { Page, Section, DataTable, Modal } from '@/components/shared';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
```
- `Page`: fixed top bar (breadcrumb, title, actions) + scrolling body with standard padding.
- `Section`: a card with an optional header (icon, title, actions). `flush` for tables.
- Colours always come from theme tokens (`bg-card`, `text-muted-foreground`, `border`, `bg-primary` ...), never fixed
  colours, so dark mode and re-theming work everywhere.
- `Button` has two extras: `icon={Save}` and `loading`. Variants: default, outline, secondary, ghost, destructive, success, link.
