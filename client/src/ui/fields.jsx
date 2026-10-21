import { useId } from 'react';

export const inputCls =
  'w-full px-3 py-2.5 text-sm rounded-lg border bg-white text-slate-800 placeholder-slate-400 outline-none transition-colors focus:ring-4 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';
const okCls = 'border-slate-300 hover:border-slate-400 focus:border-blue-500 focus:ring-blue-500/10';
const errCls = 'border-rose-300 bg-rose-50/30 focus:border-rose-400 focus:ring-rose-500/10';

/** Label + control + help/error text, as in WRL Master Config forms. `size="lg"`: the larger sign-in look. */
export function Field({ label, required, error, hint, id, className = '', size, children }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className={`block font-semibold ${size === 'lg' ? 'text-sm text-slate-800 mb-2' : 'text-[11px] text-slate-600 mb-1.5'}`}>
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-rose-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
      )}
    </div>
  );
}

/** `trailing`: a control inside the right edge of the box (e.g. a show-password button), centred on the input. */
export function TextInput({ label, required, error, hint, className, icon: Icon, trailing, size, ...props }) {
  const id = useId();
  return (
    <Field label={label} required={required} error={error} hint={hint} id={id} className={className} size={size}>
      <div className="relative">
        {Icon && <Icon className={`absolute top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none ${size === 'lg' ? 'left-4 w-5 h-5' : 'left-3 w-4 h-4'}`} />}
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${inputCls} ${error ? errCls : okCls} ${Icon ? (size === 'lg' ? 'pl-12' : 'pl-9') : ''} ${trailing ? 'pr-12' : ''} ${size === 'lg' ? 'py-3.5! text-base! rounded-xl!' : ''}`}
          {...props}
        />
        {trailing && <div className="absolute right-3 top-1/2 -translate-y-1/2 flex">{trailing}</div>}
      </div>
    </Field>
  );
}

export function TextArea({ label, required, error, hint, className, ...props }) {
  const id = useId();
  return (
    <Field label={label} required={required} error={error} hint={hint} id={id} className={className}>
      <textarea id={id} aria-invalid={!!error} className={`${inputCls} ${error ? errCls : okCls} min-h-20`} {...props} />
    </Field>
  );
}

/** Native select (reliable on tablets and keyboards). options: [{ value, label }]. */
export function Select({ label, required, error, hint, className, options = [], placeholder = 'Select…', value, onChange, ...props }) {
  const id = useId();
  return (
    <Field label={label} required={required} error={error} hint={hint} id={id} className={className}>
      <select
        id={id}
        aria-invalid={!!error}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        className={`${inputCls} ${error ? errCls : okCls} cursor-pointer`}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

/** Accessible on/off switch. */
export function Toggle({ label, checked, onChange, disabled, description }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
      <label htmlFor={id} className="text-sm text-slate-700 cursor-pointer select-none">
        {label}
        {description && <span className="block text-[11px] text-slate-400">{description}</span>}
      </label>
    </div>
  );
}

/** Banner for form-level errors returned by the API. */
export function FormError({ message }) {
  if (!message) return null;
  return <div role="alert" className="animate-fadeIn mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{message}</div>;
}
