// Unit of Measure (sidebar: Material Setup › Unit Of Measure): the units materials are counted in, or one open. Plain page
// on /api/masters/units-of-measure.
import { Ruler } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/materialsetup/unitofmeasureform';

const sections = [
  {
    title: 'Unit', subtitle: 'What the unit is', icon: Ruler,
    fields: [
      { f: 'uomCode', label: 'UOM Code', kind: 'key' },
      { f: 'name', label: 'Name' },
      { f: 'alias', label: 'Alias' },
      { f: 'uomType', label: 'UOM Type', kind: 'select' },
    ],
  },
];

export default function UnitOfMeasure() {
  return <MasterScreen name="units-of-measure" title="Unit of Measure" icon={Ruler} subtitle="A unit materials are counted in" sections={sections} />;
}
