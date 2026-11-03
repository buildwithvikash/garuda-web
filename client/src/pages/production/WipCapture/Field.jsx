import { EngineField } from '@/components/shared/FormControls.jsx';

/** A box of the station under its caption, when the screen shows it. `onChange`: a list that answers at once. */
export default function Field({ s, name, label, className = '', onChange }) {
  const f = s.view.fields[name];
  if (!f) return null;
  return (
    <div className={className}>
      <EngineField c={{ id: name, ...f }} label={label} value={s.value(name)} onChange={onChange ?? ((v) => s.type(name, v))} />
    </div>
  );
}
