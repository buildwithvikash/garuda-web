import { Boxes, Plus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import ComponentChecklist from '@/components/shopfloor/ComponentChecklist.jsx';
import Ctl from '@/components/shopfloor/Ctl.jsx';
import ScanBox from '@/components/shopfloor/ScanBox.jsx';
import SectionCard from '@/components/shopfloor/SectionCard.jsx';
import { Button } from '@/components/ui/button.jsx';

/** result 10: the stage's components, scanned one by one (BtnINBarcode, then Consume when a quantity is asked) */
export default function ComponentScan({ e }) {
  const { values, busy, fire, vis } = e;
  const ref = useRef(null);
  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy]);
  return (
    <SectionCard icon={Boxes} title="2. Scan Components" tone="green" actions={<Button variant="ghost" size="sm" icon={X} onClick={() => fire('BTNCloseInputMaterialPanel')}>Close</Button>}>
      <div className="space-y-4">
        {vis('ScanINbarcodePanel') && (
          <ScanBox ref={ref} label="Component barcode" placeholder="Scan a component barcode" value={values.TBINItemCode} onChange={(v) => e.change('TBINItemCode', v)} onScan={() => fire('BtnINBarcode')} busy={busy} />
        )}
        {vis('InQtyPanel') && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-amber-500/30 bg-amber-500/60 p-3">
            <Ctl e={e} id="TBInQty" label="Quantity to consume" className="w-40" />
            <Ctl e={e} id="ddlINUom" label="Unit" className="w-32" />
            <Button icon={Plus} loading={busy} onClick={() => fire('BtnInwardMaterial')}>Consume</Button>
          </div>
        )}
        <ComponentChecklist rows={values.GVINMaterial} />
      </div>
    </SectionCard>
  );
}
