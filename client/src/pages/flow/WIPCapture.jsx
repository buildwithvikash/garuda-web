// WIP Capture, scan-first: department and station once, then serial after serial. The scan's result decides what
// follows: a stage recorded (done), components to scan, a quality check or the FG label. Every button runs the same
// WIPCaptureForm handler on the server as before (/forms/event), so database writes and labels are unchanged.
import { BookOpen, Boxes, ClipboardCheck, Factory, History, ListChecks, Plus, RefreshCcw, Route, Save, Tag, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import Badge from '../../ui/Badge.jsx';
import Button from '../../ui/Button.jsx';
import { FormError } from '../../ui/fields.jsx';
import Loader from '../../ui/Loader.jsx';
import PageHeader from '../../ui/PageHeader.jsx';
import { GuideView, Panel } from '../forms/FormControls.jsx';
import Grid from '../forms/Grid.jsx';
import QCPanel from '../forms/QCPanel.jsx';
import useEngine from '../forms/useEngine.js';
import { beep, ComponentChecklist, Ctl, MuteButton, ResultBanner, RouteProgress, ScanBox, StepTrack, useSpec } from './kit.jsx';

const PATH = '/production/wipcaptureform';

export default function WIPCapture() {
  const { spec, error } = useSpec(PATH);
  return (
    <>
      <PageHeader icon={Factory} title="WIP Capture" subtitle="Scan the station, then each unit's serial">
        <MuteButton />
      </PageHeader>
      <div className="p-4 animate-page">
        <FormError message={error} />
        {spec ? <Station spec={spec} /> : !error && <Loader />}
      </div>
    </>
  );
}

function Station({ spec }) {
  const [banner, setBanner] = useState(spec.statusMessage ? { tone: 'error', title: 'Could not open the station', text: spec.statusMessage } : { tone: 'info', title: 'Scan the work station to begin' });
  const stationRef = useRef(null);
  const serialRef = useRef(null);
  const [routeTick, setRouteTick] = useState(0);
  const e = useEngine({
    path: PATH,
    state: spec,
    events: spec.events ?? [],
    onResult: (r, control) => {
      setRouteTick((t) => t + 1); // a scan, a QC save or a consume can move the unit along its route
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
  const route = useRoute(serialLocked ? String(values.TBJobCoard ?? '').trim() : '', routeTick);
  const stage = vis('InputMaterialPanel') ? 'components' : vis('QCPanel') ? (result === 40 ? 'fg' : 'qc') : null;

  // the scanner always types into the box the operator needs next
  useEffect(() => {
    if (busy) return;
    (stationLocked ? serialRef : stationRef).current?.focus();
  }, [busy, stationLocked, serialLocked]);

  const scan = (button) => fire(button, values);
  const [model, serial] = String(values.tbFG ?? '').split('|');
  const stageName = stage === 'components' ? 'Scan components' : stage === 'qc' ? 'Quality check' : stage === 'fg' ? 'FG label' : 'Stage';

  return (
    <div className="space-y-4">
      {/* station setup */}
      <section className="card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <Ctl e={e} id="DDLDepartment" label="Department" className="w-64" />
          <div>
            <span className="label">Line</span>
            <Badge variant="primary" dot>{text('lblLine') || '—'}</Badge>
          </div>
          {vis('WorkStationPanel') && (
            <div className="min-w-72 flex-1">
              <span className="label">Work station</span>
              <ScanBox
                ref={stationRef}
                label="Work station"
                placeholder="Scan the station barcode"
                value={values.TBWorkStation}
                onChange={(v) => e.change('TBWorkStation', v)}
                locked={stationLocked}
                onScan={() => scan('BtnWorkStationScan')}
                onClear={() => scan('BtnWorkStationScan')}
                busy={busy && !stationLocked}
              />
            </div>
          )}
          <Ctl e={e} id="DDLStationPrinter" label="Station printer" className="w-56" />
          {vis('BtnRework') && (
            <Button variant="secondary" icon={RefreshCcw} onClick={() => scan('BtnRework')}>Move to rework</Button>
          )}
        </div>
      </section>

      <StepTrack
        steps={[
          { label: 'Station', state: stationLocked ? 'done' : 'now' },
          { label: 'Serial', state: serialLocked ? 'done' : stationLocked ? 'now' : 'wait' },
          { label: stageName, state: stage ? 'now' : 'wait' },
        ]}
      />

      {vis('JobCardPanel') && (
        <section className="card p-4 space-y-3">
          <span className="eyebrow">Unit serial / stage label</span>
          <ScanBox
            ref={serialRef}
            label="Unit serial"
            placeholder={stationLocked ? 'Scan the serial' : 'Scan the station first'}
            value={values.TBJobCoard}
            onChange={(v) => e.change('TBJobCoard', v)}
            locked={serialLocked && text('BtnWorderScan') === 'Clr'}
            onScan={() => scan('BtnWorderScan')}
            onClear={() => scan('BtnWorderScan')}
            busy={busy}
          />
        </section>
      )}

      <ResultBanner {...(busy ? { tone: 'busy', title: 'Working…' } : banner)} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4 min-w-0">
          {vis('InputMaterialPanel') && <Components e={e} />}
          {vis('QCPanel') && <Quality e={e} fg={result === 40} />}
          {vis('InspectionCheckList') && (
            <QCPanel s={values.InspectionCheckList} busy={busy} onChange={(next) => e.setValues({ ...values, InspectionCheckList: next })} onEvent={(name, next = values.InspectionCheckList, arg, i) => fire(name.replace(/^QC:/, 'InspectionCheckList:'), { ...values, InspectionCheckList: next }, arg, e.controls, i)} />
          )}
          {vis('RightTopPanel') && <Guide e={e} />}
        </div>

        <aside className="space-y-4 min-w-0">
          {vis('PnlModelDetails') && values.tbFG && (
            <Panel title={<span className="flex items-center gap-2"><Tag className="w-4 h-4 text-blue-600" /> Unit</span>}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-slate-500">Model</dt>
                <dd className="font-semibold text-slate-900">{model}</dd>
                <dt className="text-slate-500">Serial</dt>
                <dd className="font-semibold tabular text-slate-900">{serial}</dd>
                {values.DDLProdOrder && (
                  <>
                    <dt className="text-slate-500">Order</dt>
                    <dd className="tabular text-slate-800">{ctl('DDLProdOrder')?.options?.find((o) => o.value === values.DDLProdOrder)?.text ?? values.DDLProdOrder}</dd>
                  </>
                )}
              </dl>
            </Panel>
          )}
          {route?.length > 0 && (
            <Panel title={<span className="flex items-center gap-2"><Route className="w-4 h-4 text-blue-600" /> Route progress</span>}>
              <RouteProgress steps={route} />
            </Panel>
          )}
          {vis('PnlHistory') && <Grid c={ctl('GVHistory')} rows={values.GVHistory} title={<span className="flex items-center gap-2"><History className="w-4 h-4 text-blue-600" /> Route history</span>} />}
          {vis('PnlComponents') && <Grid c={ctl('GVComponents')} rows={values.GVComponents} title={<span className="flex items-center gap-2"><Boxes className="w-4 h-4 text-blue-600" /> Components fitted</span>} />}
          {vis('DefectHistoryPanel') && <Grid c={ctl('GVDefectHistory')} rows={values.GVDefectHistory} title="Defect history" />}
        </aside>
      </div>
    </div>
  );
}

/** the scanned unit's route (read only); refetched after every event while the serial stays scanned */
function useRoute(label, tick) {
  const [steps, setSteps] = useState(null);
  useEffect(() => {
    if (!label) return void setSteps(null);
    let live = true;
    api(`/forms/route?path=${encodeURIComponent(PATH)}&label=${encodeURIComponent(label)}`).then(
      (d) => live && setSteps(d.steps),
      () => live && setSteps(null),
    );
    return () => {
      live = false;
    };
  }, [label, tick]);
  return steps;
}

/** result 10: the stage's components, scanned one by one (BtnINBarcode, then Consume when a quantity is asked) */
function Components({ e }) {
  const { values, busy, fire, vis } = e;
  const ref = useRef(null);
  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy]);
  return (
    <Panel
      title={<span className="flex items-center gap-2"><Boxes className="w-4 h-4 text-blue-600" /> Scan components</span>}
      actions={<Button variant="ghost" size="sm" icon={X} onClick={() => fire('BTNCloseInputMaterialPanel')}>Close</Button>}
    >
      <div className="space-y-4">
        <ComponentChecklist rows={values.GVINMaterial} />
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
      </div>
    </Panel>
  );
}

/** results 30 / 40: pass or fail with defects, the checklist, and for the FG stage the serial / asset / green tag */
function Quality({ e, fg }) {
  const { values, busy, fire, vis, ctl } = e;
  const status = ctl('DDLWIPQCStatus');
  return (
    <Panel
      title={<span className="flex items-center gap-2">{fg ? <Tag className="w-4 h-4 text-blue-600" /> : <ClipboardCheck className="w-4 h-4 text-blue-600" />} {fg ? 'FG label' : 'Quality check'}</span>}
      actions={vis('btnQCClose') && <Button variant="ghost" size="sm" icon={X} onClick={() => fire('btnQCClose')}>Close</Button>}
    >
      <div className="space-y-4">
        {vis('GVWQCMaterial') && values.GVWQCMaterial?.length > 0 && <Grid c={ctl('GVWQCMaterial')} rows={values.GVWQCMaterial} />}
        {vis('BarcodePanel') && (
          <ScanBox label="Barcode" value={values.TBBarcode} onChange={(v) => e.change('TBBarcode', v)} onScan={() => fire('Go')} locked={ctl('Go')?.text === 'Clr'} onClear={() => fire('Go')} busy={busy} />
        )}
        {vis('OtherFields') && (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <Ctl e={e} id="TBQty" label="Quantity" className="w-32" />
              {vis('DDLWIPQCStatus') && (
                <div>
                  <span className="label">Result</span>
                  <div className="flex gap-2" role="radiogroup" aria-label="Result">
                    {status.options.filter((o) => o.value !== '').map((o) => {
                      const on = values.DDLWIPQCStatus === o.value;
                      const pass = o.value === '12';
                      return (
                        <button
                          key={o.value}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={!status.enabled || busy}
                          onClick={() => e.change('DDLWIPQCStatus', o.value)}
                          className={`h-12 min-w-28 rounded-xl border-2 px-5 text-base font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${on ? (pass ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-rose-600 bg-rose-600 text-white') : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`}
                        >
                          {o.text}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {vis('BtnUD') && <Button variant="secondary" icon={ListChecks} loading={busy} onClick={() => fire('BtnUD')}>Checklist</Button>}
              <Ctl e={e} id="DDLNextAction" label="Next action" className="w-52" />
            </div>

            {vis('PanelDefects') && (
              <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Ctl e={e} id="DDLDefectCate" label="Defect category" className="w-56" />
                  <Ctl e={e} id="DDLDefectCodes" label="Defect" className="w-64" />
                  {vis('btnAdd') && <Button variant="secondary" icon={Plus} loading={busy} onClick={() => fire('btnAdd')}>Add defect</Button>}
                </div>
                <Grid c={ctl('GVTransData')} rows={values.GVTransData} onDelete={(k, i) => fire('GVTransData:delete', values, k, e.controls, i)} />
                <Ctl e={e} id="TBWQCRemark" label="Remark" />
              </div>
            )}

            {vis('FGLabelPanel') && (
              <div className="grid gap-3 sm:grid-cols-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
                <Ctl e={e} id="TbFGSerialNo" label="FG serial number" />
                <Ctl e={e} id="TbASsetTag" label="Asset tag" />
                <Ctl e={e} id="TBGreenTag" label="Green tag" />
              </div>
            )}
            <div className="flex flex-wrap items-end gap-4">
              <Ctl e={e} id="TbBEENo" label="BEE number" className="w-56" />
              {vis('QCPrinterPanel') && <Ctl e={e} id="DDLQCPrinter" label="Label printer" className="w-64" />}
              <div className="ml-auto flex gap-2">
                {vis('btnQCClear') && <Button variant="ghost" onClick={() => fire('btnQCClear')}>Clear</Button>}
                {vis('btnQCSave') && (
                  <Button size="lg" icon={Save} loading={busy} onClick={() => fire('btnQCSave')}>
                    {fg ? 'Save and print label' : 'Save result'}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
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
