import { EngineField } from '@/components/shared/FormControls.jsx';

/** An engine control by id, under a caption, when the page shows it. */
export default function Ctl({ e, id, label, className = '' }) {
  if (!e.vis(id)) return null;
  return (
    <div className={className}>
      <EngineField c={e.ctl(id)} label={label} value={e.values[id]} onChange={(v) => e.change(id, v)} />
    </div>
  );
}
