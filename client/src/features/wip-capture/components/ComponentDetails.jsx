import { Boxes } from 'lucide-react';
import SectionCard from '@/components/shopfloor/SectionCard.jsx';
import Station from './Station.jsx';
import { td, th } from './tableStyles.js';
import { when } from '@/utils/dates.js';

/** the components scanned into the unit so far (GVComponents) */
export default function ComponentDetails({ e }) {
  const rows = e.vis('PnlComponents') ? (e.values.GVComponents ?? []) : [];
  return (
    <SectionCard icon={Boxes} title="Component Details" tone="green">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No components scanned into this unit yet.</p>
      ) : (
        <div className="max-h-96 overflow-auto -mx-1">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-muted/50">
              <tr><th className={th}>#</th><th className={th}>Category</th><th className={th}>Material</th><th className={th}>Station</th><th className={th}>Serial</th><th className={th}>Operator</th><th className={th}>Scanned On</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className={`${td} tabular`}>{i + 1}</td>
                  <td className={td}>{r.Category}</td>
                  <td className={td}>{r.Material}</td>
                  <td className={td}>{r.Station}</td>
                  <td className={`${td} tabular whitespace-nowrap`}>{r.Serial}</td>
                  <td className={td}>{r.Operator}</td>
                  <td className={`${td} tabular whitespace-nowrap`}>{when(r.ScannedOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
