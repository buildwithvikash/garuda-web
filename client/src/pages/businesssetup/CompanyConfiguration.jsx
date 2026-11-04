// Company (sidebar: Business Setup › Company): the one company record, changed only (no add or delete, as the
// original). Plain page on /api/masters/company.
import { BadgeCheck, Building, Image } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/businesssetup/companyform';

const sections = [
  {
    title: 'Company', subtitle: 'The company this installation belongs to', icon: Building,
    fields: [
      { f: 'code', label: 'Company Code', kind: 'key' },
      { f: 'companyName', label: 'Name', required: true, max: 150, span: 2 },
    ],
  },
  {
    title: 'Licence', subtitle: 'The licence of this installation', icon: BadgeCheck,
    fields: [
      { f: 'licenceType', label: 'Licence Type', kind: 'select', required: true },
      { f: 'licenceId', label: 'Licence ID', max: 150 },
      { f: 'uniqueId', label: 'Unique ID' },
      { f: 'expiryBy', label: 'Expiry By', type: 'date' },
    ],
  },
  { title: 'Logo', subtitle: 'The logo of the company (PNG)', icon: Image, fields: [{ f: 'logo', label: 'Company Logo', kind: 'image' }] },
];

export default function CompanyConfiguration() {
  return <MasterScreen name="company" title="Company" icon={Building} subtitle="The company's name, licence and logo" sections={sections} canAdd={false} />;
}
