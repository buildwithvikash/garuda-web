// Variant Field (sidebar: Material Setup › Variant Field): the fields a variant has (colour, capacity ...), or one open; a
// new one can be copied from a saved one. Plain page on /api/masters/variant-fields.
import { SlidersHorizontal } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/materialsetup/variantfieldform';

const sections = [
  {
    title: 'Field', subtitle: 'What the variant field is', icon: SlidersHorizontal, cols: 2,
    fields: [
      { f: 'fieldCode', label: 'Field Code', kind: 'key' },
      { f: 'name', label: 'Name' },
    ],
  },
];

export default function VariantField() {
  return <MasterScreen name="variant-fields" title="Variant Field" icon={SlidersHorizontal} subtitle="A field models and materials vary by" sections={sections} />;
}
