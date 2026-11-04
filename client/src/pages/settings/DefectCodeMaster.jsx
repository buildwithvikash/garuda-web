// Defect Codes (sidebar: Settings › Defect Codes): the defects inspectors book, or one open. Plain page on
// /api/masters/defect-codes.
import { Bug, Settings2 } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/settings/defectcodemasterform';

const sections = [
  {
    title: 'Defect', subtitle: 'What the defect is', icon: Bug, cols: 3,
    fields: [
      { f: 'code', label: 'Defect Code', kind: 'key' },
      { f: 'name', label: 'Name' },
      { f: 'alias', label: 'Alias' },
    ],
  },
  {
    title: 'Where it applies', subtitle: 'Its category, material and process', icon: Settings2, cols: 3,
    fields: [
      { f: 'defectCategory', label: 'Defect Category', kind: 'select' },
      { f: 'materialCategory', label: 'Material Category', kind: 'select' },
      { f: 'process', label: 'Production Process', kind: 'select' },
    ],
  },
];

export default function DefectCodeMaster() {
  return <MasterScreen name="defect-codes" title="Defect Codes" icon={Bug} subtitle="A defect and where it can be booked" sections={sections} />;
}
