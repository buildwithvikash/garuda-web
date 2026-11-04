// Operating Unit (sidebar: Business Setup › Business Unit): the business units, or one open. Plain page on
// /api/masters/business-units.
import { Building2, ContactRound, FileBadge, Image, MapPin } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/businesssetup/businessunitform';

const sections = [
  {
    title: 'Business unit', subtitle: 'What the unit is and where it sits', icon: Building2,
    fields: [
      { f: 'buCode', label: 'OU Code', kind: 'key' },
      { f: 'name', label: 'Name', required: true, max: 100 },
      { f: 'alias', label: 'Alias', required: true },
      { f: 'buType', label: 'BU Type', kind: 'select', required: true },
      { f: 'prefix', label: 'Prefix(2digit)', max: 10 },
      { f: 'isVirtual', label: 'Is Virtual BU', kind: 'select', required: true },
      { f: 'parentBu', label: 'Parent BU', kind: 'select' },
      { f: 'controlIndicator', label: 'Control Indicator', kind: 'select' },
    ],
  },
  {
    title: 'Address', subtitle: 'Where the unit is', icon: MapPin,
    fields: [
      { f: 'address1', label: 'Address 1', max: 150, span: 2 },
      { f: 'address2', label: 'Address 2', max: 150, span: 2 },
      { f: 'city', label: 'City', max: 100 },
      { f: 'postalCode', label: 'Postal Code', type: 'number' },
      { f: 'state', label: 'State', kind: 'select' },
      { f: 'country', label: 'Country', kind: 'select' },
      { f: 'completeAddress', label: 'Complete Address', span: 'full' },
    ],
  },
  {
    title: 'Contact', subtitle: 'How to reach the unit', icon: ContactRound,
    fields: [
      { f: 'email', label: 'Email', max: 150 },
      { f: 'contactNo', label: 'Contact No.', max: 50 },
      { f: 'webSite', label: 'WebSite', max: 150, span: 2 },
    ],
  },
  {
    title: 'Registration', subtitle: 'Tax, licence and barcode numbers', icon: FileBadge,
    fields: [
      { f: 'taxRegNo', label: 'Tax Reg. No.', max: 100 },
      { f: 'licence', label: 'Licence', max: 100 },
      { f: 'gs1Prefix', label: 'GS1 Prefix', max: 20 },
      { f: 'otherDetails', label: 'Other Details' },
    ],
  },
  { title: 'Logo', subtitle: 'The logo of the unit (PNG)', icon: Image, fields: [{ f: 'logo', label: 'Company Logo', kind: 'image' }] },
];

export default function BusinessUnit() {
  return <MasterScreen name="business-units" title="Operating Unit" icon={Building2} subtitle="A business unit's details, address and registration" sections={sections} />;
}
