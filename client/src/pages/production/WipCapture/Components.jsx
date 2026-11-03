// The components: those scanned into the unit so far, and the stage's still to scan.
import { useEffect, useRef } from 'react';
import { Boxes, Plus, X } from 'lucide-react';
import ComponentChecklist, { fittedCount } from '@/components/shopfloor/ComponentChecklist.jsx';
import ScanBox from '@/components/shopfloor/ScanBox.jsx';
import SectionCard from '@/components/shopfloor/SectionCard.jsx';
import { Button } from '@/components/ui/button.jsx';
import { when } from '@/utils/dates.js';
import Field from './Field.jsx';

const th = 'px-4 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground';
const td = 'px-4 py-3 align-middle text-sm whitespace-nowrap';

/** the components scanned into the unit so far */
export function ComponentDetails({ rows, className }) {
  return (
    <SectionCard
      icon={Boxes}
      title="Components"
      flush
      className={className}
      actions={rows.length > 0 && <span className="text-xs text-muted-foreground tabular">{rows.length} scanned</span>}
    >
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No components scanned into this unit yet.</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-160">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className={th}>#</th>
                <th className={th}>Category</th>
                <th className={th}>Material</th>
                <th className={th}>Station</th>
                <th className={th}>Serial</th>
                <th className={th}>Operator</th>
                <th className={th}>Scanned on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className={`${td} tabular text-muted-foreground`}>{i + 1}</td>
                  <td className={td}>{r.Category}</td>
                  <td className={`${td} font-medium`}>{r.Material}</td>
                  <td className={td}>{r.Station}</td>
                  <td className={`${td} tabular`}>{r.Serial}</td>
                  <td className={td}>{r.Operator}</td>
                  <td className={`${td} tabular`}>{when(r.ScannedOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

/** the stage's components, scanned one by one (then Consume when a quantity is asked) */
export function ComponentScan({ s }) {
  const { inputs } = s.view;
  const count = fittedCount(inputs.rows);
  const ref = useRef(null);
  // the component box keeps the cursor after every scan until all are fitted (then the page moves it to the serial)
  const left = count.total > 0 && count.fitted < count.total;
  useEffect(() => {
    if (!s.busy && left) ref.current?.focus();
  }, [s.busy, left, count.fitted]);
  return (
    <SectionCard
      icon={Boxes}
      title="Scan components"
      tone="green"
      actions={
        <Button variant="ghost" size="sm" icon={X} onClick={s.closeInputs}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        {/* the scan box, and how many of the stage's components are fitted */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          {inputs.canScan && (
            <div className="min-w-0 flex-1">
              <ScanBox
                ref={ref}
                size="lg"
                label="Component barcode"
                placeholder="Scan a component barcode"
                value={s.value('component')}
                onChange={(v) => s.type('component', v)}
                onScan={s.scanComponent}
                busy={s.busy}
              />
            </div>
          )}
          {count.total > 0 && (
            <div className={`flex h-16 shrink-0 items-center gap-2 rounded-xl border px-5 ${count.fitted === count.total ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200' : 'bg-muted/40'}`}>
              <span className="text-3xl font-bold tabular">
                {count.fitted} / {count.total}
              </span>
              <span className="text-sm font-medium">{count.fitted === count.total ? 'All fitted ✓' : `fitted · ${count.total - count.fitted} to go`}</span>
            </div>
          )}
        </div>
        {inputs.askQty && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <Field s={s} name="qty" label="Quantity to consume" className="w-40" />
            <Field s={s} name="uom" label="Unit" className="w-32" />
            <Button icon={Plus} loading={s.busy} onClick={s.consume}>
              Consume
            </Button>
          </div>
        )}
        <ComponentChecklist rows={inputs.rows} />
      </div>
    </SectionCard>
  );
}
