// Production Process (sidebar: Production Setup › Production Process): the processes a routing is made of, or one open.
// Plain page on /api/masters/production-processes. Cost, unit, model, sequence, prefix, tag design, serial logic, check
// points and checking methods were already hidden: a saved process keeps them, a new one gets the screen's defaults.
import { Cog } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/productionsetup/productionprocess';

const sections = [
  {
    title: 'Process', subtitle: 'The process and its production stage', icon: Cog, cols: 3,
    fields: [
      { f: 'processCode', label: 'Process Code', kind: 'key' },
      { f: 'name', label: 'Name' },
      { f: 'alias', label: 'Alias' },
      { f: 'stage', label: 'Production Stage', kind: 'select' },
      { f: 'showInHistory', label: 'Show in History', kind: 'select' },
    ],
  },
];

export default function ProductionProcess() {
  return <MasterScreen name="production-processes" title="Production Process" icon={Cog} subtitle="A process of production" sections={sections} />;
}
