// RM Replacement: scan the unit, choose the old component (scanned, typed or picked from the unit's list), scan the new
// one. Plain React: the state and server calls are in ./useReplacement.js.
import { useEffect, useRef } from 'react';
import { RefreshCcw, ScanLine } from 'lucide-react';
import { Step } from '@/components/shared/FormStep.jsx';
import ScanBox from '@/components/shopfloor/ScanBox.jsx';
import { cn } from '@/lib/utils';
import { useReplacement } from './useReplacement.js';

const HEADERS = ['Category', 'Material', 'Process', 'Serial'];

/** the unit's components; a click on a raw material chooses it */
function Components({ rows, onPick, disabled }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-sm font-medium">Components (only raw material can be replaced)</h4>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>{HEADERS.map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={HEADERS.length} className="px-3 py-6 text-center text-muted-foreground">Scan a unit to see its components.</td></tr>
            )}
            {rows.map((r, i) => {
              const can = r.replaceable && !disabled;
              return (
                <tr
                  key={`${r.serial}-${i}`}
                  tabIndex={can ? 0 : undefined}
                  title={r.replaceable ? 'Choose this component' : 'Only raw material can be replaced'}
                  className={cn(can ? 'cursor-pointer hover:bg-muted/50 focus:bg-primary/5 focus:outline-none' : 'text-muted-foreground')}
                  onClick={() => can && onPick(r.serial)}
                  onKeyDown={(e) => can && e.key === 'Enter' && onPick(r.serial)}
                >
                  <td className="px-3 py-2">{r.category}</td>
                  <td className="px-3 py-2">{r.material}</td>
                  <td className="px-3 py-2">{r.process}</td>
                  <td className="px-3 py-2 tabular">{r.serial}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Scan = ({ title, children }) => (
  <div className="grid min-w-0 gap-2">
    <span className="text-sm leading-none font-medium">{title}</span>
    {children}
  </div>
);

export default function ReplacementForm() {
  const r = useReplacement();
  const unitRef = useRef(null);
  const existingRef = useRef(null);
  const newRef = useRef(null);

  // the scanner always types into the box the operator needs next
  useEffect(() => {
    if (r.busy) return;
    (!r.unitLocked ? unitRef : !r.existingLocked ? existingRef : newRef).current?.focus();
  }, [r.busy, r.unitLocked, r.existingLocked]);

  return (
    <div className="space-y-2">
      <Step n={1} tone="blue" icon={ScanLine} title="Unit" subtitle="Scan the unit whose component is replaced">
        <Scan title="Scan barcode">
          <ScanBox ref={unitRef} size="md" label="Scan barcode" placeholder="Scan the unit" value={r.unit} onChange={(v) => r.change('unit', v)} locked={r.unitLocked} onScan={r.scanUnit} onClear={r.clearUnit} busy={r.busy && !r.unitLocked} />
        </Scan>
      </Step>
      <Step n={2} tone="emerald" icon={RefreshCcw} title="Replace component" subtitle="Scan or type the existing component, or pick a raw material from the list; then scan the new one">
        <div className="grid gap-5 lg:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Scan title="Scan existing component">
              <ScanBox ref={existingRef} size="md" label="Scan existing component" placeholder={r.unitLocked ? 'Scan, type or pick from the list' : 'Scan the unit first'} value={r.existing} onChange={(v) => r.change('existing', v)} locked={r.existingLocked} disabled={!r.unitLocked} onScan={() => r.chooseExisting()} onClear={r.clearExisting} />
            </Scan>
            <Scan title="Scan new component">
              <ScanBox ref={newRef} size="md" label="Scan new component" placeholder={r.existingLocked ? 'Scan the new component' : 'Choose the existing component first'} value={r.replacement} onChange={(v) => r.change('replacement', v)} disabled={!r.existingLocked} onScan={r.replace} busy={r.busy && r.existingLocked} />
            </Scan>
          </div>
          <Components rows={r.components} onPick={r.chooseExisting} disabled={!r.unitLocked || r.existingLocked} />
        </div>
      </Step>
    </div>
  );
}
