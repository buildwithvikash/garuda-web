import { AlertTriangle, ClipboardList, Info, ListChecks, MessageSquare, Plus, Save, X } from 'lucide-react';
import Ctl from '@/components/shopfloor/Ctl.jsx';
import ScanBox from '@/components/shopfloor/ScanBox.jsx';
import SectionCard from '@/components/shopfloor/SectionCard.jsx';
import { Button } from '@/components/ui/button.jsx';
import Grid from '@/engine/Grid.jsx';

/** results 30 / 40: inspection lot, pass or fail with defects and remark, and for the FG stage serial / asset / tags */
export default function Inspection({ e, fg }) {
  const { values, busy, fire, vis, ctl } = e;
  const lot = values.GVWQCMaterial?.[0];
  const status = values.DDLWIPQCStatus;
  // 12 Approved, 13 Rejected (AVQuality status codes)
  const statusTint = status === '13' ? '[&_select]:border-rose-300 [&_select]:bg-rose-500/10' : status === '12' ? '[&_select]:border-emerald-300 [&_select]:bg-emerald-500/10' : '';
  return (
    <SectionCard
      icon={ClipboardList}
      title={fg ? 'FG Label & Inspection' : 'Inspection & Defect Recording'}
      tone="violet"
      actions={vis('btnQCClose') && <Button variant="ghost" size="sm" icon={X} onClick={() => fire('btnQCClose')}>Close</Button>}
    >
      <div className="space-y-4">
        {vis('BarcodePanel') && (
          <ScanBox size="md" label="Barcode" value={values.TBBarcode} onChange={(v) => e.change('TBBarcode', v)} onScan={() => fire('Go')} locked={ctl('Go')?.text === 'Clr'} onClear={() => fire('Go')} busy={busy} />
        )}
        {vis('OtherFields') && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {/* inspection information and the verdict */}
            <div className="space-y-4 min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Info className="w-4 h-4 text-primary" /> Inspection Information</h3>
              {lot && (
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-[minmax(0,2fr)_repeat(4,auto)]">
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <span className="text-sm leading-none font-medium">Description</span>
                    <p className="truncate rounded-lg bg-muted px-3 py-2 font-medium text-foreground" title={lot.Description}>{lot.Description}</p>
                  </div>
                  {[['Approved Qty', lot.ApprovedQty], ['Reject Qty', lot.RejectedQty], ['Unit', lot.UomDesc], ['Inspection Lot No', lot.InspectionLotNo]].map(([k, v]) => (
                    <div key={k}>
                      <span className="text-sm leading-none font-medium">{k}</span>
                      <p className="py-2 tabular text-foreground">{v === '' || v == null ? '-' : v}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Ctl e={e} id="DDLWIPQCStatus" label="Status" className={statusTint} />
                <Ctl e={e} id="DDLNextAction" label="Next Action" />
                <Ctl e={e} id="DDLDefectCate" label="Defect Category" />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Ctl e={e} id="TBQty" label="Quantity" className="w-32" />
                <Ctl e={e} id="TbBEENo" label="BEE number" className="w-48" />
                {vis('QCPrinterPanel') && <Ctl e={e} id="DDLQCPrinter" label="Label printer" className="w-56" />}
                {vis('BtnUD') && <Button variant="outline" icon={ListChecks} loading={busy} onClick={() => fire('BtnUD')}>Checklist</Button>}
              </div>
              {vis('FGLabelPanel') && (
                <div className="grid gap-3 sm:grid-cols-3 rounded-xl border border-primary/30 bg-primary/40 p-3">
                  <Ctl e={e} id="TbFGSerialNo" label="FG serial number" />
                  <Ctl e={e} id="TbASsetTag" label="Asset tag" />
                  <Ctl e={e} id="TBGreenTag" label="Green tag" />
                </div>
              )}
            </div>

            {/* defects */}
            <div className="min-w-0 space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/60 p-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300"><AlertTriangle className="w-4 h-4" /> Add Defect Codes</h3>
              {vis('PanelDefects') ? (
                <>
                  <div className="flex items-end gap-2">
                    <Ctl e={e} id="DDLDefectCodes" label="Defect Code" className="min-w-0 flex-1" />
                    {vis('btnAdd') && <Button icon={Plus} loading={busy} onClick={() => fire('btnAdd')}>Add</Button>}
                  </div>
                  <Grid c={ctl('GVTransData')} rows={values.GVTransData} onDelete={(k, i) => fire('GVTransData:delete', values, k, e.controls, i)} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Set the status to Rejected to record defects.</p>
              )}
            </div>

            {/* remark and save */}
            <div className="flex min-w-0 flex-col gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><MessageSquare className="w-4 h-4 text-primary" /> Remark</h3>
              {vis('TBWQCRemark') ? <Ctl e={e} id="TBWQCRemark" label="" /> : <p className="text-sm text-muted-foreground">A remark can be added with defects.</p>}
              <div className="mt-auto flex flex-wrap justify-end gap-2">
                {vis('btnQCClear') && <Button variant="ghost" onClick={() => fire('btnQCClear')}>Clear</Button>}
                {vis('btnQCSave') && (
                  <Button size="lg" icon={Save} loading={busy} className="min-w-44" onClick={() => fire('btnQCSave')}>
                    {fg ? 'Save and Print Label' : 'Save Record'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
