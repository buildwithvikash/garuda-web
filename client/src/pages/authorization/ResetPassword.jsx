// Reset Password (sidebar: Authorization › Reset Password): sets another user's password. Plain page on
// /api/masters/reset-password; afterwards you sign in again, as the original.
import { LockKeyhole } from 'lucide-react';
import MasterScreen from '@/components/shared/MasterScreen.jsx';

export const route = '/authorization/resetpasswordform';

const sections = [
  {
    title: 'Reset password', subtitle: 'At least 8 characters, with a number and a special character', icon: LockKeyhole, cols: 2,
    fields: [
      { f: 'user', label: 'User Id', kind: 'select', span: 2 },
      { f: 'next', label: 'New Password', type: 'password' },
      { f: 'retype', label: 'Retype Password', type: 'password' },
    ],
  },
];

export default function ResetPassword() {
  return <MasterScreen name="reset-password" title="Reset Password" icon={LockKeyhole} subtitle="Set a new password for a user" sections={sections} hasList={false} canUpdate={false} saveLabel="Reset password" />;
}
