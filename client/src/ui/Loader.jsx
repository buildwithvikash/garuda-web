import { Loader2 } from 'lucide-react';

/**
 * Loading state. Full-screen or `inline`: a spinner. As a whole page: a skeleton of a header and a
 * few panels, so the layout does not jump when the content arrives.
 */
export default function Loader({ label = 'Loading…', fullScreen = false, inline = false }) {
  if (fullScreen || inline) {
    return (
      <div className={`flex items-center justify-center gap-2 text-sm text-slate-500 ${fullScreen ? 'h-screen' : 'py-8'}`}>
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        {label}
      </div>
    );
  }
  return (
    <div role="status" aria-label={label} className="animate-page">
      <div className="bg-white/85 border-b border-slate-200/80 px-5 py-4 flex items-center gap-3">
        <div className="skeleton w-8 h-8 rounded-xl" />
        <div className="space-y-2 flex-1"><div className="skeleton h-4 w-48" /><div className="skeleton h-3 w-72 max-w-full" /></div>
      </div>
      <div className="p-5 space-y-4">
        <div className="card p-5 space-y-3"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-3 w-2/3" /><div className="skeleton h-3 w-1/2" /></div>
        <div className="card p-5 space-y-3"><div className="skeleton h-3 w-1/4" /><div className="skeleton h-24 w-full" /></div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
