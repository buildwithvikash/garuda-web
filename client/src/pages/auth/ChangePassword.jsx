// Shown when a user must set a new password before signing in (QMAS sign-in frame).
import { Lock, User } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/api.js';
import { Button } from '@/components/ui/button.jsx';
import { FormError, TextInput } from '@/components/shared/FormField.jsx';
import AuthShell from './AuthShell.jsx';

export default function ChangePassword() {
  const navigate = useNavigate();
  const userId = useLocation().state?.userId ?? '';
  const [form, setForm] = useState({ current: '', next: '', retype: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const mismatch = form.retype !== '' && form.next !== form.retype;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await api('/auth/change-password', { method: 'POST', body: { userId, ...form } }).catch((err) => ({ message: err.message }));
    setBusy(false);
    if (r.ok) {
      toast.success(r.message || 'Password changed');
      return navigate('/login', { replace: true });
    }
    setError(r.message);
    if (r.field === 'next') setForm((f) => ({ ...f, next: '', retype: '' }));
    if (r.field === 'current') setForm((f) => ({ ...f, current: '' }));
  }

  return (
    <AuthShell title="Set a new password" subtitle="Your password has expired or must be changed before you continue">
      <form onSubmit={submit} className="space-y-5">
        <FormError message={error} />
        <TextInput label="User ID" size="lg" icon={User} value={userId} disabled />
        <TextInput label="Current password" size="lg" icon={Lock} type="password" autoComplete="current-password" value={form.current} onChange={set('current')} required />
        <TextInput label="New password" size="lg" icon={Lock} type="password" autoComplete="new-password" value={form.next} onChange={set('next')} required />
        <TextInput label="Retype new password" size="lg" icon={Lock} type="password" autoComplete="new-password" value={form.retype} onChange={set('retype')} error={mismatch ? 'The passwords do not match' : undefined} required />
        <Button type="submit" size="lg" className="w-full py-4! text-base! rounded-xl!" loading={busy} disabled={!userId || mismatch}>Change password</Button>
        <Button variant="ghost" className="w-full" onClick={() => navigate('/login')}>Back to sign in</Button>
      </form>
    </AuthShell>
  );
}
