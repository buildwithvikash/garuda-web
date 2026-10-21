// Shared parts of the dedicated shop-floor screens: the spec loader, the big scan box, the result banner (with a beep),
// the step track, route progress, the component checklist and a labelled engine control.
import { AlertTriangle, Check, CheckCircle2, Circle, CircleDot, Info, Loader2, ScanLine, Volume2, VolumeX } from 'lucide-react';
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
export const ScanBox = forwardRef(function ScanBox({ label, value, onChange, onScan, locked, onClear, busy, placeholder, disabled }, ref) {
  const go = () => {
    if (locked) onClear?.();
    else if (String(value ?? '').trim() !== '') onScan();
  };
  return (
    <div className="flex gap-2">
      <label className="relative flex-1 min-w-0">
        <span className="sr-only">{label}</span>
        <ScanLine className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400" />
        <input
          ref={ref}
          className={`w-full h-16 pl-13 pr-4 text-2xl font-semibold tracking-wide tabular rounded-xl border-2 outline-none transition-colors ${locked ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15'}`}
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
      <Button size="lg" onClick={go} variant={locked ? 'secondary' : 'primary'} className="h-16! px-6! text-base!" loading={busy} disabled={disabled}>
        {locked ? 'Change' : 'Scan'}
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

/** Steps with done / current / waiting states. */
export function StepTrack({ steps }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          {i > 0 && <span className={`h-px w-6 ${s.state === 'wait' ? 'bg-slate-200' : 'bg-blue-300'}`} />}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${s.state === 'done' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : s.state === 'now' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
            {s.state === 'done' ? <Check className="w-3.5 h-3.5" /> : <span className="tabular">{i + 1}</span>}
            {s.label}
          </span>
        </li>
      ))}
    </ol>
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

const STAGE = {
  2: { icon: CheckCircle2, cls: 'text-emerald-600', row: 'text-slate-600' },
  1: { icon: CircleDot, cls: 'text-blue-600', row: 'bg-blue-50 font-semibold text-blue-900' },
  0: { icon: Circle, cls: 'text-slate-300', row: 'text-slate-500' },
};
/** The unit's whole route: stages done, the one in progress, the ones still to come (/forms/route steps). */
export function RouteProgress({ steps }) {
  const done = steps.filter((s) => s.status === 2).length;
  const now = steps.find((s) => s.status === 1) ?? steps.find((s) => s.status === 0);
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold text-slate-900">{done === steps.length ? 'Route complete' : now ? `Stage ${steps.indexOf(now) + 1} of ${steps.length}` : '—'}</span>
          <span className="tabular text-slate-500">{done} / {steps.length} done</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Route progress">
          <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ol className="max-h-80 space-y-0.5 overflow-auto text-sm">
        {steps.map((s, i) => {
          const t = STAGE[s.status] ?? STAGE[0];
          const Icon = t.icon;
          return (
            <li key={`${s.seq}-${i}`} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${t.row}`} aria-current={s === now ? 'step' : undefined}>
              <Icon className={`w-4 h-4 shrink-0 ${t.cls}`} />
              <span className="min-w-0 flex-1 truncate" title={s.process}>{s.process}</span>
              <span className="shrink-0 truncate text-xs opacity-75" title={s.station}>{s.station}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
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
