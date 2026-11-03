// The inspection at a QC stage or the FG label stage: pass or fail with defects and remark, and for the FG stage serial,
// asset and green tags.
import { AlertTriangle, ClipboardList, Info, ListChecks, MessageSquare, Plus, Save } from 'lucide-react';
import Grid from '@/components/shared/DataGrid.jsx';
import QuickPrinters from '@/components/shopfloor/QuickPrinters.jsx';
import SectionCard from '@/components/shopfloor/SectionCard.jsx';
import { Button } from '@/components/ui/button.jsx';
import Field from './Field.jsx';

export default function Inspection({ s }) {
  const { inspection: q, fields } = s.view;
  const status = s.value('status');
  // 12 Approved, 13 Rejected (AVQuality status codes): defects and a remark only for a rejected unit (owner, 31 Oct 2026)
  const rejected = status === '13';
  const statusTint =
    status === '13'
      ? '[&_select]:border-rose-300 [&_select]:bg-rose-500/10'
      : status === '12'
        ? '[&_select]:border-emerald-300 [&_select]:bg-emerald-500/10'
        : '';
  const fgLabel = fields.fgSerial || fields.assetTag || fields.greenTag;
  return (
    <SectionCard icon={ClipboardList} title={q.fg ? 'FG Label & Inspection' : 'Inspection & Defect Recording'} tone="violet">
      <div className="space-y-4">
        {q.open && (
          <div className={rejected ? 'grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'grid gap-4'}>
            {/* inspection information and the verdict */}
            <div className="min-w-0 space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Info className="h-4 w-4 text-primary" /> Inspection Information
              </h3>
              {q.material && (
                <div className="max-w-2xl text-sm">
                  <div className="min-w-0">
                    <span className="text-sm leading-none font-medium">Description</span>
                    <p className="truncate rounded-lg bg-muted px-3 py-2 font-medium text-foreground" title={q.material.description}>
                      {q.material.description}
                    </p>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Field s={s} name="status" label="Status" className={statusTint} onChange={s.status} />
                <Field s={s} name="nextAction" label="Next Action" />
                <Field s={s} name="defectCategory" label="Defect Category" onChange={s.defectCategory} />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Field s={s} name="inspectedQty" label="Quantity" className="w-32" />
                <Field s={s} name="bee" label="BEE number" className="w-48" />
                {/* two saved printers as buttons, the last one used picked by itself (per department, this device) */}
                <QuickPrinters
                  id="DDLQCPrinter"
                  field={fields.printer}
                  value={s.value('printer')}
                  onChange={(v) => s.type('printer', v)}
                  label="Label printer"
                  scope={s.value('department')}
                  className="min-w-56"
                />
                {q.canChecklist && (
                  <Button variant="outline" icon={ListChecks} loading={s.busy} onClick={s.openChecklist}>
                    Checklist
                  </Button>
                )}
              </div>
              {fgLabel && (
                <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:grid-cols-3">
                  <Field s={s} name="fgSerial" label="FG serial number" />
                  <Field s={s} name="assetTag" label="Asset tag" />
                  <Field s={s} name="greenTag" label="Green tag" />
                </div>
              )}
            </div>

            {/* defects: only for a rejected unit */}
            {rejected && (
              <div className="min-w-0 space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="h-4 w-4" /> Add Defect Codes
                </h3>
                {q.defects ? (
                  <>
                    <div className="flex items-end gap-2">
                      <Field s={s} name="defectCode" label="Defect Code" className="min-w-0 flex-1" />
                      {q.defects.canAdd && (
                        <Button icon={Plus} loading={s.busy} onClick={s.addDefect}>
                          Add
                        </Button>
                      )}
                    </div>
                    <Grid c={q.defects} rows={q.defects.rows} onDelete={s.removeDefect} />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Choose the defect category to add defect codes.</p>
                )}
              </div>
            )}

            {/* remark: only for a rejected unit */}
            {rejected && (
              <div className="flex min-w-0 flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MessageSquare className="h-4 w-4 text-primary" /> Remark
                </h3>
                {fields.remark ? <Field s={s} name="remark" label="" /> : <p className="text-sm text-muted-foreground">A remark can be added with the defects.</p>}
              </div>
            )}
          </div>
        )}
        {/* clear / save, whatever the status */}
        {q.open && (q.canClear || q.canSave) && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {q.canClear && (
              <Button variant="ghost" onClick={s.clearQC}>
                Clear
              </Button>
            )}
            {q.canSave && (
              <Button size="lg" icon={Save} loading={s.busy} className="min-w-44" onClick={s.saveQC}>
                {q.fg ? 'Save and Print Label' : 'Save Record'}
              </Button>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
