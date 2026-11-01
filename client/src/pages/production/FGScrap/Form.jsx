// FG Scrap: scan the unit, see its components, give the category and remark, save. Plain React: the state and server
// calls are in ./useScrap.js.
import { useEffect, useRef } from 'react';
import { Boxes, Save, ScanLine, Trash2 } from 'lucide-react';
import { Select, TextInput } from '@/components/shared/FormField.jsx';
import { Step } from '@/components/shared/FormStep.jsx';
import ScanBox from '@/components/shopfloor/ScanBox.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useScrap } from './useScrap.js';

const HEADERS = ['Category', 'Material', 'Process', 'Serial'];

function Components({ rows }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>{HEADERS.map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 && (
            <tr><td colSpan={HEADERS.length} className="px-3 py-6 text-center text-muted-foreground">Scan a unit to see its components.</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={`${r.serial}-${i}`}>
              <td className="px-3 py-2">{r.category}</td>
              <td className="px-3 py-2">{r.material}</td>
              <td className="px-3 py-2">{r.process}</td>
              <td className="px-3 py-2 tabular">{r.serial}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ScrapForm() {
  const s = useScrap();
  const unitRef = useRef(null);

  // the scanner's box is ready again whenever no unit is scanned
  useEffect(() => {
    if (!s.busy && !s.unitLocked) unitRef.current?.focus();
  }, [s.busy, s.unitLocked]);

  return (
    <div className="space-y-2">
      <Step n={1} tone="blue" icon={ScanLine} title="Unit" subtitle="Scan the unit to scrap">
        <div className="grid min-w-0 gap-2">
          <span className="text-sm leading-none font-medium">Scan barcode</span>
          <ScanBox ref={unitRef} size="md" label="Scan barcode" placeholder="Scan the unit" value={s.unit} onChange={(v) => s.change('unit', v)} locked={s.unitLocked} onScan={s.scanUnit} onClear={s.clearUnit} busy={s.busy && !s.unitLocked} />
        </div>
      </Step>
      <Step n={2} tone="emerald" icon={Boxes} title="Components" subtitle="What is scanned into this unit">
        <Components rows={s.components} />
      </Step>
      <Step
        n={3}
        tone="rose"
        icon={Trash2}
        title="Scrap details"
        subtitle="Why this unit is scrapped"
        actions={<Button size="sm" variant="destructive" icon={Save} loading={s.busy && s.unitLocked} disabled={!s.unitLocked} onClick={s.save}>Save</Button>}
      >
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <Select label="Scrap Category" required value={s.category} options={s.categories} disabled={!s.unitLocked} onChange={(v) => s.change('category', v ?? '')} error={s.errors.category} />
          <TextInput label="Remark" required maxLength={150} value={s.remark} disabled={!s.unitLocked} onChange={(e) => s.change('remark', e.target.value)} error={s.errors.remark} />
        </div>
      </Step>
    </div>
  );
}
