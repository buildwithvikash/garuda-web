import { cn } from '@/lib/utils';

/** A row of actions that stays at the top of the scrolling page body (Back, status, Save ...). */
export default function Toolbar({ sticky = true, className = '', children }) {
  return (
    <div className={cn('z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-2.5 shadow-sm', sticky && 'sticky top-0', className)}>
      {children}
    </div>
  );
}
