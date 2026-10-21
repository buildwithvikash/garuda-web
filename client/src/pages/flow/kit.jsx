// Shared parts of the dedicated shop-floor screens: the spec loader, the big scan box, the result banner (with a beep),
// section cards and status pills, the component checklist and a labelled engine control.
import { AlertTriangle, CheckCircle2, Circle, Info, Loader2, ScanLine, Volume2, VolumeX } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import { api } from '../../api.js';
import Button from '../../ui/Button.jsx';
import { loadPref, savePref } from '../../utils/prefs.js';
import { EngineField } from '../forms/FormControls.jsx';

/** the screen's first state (/forms/spec: Page_Load already run) */
export function useSpec(path) {
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/forms/spec?path=${encodeURIComponent(path)}`).then(setSpec, (e) => setError(e.message));
  }, [path]);
  return { spec, error };
}

/** a short tone: high for OK, a low buzz for an error (off when the operator muted it) */
export function beep(ok) {
  if (loadPref('flow-mute', false)) return;
  try {
    const a = new AudioContext();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = ok ? 'sine' : 'square';
    o.frequency.value = ok ? 880 : 200;
    g.gain.value = 0.06;
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + (ok ? 0.12 : 0.45));
    o.onended = () => a.close();
  } catch {
    /* no audio device: silent */
  }
}

export function MuteButton() {
  const [mute, setMute] = useState(() => loadPref('flow-mute', false));
  const toggle = () => (savePref('flow-mute', !mute), setMute(!mute));
  return <Button variant="ghost" size="sm" icon={mute ? VolumeX : Volume2} onClick={toggle} title={mute ? 'Sound off' : 'Sound on'} aria-label={mute ? 'Turn sound on' : 'Turn sound off'} />;
}

/** One big scanner input: Enter (what a barcode scanner sends) runs the scan. No <form> of its own, so it also works
 *  inside a record form (nested forms are dropped by the browser; Enter would submit the record). */
export const ScanBox = forwardRef(function ScanBox({ label, value, onChange, onScan, locked, onClear, busy, placeholder, disabled, size = 'lg' }, ref) {
  const lg = size === 'lg';
  const go = () => {
    if (locked) onClear?.();
    else if (String(value ?? '').trim() !== '') onScan();
  };
  return (
    <div className="flex gap-2">
      <label className="relative flex-1 min-w-0">
        <span className="sr-only">{label}</span>
        <ScanLine className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 ${lg ? 'left-4 w-6 h-6' : 'left-3 w-5 h-5'}`} />
        <input
          ref={ref}
          className={`w-full ${lg ? 'h-16 pl-13 pr-4 text-2xl border-2' : 'h-11 pl-10 pr-3 text-base border'} font-semibold tracking-wide tabular rounded-xl outline-none transition-colors ${locked ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15'}`}
          value={value ?? ''}
          placeholder={placeholder}
          readOnly={locked}
          disabled={disabled}
          autoComplete="off"
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            go();
          }}
        />
      </label>
      <Button size={lg ? 'lg' : 'md'} onClick={go} variant={locked ? 'secondary' : 'primary'} className={lg ? 'h-16! px-6! text-base!' : 'h-11! min-w-24'} loading={busy} disabled={disabled}>
        {locked ? 'Change' : lg ? 'Scan' : 'Go'}
      </Button>
    </div>
  );
});

