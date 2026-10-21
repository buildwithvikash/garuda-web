// LoginChangePasswordForm.aspx: shown when a user must set a new password before signing in.
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function ChangePassword() {
  const navigate = useNavigate();
  const userId = useLocation().state?.userId ?? '';
  const [form, setForm] = useState({ current: '', next: '', retype: '' });
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const r = await api('/auth/change-password', { method: 'POST', body: { userId, ...form } }).catch((err) => ({ message: err.message }));
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) return setTimeout(() => navigate('/login', { replace: true }), 1200);
    if (r.field === 'next') setForm((f) => ({ ...f, next: '', retype: '' }));
    if (r.field === 'current') setForm((f) => ({ ...f, current: '' }));
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Change password</h1>
        <div>
          <label className="label" htmlFor="u">User ID</label>
          <input id="u" className="field" value={userId} disabled />
        </div>
        <div>
          <label className="label" htmlFor="c">Current password</label>
          <input id="c" type="password" className="field" value={form.current} onChange={set('current')} autoComplete="current-password" />
        </div>
        <div>
          <label className="label" htmlFor="n">New password</label>
          <input id="n" type="password" className="field" value={form.next} onChange={set('next')} autoComplete="new-password" />
        </div>
        <div>
          <label className="label" htmlFor="r">Retype new password</label>
          <input id="r" type="password" className="field" value={form.retype} onChange={set('retype')} autoComplete="new-password" />
        </div>
        {msg && (
          <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>
        )}
        <button className="btn w-full" disabled={!userId}>Change password</button>
        <button type="button" className="btn-ghost w-full" onClick={() => navigate('/login')}>Back to sign in</button>
      </form>
    </div>
  );
}
