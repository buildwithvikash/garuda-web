// Material Category (sidebar: Material Setup › Material Category): the categories materials belong to, or one open. Plain
// page on /api/masters/material-categories. Material tag design, inspection required / type / checklist and certificate
// are not shown (owner, 28 Oct 2026: kept for display elsewhere, not set by users here): a saved category keeps them, a
// new one gets the screen's defaults.
import { Boxes } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/materialsetup/materialcategoryform';

const sections = [
  {
    title: 'Category', subtitle: 'Code, name and type', icon: Boxes, cols: 3,
    fields: [
      { f: 'categoryCode', label: 'Category Code', kind: 'key' },
      { f: 'name', label: 'Name' },
      { f: 'alias', label: 'Alias' },
      { f: 'prefix', label: 'Prefix' },
      { f: 'categoryType', label: 'Category Type', kind: 'select' },
    ],
  },
];

export default function MaterialCategory() {
  return <MasterScreen name="material-categories" title="Material Category" icon={Boxes} subtitle="Material categories: code, name and type" sections={sections} />;
}
