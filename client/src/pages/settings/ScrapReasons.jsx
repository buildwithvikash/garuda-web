// Material Scrap Reason Master (sidebar: Settings › Scrap Reason): why material is scrapped, or one open. Plain page on
// /api/masters/scrap-reasons.
import { Recycle } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/settings/scrapreasonform';

const sections = [
  {
    title: 'Scrap reason', subtitle: 'Why material is scrapped', icon: Recycle, cols: 3,
    fields: [
      { f: 'code', label: 'Code', kind: 'key' },
      { f: 'reason', label: 'Reason', span: 2 },
    ],
  },
];

export default function ScrapReasons() {
  return <MasterScreen name="scrap-reasons" title="Material Scrap Reason Master" icon={Recycle} subtitle="A reason material is scrapped" sections={sections} />;
}
