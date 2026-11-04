// User Master (sidebar: Authorization › User Master): the users, or one open. Plain page on /api/masters/users.
import { Building2, Factory, IdCard, UserRound, Users as UsersIcon } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/authorization/usersform';

const sections = [
  {
    title: 'User', subtitle: 'Who the user is and how they sign in', icon: UserRound,
    fields: [
      { f: 'userCode', label: 'User ID', kind: 'key' },
      { f: 'userId', label: 'User Code', required: true, max: 50 },
      { f: 'userName', label: 'User Name', required: true, max: 150 },
      { f: 'startOn', label: 'Start Date', type: 'date' },
    ],
  },
  {
    title: 'Role and employee', subtitle: 'What the user may open, and the employee behind the login', icon: IdCard,
    fields: [
      { f: 'userRole', label: 'User Role', kind: 'select' },
      { f: 'defaultPage', label: 'Default Page', kind: 'select' },
      { f: 'employee', label: 'Employee', kind: 'select' },
      { f: 'erpEmployee', label: 'Oracle Employee ID' },
      { f: 'photo', label: 'User Photo', kind: 'image' },
    ],
  },
  { title: 'Business units', subtitle: 'The units the user can sign in to', icon: Building2, fields: [{ f: 'businessUnits', label: 'Business Unit', kind: 'checks' }] },
  { title: 'Production processes', subtitle: 'The processes the user works at', icon: Factory, fields: [{ f: 'processes', label: 'Production Process', kind: 'checks', selectAll: true }] },
];

export default function Users() {
  return <MasterScreen name="users" title="User Master" icon={UsersIcon} subtitle="A user's login, role, business units and processes" sections={sections} />;
}
