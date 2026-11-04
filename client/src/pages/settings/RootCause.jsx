// Root Cause Master (sidebar: Settings › Root Causes): the causes a defect is traced to, or one open. Plain page on
// /api/masters/root-causes.
import { SearchCheck } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/settings/rootcauseform';

const sections = [
  {
    title: 'Root cause', subtitle: 'What a defect is traced to', icon: SearchCheck, cols: 3,
    fields: [
      { f: 'code', label: 'Code', kind: 'key' },
      { f: 'reason', label: 'Reason', span: 2 },
    ],
  },
];

export default function RootCause() {
  return <MasterScreen name="root-causes" title="Root Cause Master" icon={SearchCheck} subtitle="A cause the rework station books" sections={sections} />;
}
