import { Children, isValidElement } from 'react';
import { ChevronDown } from 'lucide-react';
import TypeSelect from '@/components/shared/TypeSelect.jsx';
import { cn } from '@/lib/utils';

/** a list longer than this is searched by typing (TypeSelect) instead of scrolled */
export const BIG_LIST = 15;

const textOf = (node) => Children.toArray(node).map((x) => (isValidElement(x) ? textOf(x.props.children) : String(x))).join('');
/** the <option>s among the children, as { value, text } */
const optionsOf = (children) =>
  Children.toArray(children)
    .filter((x) => isValidElement(x) && x.type === 'option')
    .map((x) => ({ value: String(x.props.value ?? textOf(x.props.children)), text: textOf(x.props.children) }));

/**
 * A native <select> in the shadcn look. Use it for form dropdowns: it is reliable on tablets and with a keyboard, and
 * accepts an empty value (which the Radix Select does not). `<NativeSelect><option value="1">One</option></NativeSelect>`
 * A single-choice list of more than BIG_LIST options is drawn as a type-to-search box instead (debounced); onChange
 * still gets `{ target: { value } }`.
 */
function NativeSelect({ className, children, ...props }) {
  const options = !props.multiple && !(props.size > 1) ? optionsOf(children) : [];
  if (options.length > BIG_LIST) {
    const { value, onChange, disabled, id, placeholder, required, name } = props;
    const aria = Object.fromEntries(Object.entries(props).filter(([k]) => k.startsWith('aria-') || k === 'title'));
    return (
      <TypeSelect
        id={id}
        options={options}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
        name={name}
        className={cn(className, 'cursor-text')}
        onPick={(v) => onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } })}
        {...aria}
      />
    );
  }
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
