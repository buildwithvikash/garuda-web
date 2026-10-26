// Form building blocks on the shadcn controls: a label, the control, and help / error text.
import { useId } from 'react';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { cn } from '@/lib/utils';

/** Label + control + help / error text. */
export function Field({ label, required, error, hint, id, className = '', children }) {
  return (
    <div className={cn('grid gap-2', className)}>
      {label && (
        <Label htmlFor={id}>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** `icon`: a lucide icon inside the left edge. `trailing`: a control inside the right edge (e.g. show password). */
export function TextInput({ label, required, error, hint, className, icon: Icon, trailing, size, ...props }) {
  const id = useId();
  return (
    <Field label={label} required={required} error={error} hint={hint} id={id} className={className}>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />}
        <Input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(Icon && 'pl-9', trailing && 'pr-10', size === 'lg' && 'h-11 text-base')}
          {...props}
        />
        {trailing && <div className="absolute top-1/2 right-2 flex -translate-y-1/2">{trailing}</div>}
      </div>
    </Field>
  );
}

export function TextArea({ label, required, error, hint, className, ...props }) {
  const id = useId();
  return (
    <Field label={label} required={required} error={error} hint={hint} id={id} className={className}>
      <Textarea id={id} aria-invalid={!!error} {...props} />
    </Field>
  );
}

/** Native select (reliable on tablets and keyboards). options: [{ value, label }]. */
export function Select({ label, required, error, hint, className, options = [], placeholder = 'Select…', value, onChange, ...props }) {
  const id = useId();
  return (
    <Field label={label} required={required} error={error} hint={hint} id={id} className={className}>
      <NativeSelect id={id} aria-invalid={!!error} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} {...props}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </NativeSelect>
    </Field>
  );
}

/** On / off switch with a label. */
export function Toggle({ label, checked, onChange, disabled, description }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={!!checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
      <Label htmlFor={id} className="flex-col items-start gap-0.5 leading-snug">
        {label}
        {description && <span className="text-xs font-normal text-muted-foreground">{description}</span>}
      </Label>
    </div>
  );
}
