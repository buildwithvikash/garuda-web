// How the menu groups from the server (menu.json moduleIds) are presented: order, icon, display caption.
import { Building2, CheckCircle2, ClipboardCheck, ClipboardList, Factory, Layers, Package, Printer, RefreshCcw, ScanBarcode, Settings2, UserCog, Wrench, List } from 'lucide-react';

export const GROUPS = {
  3000: { order: 1, icon: Factory },
  2000: { order: 2, icon: ClipboardCheck },
  2: { order: 3, icon: Package },
  3: { order: 4, icon: Wrench, caption: 'Production Setup' },
  4: { order: 5, icon: Settings2 },
  1: { order: 6, icon: Building2 },
  5: { order: 7, icon: UserCog },
};

/** Shop-floor screens shown as large tiles on the home page (in this order, when the user has them). */
export const QUICK = [
  { route: '/production/wipcaptureform', icon: ScanBarcode, tone: 'bg-blue-600', hint: 'Scan at a station: start, complete, QC, FG label' },
  { route: '/production/productionassignmentform', icon: Printer, tone: 'bg-emerald-600', hint: 'Start a production order and print job cards' },
  { route: '/production/productionorderform', icon: ClipboardList, tone: 'bg-violet-600', hint: 'Create and manage production orders' },
  { route: '/quality/reworkconfirmationnew', icon: RefreshCcw, tone: 'bg-orange-600', hint: 'Confirm rework on rejected units' },
  { route: '/production/prodplanupload', icon: Layers, tone: 'bg-cyan-600', hint: 'Upload monthly label plans' },
  { route: '/quality/qualityinspectionform', icon: CheckCircle2, tone: 'bg-rose-600', hint: 'Final inspection of held units' },
];

/** Every screen of a menu tree with its group trail ("Production › WIP Capture"). */
export function flatten(nodes, trail = []) {
  return nodes.flatMap((n) => [
    ...(n.route && n.moduleId !== 10001 ? [{ ...n, trail: [...trail, n.caption].join(' › ') }] : []),
    ...flatten(n.children ?? [], [...trail, n.caption]),
  ]);
}

/** The top-level groups with display caption and icon, in presentation order. */
export function groupsOf(menu) {
  return menu
    .filter((n) => n.moduleId !== 10000)
    .map((n) => ({ ...n, order: GROUPS[n.moduleId]?.order ?? 99, icon: GROUPS[n.moduleId]?.icon ?? List, caption: GROUPS[n.moduleId]?.caption ?? n.caption }))
    .sort((a, b) => a.order - b.order);
}

/** The screen's caption (and its group) for a route, from the user's menu. */
export function screenOf(menu, route) {
  for (const g of groupsOf(menu)) {
    const item = flatten(g.children).find((i) => i.route === route);
    if (item) return { caption: item.caption, group: g };
  }
  return null;
}
