// User Roles (sidebar: Authorization › User Roles): the roles, or one open with the pages it may open. Plain page on
// /api/masters/user-roles.
import { ListTree, ShieldCheck } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/authorization/userroleform';

const sections = [
  {
    title: 'Role', subtitle: 'The role and how long its passwords last', icon: ShieldCheck, cols: 1,
    fields: [
      { f: 'roleCode', label: 'Role Code', kind: 'key' },
      { f: 'roleName', label: 'Role Name', required: true, max: 50 },
      { f: 'expiryDays', label: 'Expiry in days', type: 'number' },
    ],
  },
  { title: 'Pages', subtitle: 'What users with this role may open (a folder ticks all its pages)', icon: ListTree, fields: [{ f: 'pages', label: 'Pages', kind: 'tree' }] },
];

export default function UserRole() {
  return <MasterScreen name="user-roles" title="User Roles" icon={ShieldCheck} subtitle="A role and the pages it may open" sections={sections}
    // the role beside its pages on wide screens, one under the other on narrow ones
    layout="lg:grid-cols-[minmax(16rem,1fr)_minmax(0,3fr)]" />;
}
