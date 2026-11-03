// WIP Capture (sidebar: Production › WIP Capture): scan the work station, scan a serial, and the cards react.
//   WipCapture/useStation.js    the station: its calls, one at a time, and what the operator typed
//   WipCapture/wipApi.js        /api/production/wip-capture
//   WipCapture/Cabinet.jsx      the scanned unit's cabinet and image
//   WipCapture/Components.jsx   components scanned, components to scan
//   WipCapture/Inspection.jsx   QC and FG label
//   WipCapture/Guide.jsx        the station's instructions and drawings
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BookOpen, CheckCircle2, RefreshCcw, RotateCw, ScanBarcode, ScanLine, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Grid from '@/components/shared/DataGrid.jsx';
import Loader from '@/components/shared/Loader.jsx';
import Page from '@/components/shared/Page.jsx';
import ChecklistTable from '@/components/shopfloor/ChecklistTable.jsx';
import { fittedCount } from '@/components/shopfloor/ComponentChecklist.jsx';
import MuteButton from '@/components/shopfloor/MuteButton.jsx';
import ScanBox from '@/components/shopfloor/ScanBox.jsx';
import ScanFlashHost, { flashError } from '@/components/shopfloor/ScanFlash.jsx';
import SectionCard from '@/components/shopfloor/SectionCard.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.jsx';
import { loadPref } from '@/utils/prefs.js';
import Cabinet from './WipCapture/Cabinet.jsx';
import { ComponentDetails, ComponentScan } from './WipCapture/Components.jsx';
import Field from './WipCapture/Field.jsx';
import Guide from './WipCapture/Guide.jsx';
import Inspection from './WipCapture/Inspection.jsx';
import { useStation } from './WipCapture/useStation.js';
import { wipApi } from './WipCapture/wipApi.js';

export const route = '/production/wipcaptureform';

const header = {
  icon: ScanBarcode,
  title: 'WIP Capture',
  subtitle: 'Capture, inspect and track WIP at each process',
};

/** a short tone: high for OK, a low buzz for an error (off when the operator muted it) */
function beep(ok) {
  if (loadPref('flow-mute', false)) return;
  try {
    const a = new AudioContext();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = ok ? 'sine' : 'square';
    o.frequency.value = ok ? 880 : 200;
    g.gain.value = 0.06;
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + (ok ? 0.12 : 0.45));
    o.onended = () => a.close();
  } catch {
    /* no audio device: silent */
  }
}

/** One popup per scan result (a new result replaces the previous popup, so they never pile up). */
function notify(kind, title, text) {
  // a refused scan: large in the middle of the screen, without stopping the scanning (ScanFlash)
  if (kind === 'error') {
    toast.dismiss('wip-scan');
    return void flashError(title, text);
  }
  const body = (
    <div>
      <p className="font-semibold">{title}</p>
      {text && <p className="text-sm opacity-80">{text}</p>}
    </div>
  );
  toast.success(body, { id: 'wip-scan', duration: 2500 });
}

/** what a recorded scan did */
const scanned = (result) => ({ started: 'Stage started', completed: 'Stage completed' })[result] ?? 'Scan recorded';

/** the scanned unit's route and cabinet (read only); read again after every answer while the serial stays scanned */
function useUnit(id, serial, tick) {
  const [unit, setUnit] = useState(null);
  useEffect(() => {
    if (!serial) return void setUnit(null);
    let live = true;
    wipApi.unit(id).then(
      (d) => live && setUnit(d),
      () => live && setUnit(null),
    );
    return () => {
      live = false;
    };
  }, [id, serial, tick]);
  return unit;
}

