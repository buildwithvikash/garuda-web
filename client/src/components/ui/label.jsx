import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

/** The label look, for places that need a <span>/<div> instead of a <label>. */
export const labelClass = 'flex items-center gap-2 text-sm leading-none font-medium select-none';

function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(labelClass, 'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50', className)}
      {...props}
    />
  );
}

export { Label };
