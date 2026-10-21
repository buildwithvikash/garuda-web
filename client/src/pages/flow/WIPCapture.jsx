// WIP Capture, scan-first: department and station once, then serial after serial. The scan's result decides what
// follows: a stage recorded (done), components to scan, a quality check or the FG label. Every button runs the same
// WIPCaptureForm handler on the server as before (/forms/event), so database writes and labels are unchanged; the
// route and cabinet cards read /forms/unit (read only).
import { AlertTriangle, BookOpen, Boxes, CheckCircle2, ClipboardList, History, Info, ListChecks, MessageSquare, Plus, RefreshCcw, Refrigerator, Save, ScanBarcode, ScanLine, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import Button from '../../ui/Button.jsx';
import { FormError } from '../../ui/fields.jsx';
import Loader from '../../ui/Loader.jsx';
import PageHeader from '../../ui/PageHeader.jsx';
import { GuideView, Panel } from '../forms/FormControls.jsx';
import Grid from '../forms/Grid.jsx';
import QCPanel from '../forms/QCPanel.jsx';
import useEngine from '../forms/useEngine.js';
import { beep, ComponentChecklist, Ctl, MuteButton, ResultBanner, ScanBox, SectionCard, StatusPill, useSpec, when } from './kit.jsx';

const PATH = '/production/wipcaptureform';
const TITLE = { icon: ScanBarcode, title: 'WIP Capture', subtitle: 'Capture, inspect and track WIP at each process' };

export default function WIPCapture() {
  const { spec, error } = useSpec(PATH);
  if (spec) return <Station spec={spec} />;
  return (
    <>
      <PageHeader {...TITLE} />
      <div className="p-4 animate-page">
        <FormError message={error} />
        {!error && <Loader />}
      </div>
    </>
  );
}

function Station({ spec }) {
  const navigate = useNavigate();
  const [banner, setBanner] = useState(spec.statusMessage ? { tone: 'error', title: 'Could not open the station', text: spec.statusMessage } : { tone: 'info', title: 'Scan the work station to begin' });
  // the last serial scan's verdict for the cabinet card: true accepted, false refused, null none yet
  const [serialOk, setSerialOk] = useState(null);
  const stationRef = useRef(null);
  const serialRef = useRef(null);
  const [unitTick, setUnitTick] = useState(0);
  const e = useEngine({
    path: PATH,
    state: spec,
    events: spec.events ?? [],
    onResult: (r, control) => {
      setUnitTick((t) => t + 1); // a scan, a QC save or a consume can move the unit along its route
      if (control === 'BtnWorderScan') setSerialOk(r.alert ? false : r.success ? true : null);
      if (control === 'BtnWorkStationScan') setSerialOk(null);
      if (r.alert) {
        beep(false);
        setBanner({ tone: 'error', title: 'Not accepted', text: r.alert });
      } else if (control === 'BtnWorkStationScan') setBanner({ tone: 'info', title: 'Station ready — scan a serial' });
      else if (r.success) {
        beep(true);
        // scanStageLabelNew's result: 11 the stage started (nothing to scan), 21 the stage completed
        const scanned = { 11: 'Stage started', 21: 'Stage completed' }[r.viewState?.I] ?? 'Scan recorded';
        setBanner({ tone: 'ok', title: control === 'btnQCSave' ? 'Quality result saved' : control === 'BtnInwardMaterial' ? 'Component consumed' : scanned, text: r.viewState?.LastScanned ? `Serial ${r.viewState.LastScanned}` : undefined });
      }
    },
  });
  const { values, viewState: vs, busy, fire, vis, ctl } = e;
  const text = (id) => ctl(id)?.text ?? '';
  const stationLocked = text('BtnWorkStationScan') === 'Clr';
  const serialLocked = text('BtnWorderScan') === 'Clr' || vis('QCPanel');
  const result = Number(vs.I ?? 0);
  const unit = useUnit(serialLocked ? String(values.TBJobCoard ?? '').trim() : '', unitTick);

  // the scanner always types into the box the operator needs next
  useEffect(() => {
    if (busy) return;
    (stationLocked ? serialRef : stationRef).current?.focus();
  }, [busy, stationLocked, serialLocked]);

  const scan = (button) => fire(button, values);
  const line = text('lblLine');

  return (
    <>
      <PageHeader {...TITLE}>
        <div className="flex flex-wrap items-center gap-2">
          {vis('DDLDepartment') && (
            <div className="flex items-center gap-2">
              <label htmlFor="f-DDLDepartment" className="text-sm font-semibold text-slate-700">Department</label>
              <Ctl e={e} id="DDLDepartment" label="" className="w-52" />
            </div>
          )}
          <Button variant="secondary" icon={BookOpen} aria-label="Station instructions" title="Station instructions" disabled={!stationLocked || busy} onClick={() => fire('BtnGuide')} />
          <MuteButton />
          <Button variant="secondary" icon={X} aria-label="Close WIP Capture" title="Close" className="text-rose-600!" onClick={() => navigate('/start')} />
        </div>
      </PageHeader>

      <div className="p-4 space-y-4 animate-page">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 1. scan */}
          <SectionCard icon={ScanLine} title="1. Scan & Identify" actions={line && <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">Selected Line : {line}</span>}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {vis('WorkStationPanel') && (
                  <div className="min-w-0">
                    <span className="label">Work Station</span>
                    <ScanBox
                      ref={stationRef}
                      size="md"
                      label="Work station"
                      placeholder="Scan the station"
                      value={values.TBWorkStation}
                      onChange={(v) => e.change('TBWorkStation', v)}
                      locked={stationLocked}
                      onScan={() => scan('BtnWorkStationScan')}
                      onClear={() => scan('BtnWorkStationScan')}
                      busy={busy && !stationLocked}
                    />
                  </div>
                )}
                {vis('JobCardPanel') && (
                  <div className="min-w-0">
                    <span className="label">Serial No.</span>
                    <ScanBox
                      ref={serialRef}
                      size="md"
                      label="Unit serial"
                      placeholder={stationLocked ? 'Scan the serial' : 'Scan the station first'}
                      value={values.TBJobCoard}
                      onChange={(v) => e.change('TBJobCoard', v)}
                      locked={serialLocked && text('BtnWorderScan') === 'Clr'}
                      onScan={() => scan('BtnWorderScan')}
                      onClear={() => scan('BtnWorderScan')}
                      busy={busy && stationLocked}
                    />
                  </div>
                )}
              </div>
              <Ctl e={e} id="DDLStationPrinter" label="Station printer" className="sm:w-1/2" />
              <ResultBanner {...(busy ? { tone: 'busy', title: 'Working…' } : banner)} />
              {vis('BtnRework') && (
                <div className="flex justify-center">
                  <Button size="lg" icon={RefreshCcw} className="min-w-56" onClick={() => scan('BtnRework')}>Move to Rework</Button>
                </div>
              )}
            </div>
          </SectionCard>

          <Cabinet unit={unit} e={e} serialOk={serialOk} line={line} />
        </div>

        <div className="grid gap-4 2xl:grid-cols-2">
          <ProcessHistory route={unit?.route} e={e} />
          <ComponentDetails e={e} />
        </div>

        {vis('InputMaterialPanel') && <Components e={e} />}
        {vis('QCPanel') && <Inspection e={e} fg={result === 40} />}
        {vis('InspectionCheckList') && (
          <QCPanel s={values.InspectionCheckList} busy={busy} onChange={(next) => e.setValues({ ...values, InspectionCheckList: next })} onEvent={(name, next = values.InspectionCheckList, arg, i) => fire(name.replace(/^QC:/, 'InspectionCheckList:'), { ...values, InspectionCheckList: next }, arg, e.controls, i)} />
        )}
        {vis('DefectHistoryPanel') && <Grid c={ctl('GVDefectHistory')} rows={values.GVDefectHistory} title={<span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-600" /> Defect history</span>} />}
        {vis('RightTopPanel') && <Guide e={e} />}
      </div>
    </>
  );
}

/** the scanned unit's route and cabinet (read only); refetched after every event while the serial stays scanned */
function useUnit(label, tick) {
  const [unit, setUnit] = useState(null);
  useEffect(() => {
    if (!label) return void setUnit(null);
    let live = true;
    api(`/forms/unit?path=${encodeURIComponent(PATH)}&label=${encodeURIComponent(label)}`).then(
      (d) => live && setUnit(d),
      () => live && setUnit(null),
    );
    return () => {
      live = false;
    };
  }, [label, tick]);
  return unit;
}

function Cabinet({ unit, e, serialOk, line }) {
  const { values, ctl } = e;
  const c = unit?.cabinet;
  const [model, serial] = String(values.tbFG ?? '').split('|');
  const rows = c
    ? [
        ['Model', c.name || model],
        ['Category', c.category],
        ...c.variants.map((v) => [v.name, v.value]),
        ['Customer Name', c.customer],
        ['Order', c.order],
        ['Line', line],
        ['Work Station', values.TBWorkStation],
      ]
    : model
      ? [['Model', model], ['Serial', serial], ['Line', line], ['Work Station', values.TBWorkStation]]
      : [];
  const order = values.DDLProdOrder && ctl('DDLProdOrder')?.options?.find((o) => o.value === values.DDLProdOrder)?.text;
  if (c && !c.order && order) rows.splice(rows.length - 2, 0, ['Order', order]);
  return (
    <SectionCard
      icon={Refrigerator}
      title="Cabinet Details"
      actions={
        serialOk === true ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Valid Serial No.</span>
        ) : serialOk === false ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700 ring-1 ring-rose-200"><AlertTriangle className="w-4 h-4" /> Serial not accepted</span>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Scan a serial to see the cabinet.</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="grid h-44 w-full shrink-0 place-items-center rounded-xl bg-slate-50 sm:h-auto sm:w-40">
            {c?.image ? <img src={c.image} alt={c.name} className="max-h-48 object-contain" /> : <Refrigerator className="w-16 h-16 text-slate-300" aria-hidden />}
          </div>
          <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            {rows
              .filter(([, v]) => v)
              .map(([k, v], i) => (
                <div key={`${k}-${i}`} className="contents">
                  <dt className="py-1 font-semibold text-slate-800">{k}</dt>
                  <dd className="truncate rounded-md bg-slate-50 px-2.5 py-1 text-slate-800" title={v}>{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </SectionCard>
  );
}

const th = 'px-2 py-2 text-left text-xs font-semibold text-slate-600';
const td = 'px-2 py-2 align-top text-slate-800';

/** the whole route (done / in process / pending); before /forms/unit answers, the stages started so far */
function ProcessHistory({ route, e }) {
  const { values, vis } = e;
  const steps = route ?? (vis('PnlHistory') ? (values.GVHistory ?? []).map((r) => ({ process: r.Process, station: r.Station, startedOn: r.StartedOn, completedOn: r.CompletedOn, status: r.CompletedOn ? 2 : 1 })) : []);
  const done = steps.filter((s) => s.status === 2).length;
  return (
    <SectionCard icon={History} title="Process History" actions={steps.length > 0 && <span className="text-sm tabular text-slate-500">{done} / {steps.length} done</span>}>
      {steps.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">The unit's route shows here after a serial scan.</p>
      ) : (
        <div className="max-h-96 overflow-auto -mx-1">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr><th className={th}>#</th><th className={th}>Process</th><th className={th}>Work Station</th><th className={th}>Started On</th><th className={th}>Completed On</th><th className={th}>Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {steps.map((s, i) => (
                <tr key={i} className={s.status === 1 ? 'bg-blue-50/40' : ''}>
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

/** the components scanned into the unit so far (GVComponents) */
function ComponentDetails({ e }) {
  const rows = e.vis('PnlComponents') ? (e.values.GVComponents ?? []) : [];
  return (
    <SectionCard icon={Boxes} title="Component Details" tone="green">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No components scanned into this unit yet.</p>
      ) : (
        <div className="max-h-96 overflow-auto -mx-1">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr><th className={th}>#</th><th className={th}>Category</th><th className={th}>Material</th><th className={th}>Station</th><th className={th}>Serial</th><th className={th}>Operator</th><th className={th}>Scanned On</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
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

/** result 10: the stage's components, scanned one by one (BtnINBarcode, then Consume when a quantity is asked) */
function Components({ e }) {
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
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
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

/** results 30 / 40: inspection lot, pass or fail with defects and remark, and for the FG stage serial / asset / tags */
function Inspection({ e, fg }) {
  const { values, busy, fire, vis, ctl } = e;
  const lot = values.GVWQCMaterial?.[0];
  const status = values.DDLWIPQCStatus;
  // 12 Approved, 13 Rejected (AVQuality status codes)
  const statusTint = status === '13' ? '[&_select]:border-rose-300 [&_select]:bg-rose-50' : status === '12' ? '[&_select]:border-emerald-300 [&_select]:bg-emerald-50' : '';
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
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Info className="w-4 h-4 text-blue-600" /> Inspection Information</h3>
              {lot && (
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-[minmax(0,2fr)_repeat(4,auto)]">
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <span className="label">Description</span>
                    <p className="truncate rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-800" title={lot.Description}>{lot.Description}</p>
                  </div>
                  {[['Approved Qty', lot.ApprovedQty], ['Reject Qty', lot.RejectedQty], ['Unit', lot.UomDesc], ['Inspection Lot No', lot.InspectionLotNo]].map(([k, v]) => (
                    <div key={k}>
                      <span className="label">{k}</span>
                      <p className="py-2 tabular text-slate-800">{v === '' || v == null ? '-' : v}</p>
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
                {vis('BtnUD') && <Button variant="secondary" icon={ListChecks} loading={busy} onClick={() => fire('BtnUD')}>Checklist</Button>}
              </div>
              {vis('FGLabelPanel') && (
                <div className="grid gap-3 sm:grid-cols-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
                  <Ctl e={e} id="TbFGSerialNo" label="FG serial number" />
                  <Ctl e={e} id="TbASsetTag" label="Asset tag" />
                  <Ctl e={e} id="TBGreenTag" label="Green tag" />
                </div>
              )}
            </div>

            {/* defects */}
            <div className="min-w-0 space-y-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-700"><AlertTriangle className="w-4 h-4" /> Add Defect Codes</h3>
              {vis('PanelDefects') ? (
                <>
                  <div className="flex items-end gap-2">
                    <Ctl e={e} id="DDLDefectCodes" label="Defect Code" className="min-w-0 flex-1" />
                    {vis('btnAdd') && <Button icon={Plus} loading={busy} onClick={() => fire('btnAdd')}>Add</Button>}
                  </div>
                  <Grid c={ctl('GVTransData')} rows={values.GVTransData} onDelete={(k, i) => fire('GVTransData:delete', values, k, e.controls, i)} />
                </>
              ) : (
                <p className="text-sm text-slate-600">Set the status to Rejected to record defects.</p>
              )}
            </div>

            {/* remark and save */}
            <div className="flex min-w-0 flex-col gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageSquare className="w-4 h-4 text-blue-600" /> Remark</h3>
              {vis('TBWQCRemark') ? <Ctl e={e} id="TBWQCRemark" label="" /> : <p className="text-sm text-slate-500">A remark can be added with defects.</p>}
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

/** the station's instructions and guide files */
function Guide({ e }) {
  const { values, fire, vis, ctl } = e;
  const files = ctl('LBGuideFiles');
  return (
    <Panel
      title={<span className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-blue-600" /> Station guide</span>}
      actions={<Button variant="ghost" size="sm" icon={X} onClick={() => fire('IMBGuideClose')}>Hide</Button>}
    >
      <div className="space-y-3">
        {files?.options?.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {!vis('RightTop') && ctl('GuideFileDisplayPanel')?.guide && <Button variant="secondary" size="sm" onClick={() => fire('BtnToggleGuide')}>Show document</Button>}
            {files.options.filter((o) => o.value !== '').map((o) => (
              <Button key={o.value} variant={values.LBGuideFiles === o.value ? 'primary' : 'secondary'} size="sm" onClick={() => e.change('LBGuideFiles', o.value)}>{o.text}</Button>
            ))}
          </div>
        )}
        {vis('RightBottom') && values.GVInstruction?.length > 0 && <Grid c={ctl('GVInstruction')} rows={values.GVInstruction} />}
        {vis('GuideFileDisplayPanel') && ctl('GuideFileDisplayPanel')?.guide && <GuideView g={ctl('GuideFileDisplayPanel').guide} />}
      </div>
    </Panel>
  );
}
