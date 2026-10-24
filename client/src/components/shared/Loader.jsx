import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton.jsx';

/**
 * Loading state. Full-screen or `inline`: a spinner. As a whole page: a skeleton of a header and a few
 * cards, so the layout does not jump when the content arrives.
 */
export default function Loader({ label = 'Loading…', fullScreen = false, inline = false }) {
  if (fullScreen || inline) {
    return (
      <div className={`flex items-center justify-center gap-2 text-sm text-muted-foreground ${fullScreen ? 'h-screen' : 'py-8'}`}>
        <Loader2 className="size-5 animate-spin text-primary" />
        {label}
      </div>
    );
  }
  return (
    <div role="status" aria-label={label} className="animate-page space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-6">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-6">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-24 w-full" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
