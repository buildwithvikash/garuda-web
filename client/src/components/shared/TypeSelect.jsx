// A dropdown searched by typing: the options narrow to the typed text once typing pauses (debounced, 250 ms), ↑ ↓
// Enter pick one, Esc closes; leaving the box without picking shows the picked option again. The list is drawn over
// the page (a portal), so a table's or a card's scroll box does not cut it off. NativeSelect uses it for big lists.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input.jsx';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 250;
const SHOWN = 200; // options listed at a time; typing narrows the rest

/** options: [{ value, text }] (an empty value, e.g. "Select A Value", is the list's "nothing chosen") */
export default function TypeSelect({ id, options, value, onPick, disabled, className, placeholder, ...aria }) {
  const [typed, setTyped] = useState(null); // the text being typed, or null: the picked option's name
  const [query, setQuery] = useState(''); // `typed`, once typing has paused
  const [box, setBox] = useState(null); // where the open list goes (the input's place on screen), or null: closed
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const listId = `${id ?? 'type-select'}-list`;
  const current = String(value ?? '');
  const none = options.find((o) => o.value === '');
  const name = current === '' ? '' : (options.find((o) => o.value === current)?.text ?? '');
  useEffect(() => {
    const t = setTimeout(() => (setQuery(typed ?? ''), setActive(0)), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [typed]);
  const q = query.trim().toLowerCase();
  const shown = (q ? options.filter((o) => o.value !== '' && o.text.toLowerCase().includes(q)) : options).slice(0, SHOWN);
  const openList = () => setBox(input.current?.getBoundingClientRect() ?? null);
  const close = () => (setBox(null), setTyped(null), setQuery(''));
  const pick = (o) => (close(), o.value !== current && onPick(o.value));
  function key(e) {
    if (e.key === 'ArrowDown') (e.preventDefault(), box ? setActive((a) => Math.min(a + 1, shown.length - 1)) : openList());
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
    else if (e.key === 'Enter') (e.preventDefault(), box && shown[active] && pick(shown[active])); // never submits the form
    else if (e.key === 'Escape' && box) (e.preventDefault(), close());
  }
  // a scroll or resize moves the input: close rather than leave the list floating in the old place
  useEffect(() => {
    if (!box) return;
    const moved = (e) => e.target?.id !== listId && close(); // the list's own scroll leaves it open
    window.addEventListener('scroll', moved, true);
    window.addEventListener('resize', close);
    return () => (window.removeEventListener('scroll', moved, true), window.removeEventListener('resize', close));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box]);
  return (
    <>
      <Input
        ref={input}
        id={id}
        className={cn('h-9 w-full text-sm', className)}
        value={typed ?? name}
        onChange={(e) => (setTyped(e.target.value), box || openList())}
        onFocus={(e) => (e.target.select(), openList())}
        onClick={() => box || openList()}
        onBlur={close}
        onKeyDown={key}
        placeholder={placeholder ?? none?.text ?? 'Type to search'}
        disabled={disabled}
        role="combobox"
        aria-expanded={!!box}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        {...aria}
      />
      {box &&
        createPortal(
          <ul id={listId} role="listbox" style={{ position: 'fixed', top: box.bottom + 4, left: box.left, width: Math.max(box.width, 240) }} className="z-[100] max-h-64 overflow-auto rounded-md border bg-popover p-1 text-[13px] text-popover-foreground shadow-md">
            {shown.length === 0 && <li className="px-2 py-1.5 text-muted-foreground">No match</li>}
            {shown.map((o, i) => (
              // mousedown, not click: the input's blur would close the list first
              <li key={i} role="option" aria-selected={o.value === current} onMouseDown={(e) => (e.preventDefault(), pick(o))} onMouseEnter={() => setActive(i)} className={cn('cursor-pointer rounded-sm px-2 py-1.5', i === active && 'bg-accent text-accent-foreground', o.value === current && 'font-semibold', o.value === '' && 'text-muted-foreground')}>
                {o.text}
              </li>
            ))}
            {!q && options.length > SHOWN && <li className="px-2 py-1.5 text-[11px] text-muted-foreground">Type to find the other {options.length - SHOWN}</li>}
          </ul>,
          document.body,
        )}
    </>
  );
}
