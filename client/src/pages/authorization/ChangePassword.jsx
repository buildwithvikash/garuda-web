// Change Password (sidebar: Authorization › Change Password): the signed-in user's own password. Plain page on
// /api/masters/change-password; a changed password signs the user out, as the original.
import { KeyRound } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/authorization/changepasswordform';

const sections = [
  {
    title: 'Change password', subtitle: 'At least 8 characters, with a number and a special character', icon: KeyRound, cols: 2,
    fields: [
      { f: 'user', label: 'User Id', kind: 'key' },
      { f: 'current', label: 'Current Password', type: 'password' },
      { f: 'next', label: 'New Password', type: 'password' },
      { f: 'retype', label: 'Retype Password', type: 'password' },
    ],
  },
];

export default function ChangePassword() {
  return <MasterScreen name="change-password" title="Change Password" icon={KeyRound} subtitle="You sign in again after changing it" sections={sections} hasList={false} canUpdate={false} saveLabel="Change password" />;
}