function Station({ opened }) {
  const navigate = useNavigate();
  const stationRef = useRef(null);
  const serialRef = useRef(null);
  // the last serial scanned at this station, shown under the scan boxes once the box is cleared for the next one
  const [last, setLast] = useState(null); // { serial, model, ok, note, at }
  const sentSerial = useRef(''); // the serial of the scan being answered

  const s = useStation(opened, (r, action) => {
    const v = r.station;
    if (action === 'unit' && sentSerial.current) {
      setLast({
        serial: sentSerial.current,
        model: r.model ?? '', // comes with the scan's history, even when the scan is refused
        ok: !r.alert,
        note: r.alert ? (r.explain?.title ?? 'Not accepted') : scanned(v?.result),
        at: new Date(),
      });
      sentSerial.current = '';
    }
    if (r.alert) {
      beep(false);
      // a refused scan explained (already completed here / not reached yet / not on its route, and where it is now)
      if (r.explain) notify('error', r.explain.title, r.explain.text);
      else notify('error', 'Not accepted', r.alert);
    } else if (action === 'station') notify('success', 'Station ready', 'Scan a serial');
    else if (r.success) {
      beep(true);
      notify(
        'success',
        action === 'saveQC' ? 'Quality result saved' : action === 'consume' ? 'Component consumed' : scanned(v?.result),
        v?.lastScanned ? `Serial ${v.lastScanned}` : undefined,
      );
    }
  });
  const { view, busy } = s;
  const stationLocked = view.station.locked;
  const serialLocked = view.unit.locked || !!view.inspection;
  const unit = useUnit(s.id, view.unit.serial, s.tick);

  // components still to fit at this stage: the scanner stays in the component box until the last one is fitted
  const parts = fittedCount(view.inputs?.rows);
  const scanningComponents = !!view.inputs?.canScan && parts.total > 0 && parts.fitted < parts.total;

  // the scanner always types into the box the operator needs next: the component box while components are left
  // (ComponentScan keeps it there), then the serial, or the station before that
  useEffect(() => {
    if (busy || scanningComponents) return;
    (stationLocked ? serialRef : stationRef).current?.focus();
  }, [busy, stationLocked, serialLocked, scanningComponents]);

  const scanUnit = () => {
    sentSerial.current = String(s.value('serial')).trim(); // for "Last scanned"
    return s.scanUnit();
  };

  return (
    <Page
      {...header}
      width="full"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {view.fields.department && (
            <div className="flex items-center gap-2">
              <label htmlFor="f-department" className="text-sm text-muted-foreground">
                Department
              </label>
              <Field s={s} name="department" label="" className="w-52" onChange={s.department} />
            </div>
          )}
          <Button variant="outline" icon={BookOpen} aria-label="Station instructions" title="Station instructions" disabled={!stationLocked || busy} onClick={s.openGuide} />
          <MuteButton />
          <Button variant="outline" icon={X} aria-label="Close WIP Capture" title="Close" onClick={() => navigate('/start')} />
        </div>
      }
    >
      {/* refused scans, large in the middle of the screen, without stopping the scanning */}
      <ScanFlashHost />
      {/* the scan card only as wide as its boxes, the scanned unit's cabinet (its artwork) taking the rest. Frozen at
          the top of the page (owner, 31 Oct 2026): components, inspection and the rest scroll under it */}
      <div className="sticky top-0 z-20 -mx-2 -mt-2 bg-background px-2 pt-2 pb-2 sm:-mx-3 sm:-mt-3 sm:px-3 sm:pt-3">
        {/* with an image (the stage's routing shows one) the scan card stays narrow so the picture has the room;
            without one, scan and cabinet share the row half and half (owner, 1 Nov 2026) */}
        <div className={`grid items-stretch gap-4 ${unit?.cabinet?.artwork?.kind ? 'lg:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]' : 'lg:grid-cols-2'}`}>
          <SectionCard
            icon={ScanLine}
            title="Scan"
            className="h-full"
            actions={
              view.line && (
                <Badge variant="success" dot>
                  Line: {view.line}
                </Badge>
              )
            }
          >
            <div className="max-w-xl space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                {view.station.shown && (
                  <div className="grid min-w-0 gap-2">
                    <span className="text-sm leading-none font-medium">Work station</span>
                    <ScanBox
                      ref={stationRef}
                      size="md"
                      label="Work station"
                      placeholder="Scan the station"
                      value={s.value('station')}
                      onChange={(v) => s.type('station', v)}
                      locked={stationLocked}
                      onScan={s.scanStation}
                      onClear={s.clearStation}
                      busy={busy && !stationLocked}
                    />
                  </div>
                )}
                {view.unit.shown && (
                  <div className="grid min-w-0 gap-2">
                    <span className="text-sm leading-none font-medium">Serial number</span>
                    <ScanBox
                      ref={serialRef}
                      size="md"
                      label="Unit serial"
                      placeholder={stationLocked ? 'Scan the serial' : 'Scan the station first'}
                      value={s.value('serial')}
                      onChange={(v) => s.type('serial', v)}
                      locked={view.unit.locked}
                      onScan={scanUnit}
                      onClear={s.clearUnit}
                      busy={busy && stationLocked}
                    />
                  </div>
                )}
                <Field s={s} name="stationPrinter" label="Station printer" className="md:col-span-2 lg:col-span-1" />
              </div>
              {view.rework && (
                <div className="flex justify-end">
                  {/* Rework Confirmation in a new tab, so this station stays as it is (the screen's BtnRework only
                      redirected there) */}
                  <Button asChild variant="outline">
                    <a href="/quality/reworkconfirmationnew" target="_blank" rel="noopener noreferrer">
                      <RefreshCcw />
                      Open rework page
                    </a>
                  </Button>
                </div>
              )}
              {last && (
                <div className={`rounded-lg border px-3 py-2.5 ${last.ok ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20'}`}>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Last scanned</span>
                    <span className="tabular">{last.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  <p className="mt-1 font-mono text-base font-semibold break-all">{last.serial}</p>
                  {last.model && <p className="text-sm font-medium break-words">{last.model}</p>}
                  <p className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${last.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                    {last.ok ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <X className="size-3.5" aria-hidden="true" />}
                    {last.note}
                  </p>
                </div>
              )}
            </div>
          </SectionCard>
          <Cabinet unit={unit} serial={view.unit.serial} model={view.unit.model} className="h-full" />
        </div>
      </div>
      <ComponentDetails rows={view.components} />

      {view.inputs && <ComponentScan s={s} />}
      {view.inspection && <Inspection s={s} />}
      {/* the checklist as a pop-up over the station (owner, 1 Nov 2026): the server opens it as soon as the serial is
          scanned (when the stage has one); Close checklist or Esc closes it, a click outside does not */}
      <Dialog open={!!view.checklist} onOpenChange={(open) => !open && !busy && s.checklistEvent('QC:close')}>
        <DialogContent
          showCloseButton={false}
          onInteractOutside={(ev) => ev.preventDefault()}
          className="w-[96vw] max-w-[96vw] gap-0 p-0 sm:max-w-[min(96vw,1400px)] [&>section]:rounded-lg [&>section]:border-0"
        >
          <DialogTitle className="sr-only">Checklist</DialogTitle>
          <DialogDescription className="sr-only">Check each item of the stage, then close the checklist</DialogDescription>
          {s.checklist && <ChecklistTable s={s.checklist} busy={busy} onChange={s.setChecklist} onEvent={s.checklistEvent} />}
        </DialogContent>
      </Dialog>
      {view.defectHistory && (
        <Grid
          c={view.defectHistory}
          rows={view.defectHistory.rows}
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" /> Defect history
            </span>
          }
        />
      )}
      {view.guide && <Guide s={s} />}
    </Page>
  );
}

export default function WipCapture() {
  const [opened, setOpened] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    wipApi.open().then(
      (o) => {
        setOpened(o);
        if (o.alert) toast.error(o.alert, { id: o.alert, duration: 6000 });
      },
      (e) => {
        setFailed(true);
        toast.error(e.message, { id: e.message, duration: 6000 });
      },
    );
  }, []);
  if (opened) return <Station opened={opened} />;
  return <Page {...header}>{failed ? <Button variant="outline" icon={RotateCw} onClick={() => window.location.reload()}>Try again</Button> : <Loader />}</Page>;
}
