import { History } from 'lucide-react';
import SectionCard from '@/components/shopfloor/SectionCard.jsx';
import StatusPill from '@/components/shopfloor/StatusPill.jsx';
import Station from './Station.jsx';
import { td, th } from './tableStyles.js';
import { when } from '@/utils/dates.js';

/** the whole route (done / in process / pending); before /forms/unit answers, the stages started so far */
export default function ProcessHistory({ route, e }) {
  const { values, vis } = e;
  const steps = route ?? (vis('PnlHistory') ? (values.GVHistory ?? []).map((r) => ({ process: r.Process, station: r.Station, startedOn: r.StartedOn, completedOn: r.CompletedOn, status: r.CompletedOn ? 2 : 1 })) : []);
  const done = steps.filter((s) => s.status === 2).length;
  return (
    <SectionCard icon={History} title="Process History" actions={steps.length > 0 && <span className="text-sm tabular text-muted-foreground">{done} / {steps.length} done</span>}>
      {steps.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">The unit's route shows here after a serial scan.</p>
      ) : (
        <div className="max-h-96 overflow-auto -mx-1">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-muted/50">
              <tr><th className={th}>#</th><th className={th}>Process</th><th className={th}>Work Station</th><th className={th}>Started On</th><th className={th}>Completed On</th><th className={th}>Status</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {steps.map((s, i) => (
                <tr key={i} className={s.status === 1 ? 'bg-primary/40' : ''}>
                  <td className={`${td} tabular`}>{i + 1}</td>
                  <td className={td}>{s.process}</td>
                  <td className={td}>{s.station}</td>
                  <td className={`${td} tabular whitespace-nowrap`}>{when(s.startedOn)}</td>
                  <td className={`${td} tabular whitespace-nowrap`}>{when(s.completedOn)}</td>
                  <td className={td}><StatusPill status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
