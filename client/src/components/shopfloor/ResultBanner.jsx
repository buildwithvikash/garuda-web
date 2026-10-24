import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';

const TONES = {
  ok: { cls: 'bg-emerald-600 text-white', icon: CheckCircle2 },
  error: { cls: 'bg-destructive text-white', icon: AlertTriangle },
  info: { cls: 'bg-primary/5 text-primary border border-primary/30', icon: Info },
  busy: { cls: 'bg-muted text-foreground/80 border border-border', icon: Loader2 },
};
/** The last scan's outcome, big enough to read from the line. */
export default function ResultBanner({ tone, title, text }) {
  const t = TONES[tone] ?? TONES.info;
  const Icon = t.icon;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-center gap-4 rounded-xl px-5 py-4 animate-in fade-in-0 zoom-in-95 ${t.cls}`}>
      <Icon className={`w-9 h-9 shrink-0 ${tone === 'busy' ? 'animate-spin' : ''}`} />
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight">{title}</p>
        {text && <p className="text-sm opacity-90 mt-0.5 break-words">{text}</p>}
      </div>
    </div>
  );
}
