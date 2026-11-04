// Employee (sidebar: Settings › Employee): the employees, or one open; a saved one's ID label prints on a chosen printer.
// Plain page on /api/masters/employees.
import { Briefcase, Contact, MapPin, UserRound } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/settings/employeeform';

const sections = [
  {
    title: 'Employee', subtitle: 'Who the employee is', icon: UserRound,
    fields: [
      { f: 'empCode', label: 'Emp Code', kind: 'key' },
      { f: 'name', label: 'Name' },
      { f: 'alias', label: 'Alias' },
      { f: 'gender', label: 'Gender', kind: 'select' },
      { f: 'birthDate', label: 'Birth Date', type: 'date' },
      { f: 'married', label: 'Married', kind: 'select' },
      { f: 'anniversary', label: 'Anniversary', type: 'date' },
    ],
  },
  {
    title: 'Work', subtitle: 'Where and how the employee works', icon: Briefcase,
    fields: [
      { f: 'department', label: 'Department', kind: 'select' },
      { f: 'designation', label: 'Designation' },
      { f: 'empType', label: 'Emp Type', kind: 'select' },
      { f: 'joinDate', label: 'Join Date', type: 'date' },
      { f: 'accessCardNo', label: 'Access Card No' },
      { f: 'allowAccess', label: 'Allow Access', kind: 'select' },
    ],
  },
  {
    title: 'Address', subtitle: 'Where the employee lives', icon: MapPin,
    fields: [
      { f: 'address1', label: 'Address 1', span: 2 },
      { f: 'address2', label: 'Address 2', span: 2 },
      { f: 'city', label: 'City' },
      { f: 'postalCode', label: 'Postal Code' },
      { f: 'state', label: 'State', kind: 'select' },
      { f: 'country', label: 'Country', kind: 'select' },
    ],
  },
  {
    title: 'Contact', subtitle: 'How to reach the employee', icon: Contact, cols: 3,
    fields: [
      { f: 'email', label: 'Email' },
      { f: 'contactNo', label: 'Contact No' },
      { f: 'altContactNo', label: 'Alt Contact No' },
    ],
  },
];

export default function Employee() {
  return <MasterScreen name="employees" title="Employee" icon={UserRound} subtitle="An employee's details, work and contact" sections={sections} />;
}
