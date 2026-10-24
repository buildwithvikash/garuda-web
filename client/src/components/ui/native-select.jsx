import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A native <select> in the shadcn look. Use it for form dropdowns: it is reliable on tablets and with a keyboard, and
 * accepts an empty value (which the Radix Select does not). `<NativeSelect><option value="1">One</option></NativeSelect>`
 */
function NativeSelect({ className, children, ...props }) {
  return (
    <div className="relative" data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className={cn(
          'h-9 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-input bg-transparent py-1 pr-9 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40 [&_option]:bg-popover [&_option]:text-popover-foreground',
          'data-[multiple]:h-auto',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {!props.multiple && !(props.size > 1) && (
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground opacity-70" aria-hidden="true" />
      )}
    </div>
  );
}

export { NativeSelect };
