// Form building blocks on the shadcn controls: a label, the control, and help / error text.
import { useId, useMemo, useState } from 'react';
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

/** A long list (materials, BOMs ...): a filter box beside the native select, which shows at most `limit` matches
 *  (the chosen one always). options: [{ value, label }]. */
export function SearchSelect({ label, required, error, hint, className, options = [], placeholder = 'Select…', value, onChange, limit = 200, showMatchCount = true, showFilter = true, filterPlaceholder = 'Type to filter', ...props }) {
  const id = useId();
  const [q, setQ] = useState('');
  const { shown, matches } = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hits = t ? options.filter((o) => String(o.label).toLowerCase().includes(t)) : options;
    const cut = hits.slice(0, limit);
    const current = options.find((o) => o.value === value);
    return { shown: current && !cut.includes(current) ? [current, ...cut] : cut, matches: hits.length };
  }, [options, q, value, limit]);
  const note = q && !matches ? 'No matching options' : showMatchCount && matches > limit ? `Showing ${limit} of ${matches.toLocaleString('en-IN')}: type to narrow the list` : hint;
  return (
    <Field label={label} required={required} error={error} hint={note} id={id} className={className}>
      <div className="flex gap-2">
        {showFilter && <Input className="w-2/5 min-w-28" placeholder={filterPlaceholder} aria-label={`Filter ${label ?? 'list'}`} value={q} onChange={(e) => setQ(e.target.value)} disabled={props.disabled} />}
        <div className="min-w-0 flex-1">
          <NativeSelect id={id} aria-invalid={!!error} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} {...props}>
            <option value="">{placeholder}</option>
            {shown.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect>
        </div>
      </div>
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
