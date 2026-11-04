// Variant Values (sidebar: Material Setup › Variant Value): the values of a variant field, or one open. Plain page on
// /api/masters/variant-values.
import { Tags } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/materialsetup/variantfieldvalueform';

const sections = [
  {
    title: 'Value', subtitle: 'A value of a variant field, and its prefix', icon: Tags,
    fields: [
      { f: 'code', label: 'Value Code', kind: 'key' },
      { f: 'field', label: 'Variant Field', kind: 'select' },
      { f: 'value', label: 'Value' },
      { f: 'prefix', label: 'Prefix' },
    ],
  },
];

export default function VariantValue() {
  return <MasterScreen name="variant-values" title="Variant Values" icon={Tags} subtitle="A value a variant field can take" sections={sections} />;
}
