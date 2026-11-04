// Model (sidebar: Material Setup › Model): the models and their variant values, or one open; a new one can be copied
// from a saved one. The variants are added and changed in their table by the screen's own events (shared VariantGrid);
// Add also builds the model's Alias. Plain page on /api/masters/models.
import { Boxes, ClipboardList, SlidersHorizontal } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/materialsetup/modelform';

// the two side by side on wide screens: 30 % and 70 % (width in tenths)
const sections = [
  {
    title: 'Details', subtitle: 'The main information of this model', icon: ClipboardList, width: 3, cols: 1,
    fields: [
      { f: 'modelCode', label: 'Model Code', kind: 'key' },
      { f: 'name', label: 'Name' },
      { f: 'alias', label: 'Alias' },
      { f: 'category', label: 'Category', kind: 'select' },
      { f: 'prefix', label: 'Prefix' },
      { f: 'beeCode', label: 'BEE Code' },
    ],
  },
  {
    title: 'Variants', subtitle: 'Add a field and its value in the first row; ✏ changes a value, 🗑 removes it', icon: SlidersHorizontal, width: 7,
    fields: [
      {
        f: 'variants', kind: 'variants', group: 'variantGroup', field: 'variantField', value: 'variantValue', newValue: 'newValue', category: 'category',
        events: { group: 'variantGroup', field: 'variantField', add: 'add', delete: 'remove' },
      },
    ],
  },
];

export default function Model() {
  return <MasterScreen name="models" title="Model" icon={Boxes} subtitle="Models and their variant values" sections={sections} />;
}
