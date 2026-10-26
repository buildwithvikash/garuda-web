// Sign in (QMAS design): business unit, user + password or badge scan, production line (WRL).
import { ArrowRight, Eye, EyeOff, Lock, ScanBarcode, User, KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api.js';
import { Button } from '@/components/ui/button.jsx';
import { Select, TextInput } from '@/components/shared/FormField.jsx';
import AuthShell from './AuthShell.jsx';

const opts = (list = []) => list.map((o) => ({ value: o.value, label: o.text }));

export default function Login() {
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [form, setForm] = useState({ businessUnit: '', userId: '', password: '', scanned: '', line: '' });
  const [qr, setQr] = useState(false);
  const [buLocked, setBuLocked] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setErrorState] = useState('');
  const setError = (message) => {
    setErrorState(message);
    if (message) toast.error(message, { id: message, duration: 6000 });
  };
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/auth/login-page')
      .then((p) => {
        setPage(p);
        setForm((f) => ({ ...f, businessUnit: p.defaultBusinessUnit }));
      })
      .catch((e) => setError(e.message));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : (e ?? '') }));

  // After the user ID is entered, a single assigned business unit is selected and locked.
  async function onUserBlur() {
    setBuLocked(false);
    if (!form.userId.trim()) return;
    const r = await api(`/auth/business-units?userId=${encodeURIComponent(form.userId.trim())}`).catch(() => null);
    if (r?.locked) {
      setForm((f) => ({ ...f, businessUnit: r.businessUnit }));
      setBuLocked(true);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const lineName = page?.lines.find((l) => l.value === form.line)?.text ?? '';
      const r = await api('/auth/login', { method: 'POST', body: { ...form, qr, lineName } });
      if (r.ok) {
        toast.success('Signed in');
        return navigate(r.redirect, { replace: true });
      }
      if (r.changePassword) return navigate('/change-password', { state: { userId: r.userId } });
      setError(r.message);
      setForm((f) => ({ ...f, scanned: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome to Garuda" subtitle={page?.lineRequired ? 'Sign in and choose the line you are working on' : 'Sign in to continue'}>
      <form onSubmit={submit} className="space-y-5">
        <Select
          label="Business unit"
          required
          value={form.businessUnit}
          onChange={set('businessUnit')}
          disabled={buLocked}
          hint={buLocked ? 'Set by your user account' : undefined}
          options={opts(page?.businessUnits)}
          placeholder="Select a business unit"
        />
        {qr ? (
          <TextInput label="Badge" size="lg" icon={ScanBarcode} autoFocus autoComplete="off" value={form.scanned} onChange={set('scanned')} hint="Scan your ID badge" required />
        ) : (
          <>
            <TextInput label="User ID" size="lg" icon={User} autoFocus autoComplete="username" value={form.userId} onChange={set('userId')} onBlur={onUserBlur} required />
            <TextInput
              label="Password"
              size="lg"
              icon={Lock}
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              value={form.password}
              onChange={set('password')}
              trailing={
                <button type="button" onClick={() => setShowPass((s) => !s)} aria-label={showPass ? 'Hide password' : 'Show password'} className="p-1 text-muted-foreground hover:text-foreground cursor-pointer">
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              }
            />
          </>
        )}
        {page?.lineRequired && (
          <Select label="Production line" required value={form.line} onChange={set('line')} options={opts(page.lines)} placeholder="Select a production line" />
        )}
        <Button type="submit" size="lg" className="w-full py-4! text-base! rounded-xl! shadow-lg shadow-blue-600/25" loading={busy} disabled={!page}>
          Sign in {!busy && <ArrowRight className="w-5 h-5" />}
        </Button>
        <button type="button" onClick={() => (setQr((q) => !q), setError(''))} className="flex w-full items-center justify-center gap-2 text-sm font-medium text-primary hover:underline cursor-pointer">
          {qr ? <KeyRound className="w-4 h-4" /> : <ScanBarcode className="w-4 h-4" />}
          {qr ? 'Use user ID and password' : 'Scan badge instead'}
        </button>
        {page && <p className="text-center text-xs text-muted-foreground/70">{page.server}</p>}
      </form>
    </AuthShell>
  );
}