const TONES = {
  ok: { cls: 'bg-emerald-600 text-white', icon: CheckCircle2 },
  error: { cls: 'bg-rose-600 text-white', icon: AlertTriangle },
  info: { cls: 'bg-blue-50 text-blue-900 border border-blue-200', icon: Info },
  busy: { cls: 'bg-slate-100 text-slate-700 border border-slate-200', icon: Loader2 },
};
/** The last scan's outcome, big enough to read from the line. */
export function ResultBanner({ tone, title, text }) {
  const t = TONES[tone] ?? TONES.info;
  const Icon = t.icon;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-center gap-4 rounded-xl px-5 py-4 animate-fadeIn ${t.cls}`}>
      <Icon className={`w-9 h-9 shrink-0 ${tone === 'busy' ? 'animate-spin' : ''}`} />
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight">{title}</p>
        {text && <p className="text-sm opacity-90 mt-0.5 break-words">{text}</p>}
      </div>
    </div>
  );
}

/** An engine control by id, under a caption, when the page shows it. */
export function Ctl({ e, id, label, className = '' }) {
  if (!e.vis(id)) return null;
  return (
    <div className={className}>
      <EngineField c={e.ctl(id)} label={label} value={e.values[id]} onChange={(v) => e.change(id, v)} />
    </div>
  );
}

const TILES = {
  blue: 'bg-blue-600 text-white',
  green: 'bg-emerald-600 text-white',
  violet: 'bg-violet-600 text-white',
};
/** A titled card with a coloured icon tile (the WIP screen's sections); tone 'violet' also tints the header bar. */
export function SectionCard({ icon: Icon, title, tone = 'blue', actions, children, className = '' }) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${tone === 'violet' ? 'bg-violet-50 border-b border-violet-100' : 'border-b border-slate-100'}`}>
        <h2 className={`flex items-center gap-3 text-lg font-bold ${tone === 'green' ? 'text-emerald-700' : tone === 'violet' ? 'text-violet-700' : 'text-slate-900'}`}>
          <span className={`grid h-9 w-9 place-items-center rounded-lg ${TILES[tone]}`}><Icon className="w-5 h-5" /></span>
          {title}
        </h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

const PILLS = {
  2: ['Completed', 'bg-emerald-50 text-emerald-700 ring-emerald-200'],
  1: ['In Process', 'bg-blue-50 text-blue-700 ring-blue-200'],
  0: ['Pending', 'bg-slate-100 text-slate-600 ring-slate-200'],
};
/** A route stage's status (0 waiting, 1 started, 2 completed) as a pill. */
export function StatusPill({ status }) {
  const [text, cls] = PILLS[status] ?? PILLS[0];
  return <span className={`inline-flex min-w-24 justify-center rounded-full px-3 py-0.5 text-xs font-semibold ring-1 ${cls}`}>{text}</span>;
}

/** A database date as the plant reads it (M/D/YYYY h:mm:ss AM). ISO strings are the server's wall-clock time, so they
 *  are formatted from their digits, not shifted to the browser's zone; anything else shows as sent. */
export function when(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(v ?? ''));
  if (!m) return v ? String(v) : '-';
  const h = Number(m[4]);
  return `${Number(m[2])}/${Number(m[3])}/${m[1]} ${h % 12 || 12}:${m[5]}:${m[6]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The stage's components (GVINMaterial rows) as a checklist: fitted when the consumed quantity reaches the required. */
export function ComponentChecklist({ rows = [] }) {
  const items = rows.map((r) => ({ ...r, need: Number(r.Qty) || 0, got: Number(r.ConsumedQty) || 0 }));
  const fitted = items.filter((r) => r.got >= r.need).length;
  if (!items.length) return <p className="text-sm text-slate-500">No components to scan at this stage.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-900">
        <span className="tabular">{fitted} of {items.length}</span> fitted{fitted === items.length && ' — all done'}
      </p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {items.map((r, i) => {
          const ok = r.got >= r.need;
          const serials = String(r.Barcodes ?? '').split('|').map((x) => x.trim()).filter(Boolean);
          const alts = String(r.AltMaterial ?? '').split('|').map((x) => x.trim()).filter(Boolean);
          return (
            <li key={r.RowID ?? i} className={`flex items-start gap-3 px-3 py-2.5 ${ok ? 'bg-emerald-50/50' : ''}`}>
              {ok ? <CheckCircle2 className="mt-0.5 w-5 h-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 w-5 h-5 shrink-0 text-slate-300" />}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${ok ? 'text-emerald-900' : 'text-slate-900'}`}>{r.Material}</p>
                <p className="text-xs text-slate-500">
                  {[r.MatCode, r.Type].filter(Boolean).join(' · ')}
                  {alts.length > 0 && ` · or ${alts.join(', ')}`}
                </p>
                {serials.length > 0 && <p className="mt-0.5 text-xs tabular text-slate-600 break-all">{serials.join(', ')}</p>}
              </div>
              <span className={`shrink-0 text-sm font-bold tabular ${ok ? 'text-emerald-700' : 'text-slate-700'}`}>
                {r.got} / {r.need} {r.Unit}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
