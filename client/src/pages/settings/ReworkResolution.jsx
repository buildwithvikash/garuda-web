// Rework Resolution Master (sidebar: Settings › Rework Resolutions): how a rework was resolved, or one open. Plain page
// on /api/masters/rework-resolutions.
import { Wrench } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/settings/reworkresolutionform';

const sections = [
  {
    title: 'Resolution', subtitle: 'How a rework was resolved', icon: Wrench, cols: 3,
    fields: [
      { f: 'code', label: 'Code', kind: 'key' },
      { f: 'reason', label: 'Reason', span: 2 },
    ],
  },
];

export default function ReworkResolution() {
  return <MasterScreen name="rework-resolutions" title="Rework Resolution Master" icon={Wrench} subtitle="A resolution the rework station books" sections={sections} />;
}
