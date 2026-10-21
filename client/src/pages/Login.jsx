// LoginForm.aspx: business unit, user + password or badge scan, production line (WRL).
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Login() {
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [form, setForm] = useState({ businessUnit: '', userId: '', password: '', scanned: '', line: '' });
  const [qr, setQr] = useState(false);
  const [buLocked, setBuLocked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const scanRef = useRef(null);

  useEffect(() => {
    api('/auth/login-page')
      .then((p) => {
        setPage(p);
        setForm((f) => ({ ...f, businessUnit: p.defaultBusinessUnit }));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (qr) scanRef.current?.focus();
  }, [qr]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // AssignBusinessUnit: after the user ID is entered, a single assigned unit is selected and locked.
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
      if (r.ok) return navigate(r.redirect, { replace: true });
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
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <img src="/Assets/Images/LoginImage.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-slate-900/10" />
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <p className="text-3xl font-semibold">{page?.companyName || 'Garuda'}</p>
          <p className="mt-1 text-sm text-white/80">Manufacturing execution &amp; warehouse management</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <img src={page?.logo ?? '/Assets/Images/Logo.png'} alt="Company logo" className="h-16 object-contain" />
            <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          </div>

          <div>
            <label className="label" htmlFor="bu">Business unit</label>
            <select id="bu" className="field" value={form.businessUnit} onChange={set('businessUnit')} disabled={buLocked} required>
              {page?.businessUnits.map((b) => (
                <option key={b.value} value={b.value}>{b.text}</option>
              ))}
            </select>
          </div>

          {qr ? (
            <div>
              <label className="label" htmlFor="scan">Scan badge</label>
              <input id="scan" ref={scanRef} className="field" value={form.scanned} onChange={set('scanned')} autoComplete="off" required />
            </div>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="user">User ID</label>
                <input id="user" className="field" value={form.userId} onChange={set('userId')} onBlur={onUserBlur} autoComplete="username" required />
              </div>
              <div>
                <label className="label" htmlFor="pw">Password</label>
                <input id="pw" type="password" className="field" value={form.password} onChange={set('password')} autoComplete="current-password" />
              </div>
            </>
          )}

          {page?.lineRequired && (
            <div>
              <label className="label" htmlFor="line">Production line</label>
              <select id="line" className="field" value={form.line} onChange={set('line')}>
                <option value="">Select A Value</option>
                {page.lines.map((l) => (
                  <option key={l.value} value={l.value}>{l.text}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button className="btn w-full" disabled={busy || !page}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="btn-ghost w-full" onClick={() => { setQr((q) => !q); setError(''); }}>
            {qr ? 'Use user ID and password' : 'Scan badge instead'}
          </button>

          {page && <p className="text-center text-xs text-slate-400">{page.server}</p>}
        </form>
      </div>
    </div>
  );
}
