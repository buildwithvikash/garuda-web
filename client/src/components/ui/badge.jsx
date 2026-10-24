import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-white',
        outline: 'text-foreground',
        // status tones used by this app
        success: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        warning: 'border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300',
        danger: 'border-transparent bg-rose-500/10 text-rose-700 dark:text-rose-300',
        info: 'border-transparent bg-primary/10 text-primary',
        neutral: 'border-transparent bg-muted text-muted-foreground',
        violet: 'border-transparent bg-violet-500/10 text-violet-700 dark:text-violet-300',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

/** shadcn Badge + `dot` (a small status dot before the text). */
function Badge({ className, variant, asChild = false, dot = false, children, ...props }) {
  const Comp = asChild ? Slot : 'span';
  if (variant === 'primary') variant = 'default';
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
