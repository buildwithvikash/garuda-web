// Production Plan Upload (sidebar: Production › Production Plan Upload): read an Excel sheet of monthly label plans, see it,
// then apply it; each row turns green (applied) or red (no match). ?view=list: the plans so far.
// Server: /api/production/plan-uploads.
import { useRef, useState } from 'react';
import { ArrowLeft, FileUp, List as ListIcon, Table2, Upload } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '@/api.js';
import { FileField } from '@/components/shared/FormControls.jsx';
import { Step } from '@/components/shared/FormStep.jsx';
import Page from '@/components/shared/Page.jsx';
import RecordsList from '@/components/shared/RecordsList.jsx';
import { Button } from '@/components/ui/button.jsx';

export const route = '/production/prodplanupload';

const BASE = '/production/plan-uploads';
const source = {
  list: (query) => api(`${BASE}?${query}`),
  columns: () => api(`${BASE}/columns`),
  values: (column) => api(`${BASE}/values/${encodeURIComponent(column)}`),
};
const HEADERS = { RECNO: 'Rec No', PlanNo: 'Plan No', PlanMonthYear: 'Plan Month Year', PlanMaterial: 'Plan Material', PlanQty: 'Plan Qty', PrintLbl: 'Print Lbl', PlanType: 'Plan Type', Remark: 'Remark', CreatedBy: 'Created By', CreatedOn: 'Created On', Status: 'Status' };

/** a key for one Update (crypto.randomUUID needs https or localhost; the plant may open the app over http) */
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const TONE = { true: 'bg-emerald-100 dark:bg-emerald-950', false: 'bg-rose-100 dark:bg-rose-950' };
const refuse = (message) => toast.error(message, { id: message, duration: 6000 });

function SheetUpload() {
  const [file, setFile] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [applied, setApplied] = useState([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());

  const read = async () => {
    setBusy(true);
    try {
      setSheet(await api(`${BASE}/read`, { method: 'POST', body: { file } }));
      setApplied([]);
      setDone(false);
      key.current = newKey();
    } catch (e) {
      refuse(e.message);
    } finally {
      setFile(null); // the picked file clears after each post, as the original's page did
      setBusy(false);
    }
  };
  const update = async () => {
    setBusy(true);
    try {
      const r = await api(BASE, { method: 'POST', body: sheet, headers: { 'Idempotency-Key': key.current } });
      key.current = newKey();
      setApplied(r.applied);
      if (r.error) refuse(r.error);
      else {
        setDone(true);
        toast.success('Done');
      }
    } catch (e) {
      refuse(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Step n={1} tone="blue" icon={FileUp} title="File" subtitle="The Excel sheet of plans">
        <div className="flex flex-wrap items-end gap-3">
          <FileField c={{ id: 'file' }} label="Upload Excel" value={file} onChange={setFile} />
          <Button icon={Upload} loading={busy} disabled={!file} onClick={read}>Import</Button>
        </div>
      </Step>
      {sheet && (
        <Step
          n={2}
          tone="emerald"
          icon={Table2}
          title="Rows"
          subtitle="Green: applied. Red: not this or next month, or the material is not known"
          actions={!done && <Button size="sm" loading={busy} onClick={update}>Update</Button>}
        >
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>{sheet.columns.map((c, i) => <th key={i} scope="col" className="px-3 py-2 font-medium">{c}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sheet.rows.map((r, i) => (
                  <tr key={i} className={TONE[applied[i]] ?? ''}>
                    {sheet.columns.map((_, j) => <td key={j} className="px-3 py-2">{r[j] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Step>
      )}
    </div>
  );
}

export default function ProductionPlanUpload() {
  const [params, setParams] = useSearchParams();
  const listing = params.get('view') === 'list';
  return (
    <Page
      icon={Upload}
      title="Production Plan Upload"
      subtitle={listing ? 'The plans so far' : 'Import the Excel sheet, then update'}
      actions={
        listing ? (
          <Button size="sm" variant="outline" icon={ArrowLeft} onClick={() => setParams({})}>Back to upload</Button>
        ) : (
          <Button size="sm" variant="outline" icon={ListIcon} onClick={() => setParams({ view: 'list' })}>Plans so far</Button>
        )
      }
    >
      {listing ? <RecordsList tableId={route} exportName="production-plan-upload" source={source} headers={HEADERS} /> : <SheetUpload />}
    </Page>
  );
}
