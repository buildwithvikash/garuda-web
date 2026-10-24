import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
        success: 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        xl: 'h-12 rounded-md px-6 text-base', // touch screens (scan / shop floor)
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

// Names the old Button used; still accepted so nothing breaks.
const ALIAS = { primary: 'default', danger: 'destructive' };
const SIZE_ALIAS = { md: 'default' };

// An icon-only button (icon, no text) becomes square at the matching size.
const SQUARE = { default: 'icon', sm: 'icon-sm', lg: 'icon-lg' };

/**
 * shadcn Button, plus two small additions used across the app:
 *   icon     a lucide icon shown before the text: <Button icon={Save}>Save</Button>
 *   loading  disables the button and shows a spinner (no double submits)
 */
function Button({ className, variant, size, asChild = false, icon: Icon, loading = false, children, disabled, type = 'button', ...props }) {
  const Comp = asChild ? Slot : 'button';
  const iconOnly = (Icon || loading) && !children;
  variant = ALIAS[variant] ?? variant;
  size = SIZE_ALIAS[size] ?? size;
  const finalSize = iconOnly ? (SQUARE[size ?? 'default'] ?? size) : size;
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : type}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size: finalSize, className }))}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 className="animate-spin" /> : Icon && <Icon />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
