// Storage Location (sidebar: Business Setup › Department): the departments of the business unit, or one open; a new one
// can be copied from a saved one. Plain page on /api/masters/departments.
import { Network, Settings2 } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/businesssetup/departmentform';

const sections = [
  {
    title: 'Department', subtitle: 'What the department is', icon: Network,
    fields: [
      { f: 'deptCode', label: 'Department Code', kind: 'key' },
      { f: 'name', label: 'Name', required: true, max: 100 },
      { f: 'alias', label: 'Alias' },
      { f: 'deptType', label: 'Department Type', kind: 'select', required: true },
    ],
  },
  {
    title: 'Settings', subtitle: 'How the department is used', icon: Settings2,
    fields: [
      { f: 'prefix', label: 'Prefix', max: 4 },
      { f: 'controlIndicator', label: 'Control Indicator', kind: 'select', required: true },
      { f: 'isVirtual', label: 'Is Virtual', kind: 'select' },
    ],
  },
];

export default function Department() {
  return <MasterScreen name="departments" title="Storage Location" icon={Network} subtitle="A department of this business unit" sections={sections} />;
}
