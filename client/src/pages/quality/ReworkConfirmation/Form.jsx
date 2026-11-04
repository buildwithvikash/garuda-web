// Rework Confirmation: scan the unit, see its inspection, confirm. The state and server calls are in ./useRework.js.
import { useEffect, useRef } from 'react';
import { History, ListChecks, Save, ScanLine, ShieldCheck, Tag } from 'lucide-react';
import Grid from '@/components/shared/DataGrid.jsx';
import { Select, TextInput } from '@/components/shared/FormField.jsx';
import { Step } from '@/components/shared/FormStep.jsx';
import QCPanel from '@/components/shared/QCPanel.jsx';
import ScanBox from '@/components/shopfloor/ScanBox.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useRework } from './useRework.js';

const auto = { id: 'grid', columns: [] };
const DEFECTS = { id: 'defects', columns: [{ kind: 'boundfield', dataField: 'defect', header: 'Defect' }, { kind: 'boundfield', dataField: 'code', header: 'DefectCode' }, { kind: 'boundfield', dataField: 'name', header: 'Name' }] };

export default function ReworkForm({ options, department, onDepartment, opened }) {
  const s = useRework({ options, department, opened });
  const box = useRef(null);
  const u = s.unit;

  useEffect(() => {
    if (!s.busy && !u) box.current?.focus();
  }, [s.busy, u]);

  return (
    <div className="space-y-2">
      <Step n={1} tone="blue" icon={ScanLine} title="Scan unit" subtitle="The unit sent to rework">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-2">
            <span className="text-sm leading-none font-medium">Unit barcode</span>
            <ScanBox ref={box} size="md" label="Unit barcode" placeholder="Scan the unit barcode" value={s.box} onChange={(v) => s.change('box', v)} locked={!!u} onScan={s.scan} onClear={s.clear} busy={s.busy} />
          </div>
          <Select label="Sub inventory" value={department} options={options.departments} onChange={(v) => onDepartment(v ?? '')} />
        </div>
      </Step>
      {u && (
        <>
          <Step n={2} tone="emerald" icon={Tag} title="Unit">
            <div className="space-y-4">
              {u.details.length > 0 && <Grid c={auto} rows={u.details} />}
              {u.process.length > 0 && <Grid c={auto} rows={u.process} />}
            </div>
          </Step>
          <Step
            n={3}
            tone="rose"
            icon={ShieldCheck}
            title="Inspection"
            actions={u.checklist.length > 0 && <Button size="sm" variant="outline" icon={ListChecks} loading={s.busy} onClick={s.openChecklist}>Quality parameters</Button>}
          >
            <div className="space-y-4">
              {u.hasInspection && (
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <TextInput label="Status" value={u.status} disabled />
                  <TextInput label="Next Action" value={u.nextAction} disabled />
                </div>
              )}
              {u.hasInspection && u.selfInspection.length > 0 && <Grid c={auto} rows={u.selfInspection} />}
              {u.hasInspection && u.defects.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-foreground">Inspection Defect</h4>
                  <Grid c={DEFECTS} rows={u.defects} />
                </>
              )}
            </div>
          </Step>
          {s.checklist && <QCPanel s={s.checklist} busy={s.busy} onChange={s.setChecklist} onEvent={s.checklistEvent} />}
          <Step n={4} tone="violet" icon={ShieldCheck} title="Confirmation" actions={<Button size="sm" icon={Save} loading={s.busy} onClick={s.save}>Save</Button>}>
            <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              {options.showRootCause && (
                <>
                  <Select label="Root Cause" value={s.rootCause} options={options.rootCauses} onChange={(v) => s.change('rootCause', v)} />
                  <Select label="Action Taken" value={s.actionTaken} options={options.actions} onChange={(v) => s.change('actionTaken', v)} />
                </>
              )}
              <TextInput label="Quantity" value={s.qty} onChange={(e) => s.change('qty', e.target.value)} />
              <TextInput label="Unit" value={u.uom} disabled />
              <Select label="Status" placeholder="" value={s.status} options={options.statuses} onChange={(v) => s.setStatus(v ?? '12')} />
              {s.status !== '12' && <Select label="Next action" placeholder="Select Action" value={s.newAction === '0' ? '' : s.newAction} options={options.newActions} onChange={(v) => s.change('newAction', v ?? '0')} />}
              <TextInput className="sm:col-span-2" label="Approver remark" value={s.remark} onChange={(e) => s.change('remark', e.target.value)} />
            </div>
          </Step>
          {u.history.length > 0 && (
            <Step n={5} tone="slate" icon={History} title="Rework history">
              <Grid c={auto} rows={u.history} />
            </Step>
          )}
        </>
      )}
    </div>
  );
}
