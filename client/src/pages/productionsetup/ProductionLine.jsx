// Production Line (sidebar: Production Setup › Production Line): the lines of a department, or one open. Plain page on
// /api/masters/production-lines. The business unit the screen keeps hidden is not shown.
import { Rows3 } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/productionsetup/productionlineform';

const sections = [
  {
    title: 'Line', subtitle: 'The line and its department', icon: Rows3, cols: 3,
    fields: [
      { f: 'lineCode', label: 'Line Code', kind: 'key' },
      { f: 'name', label: 'Name' },
      { f: 'alias', label: 'Alias' },
      { f: 'department', label: 'Department', kind: 'select' },
    ],
  },
];

export default function ProductionLine() {
  return <MasterScreen name="production-lines" title="Production Line" icon={Rows3} subtitle="A production line of a department" sections={sections} />;
}
