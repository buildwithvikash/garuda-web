// A printer dropdown with two quick buttons (owner, 31 Oct 2026): the operator saves up to two of the list's printers as
// buttons and picks one with a tap instead of the dropdown. The buttons, and the printer used last, are kept on this
// device per department (each department has its own printers); with nothing chosen yet, the last one is picked.
import { useEffect, useState } from 'react';
import { Pin, Printer, X } from 'lucide-react';
import { EngineField } from '@/components/shared/FormControls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { loadPref, savePref } from '@/utils/prefs.js';

const SLOTS = 2;

/** e: the screen's engine; id: the printer dropdown's control; scope: what the printers belong to (the department) */
export default function QuickPrinters({ e, id, label, scope, className = '' }) {
  const key = `printers:${id}:${scope ?? ''}`;
  const lastKey = `printers:last:${id}:${scope ?? ''}`;
  const [slots, setSlots] = useState(() => loadPref(key, []));
  useEffect(() => setSlots(loadPref(key, [])), [key]);

  const shown = e.vis(id);
  const options = (e.ctl(id)?.options ?? []).filter((o) => String(o.value) !== '');
  const value = String(e.values[id] ?? '');
  const listed = (v) => options.some((o) => String(o.value) === String(v));
  const listKey = options.map((o) => o.value).join(',');

  // nothing chosen yet: the printer used last, when this list has it
  useEffect(() => {
    if (!shown || value) return;
    const last = loadPref(lastKey, null);
    if (last && listed(last)) e.change(id, String(last));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, listKey, lastKey]);
  // remember the printer used
  useEffect(() => {
    if (value) savePref(lastKey, value);
  }, [value, lastKey]);

  if (!shown) return null;

  const keep = (next) => {
    setSlots(next);
    savePref(key, next);
  };
  const chosen = options.find((o) => String(o.value) === value);
  const saved = slots.some((s) => String(s.value) === value);
  // a third printer saved replaces the older button
  const save = () => chosen && keep([...slots.filter((s) => String(s.value) !== value), { value: String(chosen.value), text: chosen.text }].slice(-SLOTS));

  return (
    <div className={className}>
      <EngineField c={e.ctl(id)} label={label} value={e.values[id]} onChange={(v) => e.change(id, v)} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {slots.map((s, i) => {
          const on = String(s.value) === value;
          return (
            <span key={s.value} className="inline-flex items-center">
              <Button
                type="button"
                size="sm"
                variant={on ? 'default' : 'outline'}
                icon={Printer}
                disabled={!listed(s.value)}
                title={listed(s.value) ? `Printer button ${i + 1}` : 'Not in this list of printers'}
                onClick={() => e.change(id, String(s.value))}
                className="rounded-r-none"
              >
                {s.text}
              </Button>
              <Button type="button" size="sm" variant="outline" aria-label={`Remove printer button ${i + 1}`} className="rounded-l-none border-l-0 px-2" onClick={() => keep(slots.filter((x) => x.value !== s.value))}>
                <X />
              </Button>
            </span>
          );
        })}
        {chosen && !saved && (
          <Button type="button" size="sm" variant="ghost" icon={Pin} onClick={save}>
            {slots.length < SLOTS ? 'Save as button' : 'Save as button (replaces the older one)'}
          </Button>
        )}
      </div>
    </div>
  );
}
