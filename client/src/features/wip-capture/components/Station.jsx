import { AlertTriangle, BookOpen, RefreshCcw, ScanLine, X } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Ctl from '@/components/shopfloor/Ctl.jsx';
import MuteButton from '@/components/shopfloor/MuteButton.jsx';
import ResultBanner from '@/components/shopfloor/ResultBanner.jsx';
import ScanBox from '@/components/shopfloor/ScanBox.jsx';
import SectionCard from '@/components/shopfloor/SectionCard.jsx';
import { beep } from '@/components/shopfloor/sound.js';
import { Button } from '@/components/ui/button.jsx';
import Page from '@/components/shared/Page.jsx';
import Grid from '@/engine/Grid.jsx';
import QCPanel from '@/engine/QCPanel.jsx';
import useEngine from '@/engine/useEngine.js';
import Cabinet from './Cabinet.jsx';
import ComponentDetails from './ComponentDetails.jsx';
import ComponentScan from './ComponentScan.jsx';
import Guide from './Guide.jsx';
import Inspection from './Inspection.jsx';
import ProcessHistory from './ProcessHistory.jsx';
import { useUnit } from '../hooks/useUnit.js';
import { header as TITLE, route as PATH } from '../constants.js';

export default function Station({ spec }) {
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
    <Page
      {...TITLE}
      width="full"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {vis('DDLDepartment') && (
            <div className="flex items-center gap-2">
              <label htmlFor="f-DDLDepartment" className="text-sm font-semibold text-foreground/80">Department</label>
              <Ctl e={e} id="DDLDepartment" label="" className="w-52" />
            </div>
          )}
          <Button variant="outline" icon={BookOpen} aria-label="Station instructions" title="Station instructions" disabled={!stationLocked || busy} onClick={() => fire('BtnGuide')} />
          <MuteButton />
          <Button variant="outline" icon={X} aria-label="Close WIP Capture" title="Close" className="text-rose-700 dark:text-rose-300!" onClick={() => navigate('/start')} />
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 1. scan */}
          <SectionCard icon={ScanLine} title="1. Scan & Identify" actions={line && <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200">Selected Line : {line}</span>}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {vis('WorkStationPanel') && (
                  <div className="min-w-0">
                    <span className="text-sm leading-none font-medium">Work Station</span>
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
                    <span className="text-sm leading-none font-medium">Serial No.</span>
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

        {vis('InputMaterialPanel') && <ComponentScan e={e} />}
        {vis('QCPanel') && <Inspection e={e} fg={result === 40} />}
        {vis('InspectionCheckList') && (
          <QCPanel s={values.InspectionCheckList} busy={busy} onChange={(next) => e.setValues({ ...values, InspectionCheckList: next })} onEvent={(name, next = values.InspectionCheckList, arg, i) => fire(name.replace(/^QC:/, 'InspectionCheckList:'), { ...values, InspectionCheckList: next }, arg, e.controls, i)} />
        )}
        {vis('DefectHistoryPanel') && <Grid c={ctl('GVDefectHistory')} rows={values.GVDefectHistory} title={<span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-300" /> Defect history</span>} />}
        {vis('RightTopPanel') && <Guide e={e} />}
      </div>
    </Page>
  );
}
