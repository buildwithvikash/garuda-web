// ════════════════════════════════════════════════════════════════════════════════
//  WIP Capture
//  Sidebar: Production › WIP Capture
//
//  THIS FILE IS THE WHOLE PAGE. Change how it works or looks right here: nothing in this
//  file is used by any other page. Only the UI pieces are shared (@/components/ui = shadcn,
//  @/components/shared = Page, Section, DataTable, Modal ...).
//
//  Map of this file
//    1. SETTINGS         route and header                                  <- start here
//    2. SMALL HELPERS    scan sound, first load, table cell styles
//    3. STATE + ENGINE   events to the server and the reply
//    4. THE SCANNED UNIT route and components of the scanned serial
//    5. CARDS            cabinet, history, components, inspection, guide
//    6. STATION          the screen itself
//    7. PAGE             loads the screen
// ════════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RotateCw, AlertTriangle,
  BookOpen,
  Boxes,
  CheckCircle2,
  ClipboardList,
  History,
  Info,
  ListChecks,
  MessageSquare,
  Plus,
  RefreshCcw,
  Refrigerator,
  Save,
  ScanBarcode,
  ScanLine,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/api.js";
import Grid from "@/components/shared/DataGrid.jsx";
import { GuideView, Panel } from "@/components/shared/FormControls.jsx";
import Loader from "@/components/shared/Loader.jsx";
import Page from "@/components/shared/Page.jsx";
import QCPanel from "@/components/shared/QCPanel.jsx";
import ComponentChecklist from "@/components/shopfloor/ComponentChecklist.jsx";
import Ctl from "@/components/shopfloor/Ctl.jsx";
import MuteButton from "@/components/shopfloor/MuteButton.jsx";
import ScanBox from "@/components/shopfloor/ScanBox.jsx";
import SectionCard from "@/components/shopfloor/SectionCard.jsx";
import StatusPill from "@/components/shopfloor/StatusPill.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { when } from "@/utils/dates.js";
import { loadPref } from "@/utils/prefs.js";

// ────────────────────────────────────────────────────────────────────────────
// 1. SETTINGS
// The route (what the sidebar opens) and the page header.
// ────────────────────────────────────────────────────────────────────────────
export const route = "/production/wipcaptureform";

const header = {
  icon: ScanBarcode,
  title: "WIP Capture",
  subtitle: "Capture, inspect and track WIP at each process",
};
const PATH = route;
const TITLE = header;

// ────────────────────────────────────────────────────────────────────────────
// 2. SMALL HELPERS
// Scan sound, first load of the screen, table cell styles.
// ────────────────────────────────────────────────────────────────────────────
/** a short tone: high for OK, a low buzz for an error (off when the operator muted it) */
function beep(ok) {
  if (loadPref("flow-mute", false)) return;
  try {
    const a = new AudioContext();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = ok ? "sine" : "square";
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

/** This page load's own id: the server keeps the station state of each one apart (two tabs, two stations) and never
 *  takes it from a request. A new page load starts afresh, as before. */
const TAB = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** the screen's first state (/forms/spec: Page_Load already run) */
function useSpec(path) {
  const [spec, setSpec] = useState(null);
  const [error, setErrorState] = useState('');
  const setError = (message) => {
    setErrorState(message);
    if (message) toast.error(message, { id: message, duration: 6000 });
  };
  useEffect(() => {
    api(`/forms/spec?path=${encodeURIComponent(path)}&tab=${TAB}`).then(setSpec, (e) =>
      setError(e.message),
    );
  }, [path]);
  return { spec, error };
}

// Shared table cell classes of the unit detail tables.
const th =
  "px-4 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";
const td = "px-4 py-3 align-middle text-sm whitespace-nowrap";

// ────────────────────────────────────────────────────────────────────────────
// 3. STATE + ENGINE
// The form's state, and the hook that sends events to the server and applies its reply.
// ────────────────────────────────────────────────────────────────────────────
/** control id -> value (GridViews: their rows) */
const valuesOf = (state) =>
  Object.fromEntries(
    state.controls
      .filter((c) => c.id)
      .map((c) => [c.id, c.type === "GridView" ? c.rows : c.value]),
  );

/** Applies a server patch { id: { options?, index?, value?, rows?, visible?, text?, enabled?, maxLength?, guide? } }:
 *  options first, then SelectedIndex / SelectedValue. Returns the new controls and values. */
function applyPatch(controls, values, patch = {}) {
  const ctl = controls.map((c) => {
    const p = patch[c.id];
    if (!p) return c;
    const next = { ...c };
    if (p.options) Object.assign(next, { options: p.options, refilled: true });
    for (const k of ["visible", "text", "enabled", "maxLength"])
      if (k in p) next[k] = p[k];
    if (p.guide) next.guide = p.guide;
    return next;
  });
  const vals = { ...values };
  for (const c of ctl) if (c.type === "FileUpload") vals[c.id] = null; // a postback clears a file input, as the browser did
  for (const [k, p] of Object.entries(patch)) {
    if ("index" in p)
      vals[k] = ctl.find((c) => c.id === k)?.options?.[p.index]?.value ?? "";
    if ("value" in p) vals[k] = p.value;
    if (p.rows) vals[k] = p.rows;
  }
  return { controls: ctl, values: vals };
}

/** Panel.Visible / Panel.Enabled = false hide / disable everything inside the panel. */
function panelState(controls) {
  const byId = new Map(controls.filter((c) => c.id).map((c) => [c.id, c]));
  const up = (c, key) => {
    for (let p = c.parent; p; p = byId.get(p)?.parent)
      if (byId.get(p)?.[key] === false) return false;
    return true;
  };
  return {
    shown: (c) => up(c, "visible"),
    live: (c) => (up(c, "enabled") ? c : { ...c, enabled: false }),
  };
}

function useEngine({
  path,
  state,
  events,
  onDone,
  onListFilter,
  onResult,
  initialError,
}) {
  const [controls, setControls] = useState(state.controls);
  const [values, setValues] = useState(() => valuesOf(state));
  const [viewState, setViewState] = useState(state.viewState ?? {});
  const [buttonPatch, setButtonPatch] = useState({});
  const [busy, setBusy] = useState(false);
  // Errors are never drawn on the page: they pop up as toasts.
  const [error, setErrorState] = useState('');
  const setError = (message) => {
    setErrorState(message);
    if (message) toast.error(message, { id: message, duration: 6000 });
  };
  useEffect(() => {
    const first = initialError ?? state.statusMessage;
    if (first) setError(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = (r) => {
    if (r.alert) setError(r.alert);
    else {
      setError("");
      if (r.success)
        toast.success(r.message && r.message !== "✔" ? r.message : "Done");
    }
  };

  async function fire(control, next = values, arg, base = controls, index) {
    setBusy(true);
    try {
      const r = await api("/forms/event", {
        method: "POST",
        // the station state (ViewState, the page as shown) is kept on the server for this page load (TAB)
        body: { path, tab: TAB, control, values: next, arg, index },
      });
      // the server lost this page's station state (it restarted, or a shift went by): start the page afresh
      if (r.restarted) {
        setError(r.alert);
        return void setTimeout(() => window.location.reload(), 2500);
      }
      const p = applyPatch(base, next, r.set);
      setControls(p.controls);
      setValues(p.values);
      setViewState(r.viewState ?? viewState);
      if (r.redirect) return void window.location.assign(r.redirect);
      if (r.list) onListFilter?.(r.list);
      if (r.buttons) setButtonPatch((b) => ({ ...b, ...r.buttons }));
      // FooterControl's Save succeeded: the form starts again
      if (r.reset && onDone)
        return void onDone(
          r.alert
            ? { ok: false, text: r.alert }
            : { ok: true, text: r.message || "Saved" },
        );
      onResult ? onResult(r, control) : report(r);
      return r;
    } catch (e) {
      setError(e.message);
      onResult?.({ alert: e.message }, control);
    } finally {
      setBusy(false);
    }
  }
  function change(id, v) {
    const next = { ...values, [id]: v };
    setValues(next);
    if (events.includes(id)) fire(id, next);
  }
  // ComboBox: the picked row becomes the list's only item, then its handler (if the page wired one) runs
  const pick = (id) => (item) => {
    const ctl = controls.map((c) =>
      c.id === id ? { ...c, options: [item] } : c,
    );
    const next = { ...values, [id]: item.value };
    setControls(ctl);
    setValues(next);
    if (events.includes(id)) fire(id, next, undefined, ctl);
  };

  const { shown, live } = panelState(controls);
  const byId = new Map(controls.filter((c) => c.id).map((c) => [c.id, c]));
  /** the control as the page shows it (disabled when a panel above it is) */
  const ctl = (id) => (byId.has(id) ? live(byId.get(id)) : null);
  /** visible, with every panel above it */
  const vis = (id) => {
    const c = byId.get(id);
    return !!c && c.visible !== false && shown(c);
  };

  return {
    controls,
    setControls,
    values,
    setValues,
    viewState,
    buttonPatch,
    busy,
    setBusy,
    error,
    setError,
    report,
    fire,
    change,
    pick,
    shown,
    live,
    ctl,
    vis,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. THE SCANNED UNIT
// The scanned unit's route and components (/forms/unit).
// ────────────────────────────────────────────────────────────────────────────
/** the scanned unit's route and cabinet (read only); refetched after every event while the serial stays scanned */
function useUnit(label, tick) {
  const [unit, setUnit] = useState(null);
  useEffect(() => {
    if (!label) return void setUnit(null);
    let live = true;
    api(
      `/forms/unit?path=${encodeURIComponent(PATH)}&label=${encodeURIComponent(label)}`,
    ).then(
      (d) => live && setUnit(d),
      () => live && setUnit(null),
    );
    return () => {
      live = false;
    };
  }, [label, tick]);
  return unit;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. CARDS
// The panels of the screen: cabinet, route history, components, inspection, guide.
// ────────────────────────────────────────────────────────────────────────────
function Cabinet({ unit, e, line, className }) {
  const { values, ctl } = e;
  const c = unit?.cabinet;
  const [model, serial] = String(values.tbFG ?? "").split("|");
  const rows = c
    ? [
        ["Model", c.name || model],
        ["Category", c.category],
        ...c.variants.map((v) => [v.name, v.value]),
        ["Customer", c.customer],
        ["Order", c.order],
        ["Line", line],
        ["Work station", values.TBWorkStation],
      ]
    : model
      ? [
          ["Model", model],
          ["Serial", serial],
          ["Line", line],
          ["Work station", values.TBWorkStation],
        ]
      : [];
  const order =
    values.DDLProdOrder &&
    ctl("DDLProdOrder")?.options?.find((o) => o.value === values.DDLProdOrder)
      ?.text;
  if (c && !c.order && order) rows.splice(rows.length - 2, 0, ["Order", order]);
  // Up to the assembly label (the unit still carries its foaming serial): the artwork, large, with only what the
  // operator matches it against (owner, 31 Oct 2026). Graphics and customer are the model's own variant fields.
  if (c?.kind === "Foaming") {
    // the FG material's (the artwork is uploaded there, not on the in-process material)
    const a = c.artwork ?? {};
    const facts = [
      ["Model", a.name || model],
      ["Category", a.category],
      ["Graphics", a.graphics],
      ["Customer", a.customer],
    ];
    return (
      <SectionCard icon={Refrigerator} title="Cabinet" className={className}>
        <div className="flex flex-col gap-5 sm:flex-row">
          {a.image ? (
            <img
              src={a.image}
              alt={`Artwork of ${a.name}`}
              className="max-h-72 w-full rounded-lg border bg-muted/30 object-contain p-2 sm:w-1/2"
            />
          ) : (
            <div className="grid h-48 w-full place-items-center rounded-lg border border-dashed text-sm text-muted-foreground sm:w-1/2">
              No artwork for this model
            </div>
          )}
          <dl className="grid min-w-0 flex-1 content-start gap-y-4">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 text-base font-semibold break-words">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      </SectionCard>
    );
  }
  return (
    <SectionCard icon={Refrigerator} title="Cabinet" className={className}>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Scan a serial to see the cabinet.
        </p>
      ) : (
        <div className="flex gap-5">
          {c?.image && (
            <img
              src={c.image}
              alt={c.name}
              className="size-28 shrink-0 rounded-lg border bg-muted/30 object-contain p-2"
            />
          )}
          <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {rows
              .filter(([, v]) => v)
              .map(([k, v], i) => (
                <div key={`${k}-${i}`} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 truncate text-sm font-medium" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </SectionCard>
  );
}

/** the whole route (done / in process / pending); before /forms/unit answers, the stages started so far */
/** a stage's time as "date time" text: { date, time } (the date alone when there is no time) */
function splitWhen(v) {
  const t = when(v);
  if (!t || t === "-") return null;
  const k = t.indexOf(" ");
  return k < 0 ? { date: t, time: "" } : { date: t.slice(0, k), time: t.slice(k + 1) };
}

/** a stage's Start Time / End Time, side by side: each its date, then its time ("—" when there is none yet) */
function StageTimes({ startedOn, completedOn }) {
  const cell = (label, v) => {
    const t = splitWhen(v);
    return (
      <div className="min-w-0 px-3 py-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm tabular">{t?.date ?? "—"}</p>
        <p className="text-sm tabular">{t?.time || "—"}</p>
      </div>
    );
  };
  return (
    <div className="mt-2 grid grid-cols-2 divide-x divide-border rounded-lg bg-muted/50">
      {cell("Start Time", startedOn)}
      {cell("End Time", completedOn)}
    </div>
  );
}

/** the unit's route as a timeline: each stage's work station, its start → completion, and its status */
function ProcessHistory({ route, e, className }) {
  const { values, vis } = e;
  const steps =
    route ??
    (vis("PnlHistory")
      ? (values.GVHistory ?? []).map((r) => ({
          process: r.Process,
          station: r.Station,
          startedOn: r.StartedOn,
          completedOn: r.CompletedOn,
          status: r.CompletedOn ? 2 : 1,
        }))
      : []);
  const done = steps.filter((s) => s.status === 2).length;
  // the dot of a stage: done (a tick), in process (ringed), pending (empty)
  const dot = (status) =>
    status === 2 ? (
      <span className="grid size-7 place-items-center rounded-full bg-emerald-600 text-white ring-4 ring-card">
        <CheckCircle2 className="size-5" aria-hidden="true" />
      </span>
    ) : status === 1 ? (
      <span className="grid size-7 place-items-center rounded-full bg-primary/15 ring-4 ring-card">
        <span className="size-3.5 animate-pulse rounded-full bg-primary" />
      </span>
    ) : (
      <span className="grid size-7 place-items-center rounded-full border-2 border-border bg-card ring-4 ring-card" />
    );
  return (
    <SectionCard
      icon={History}
      title="Process history"
      className={className}
      actions={
        steps.length > 0 && (
          <span className="text-xs text-muted-foreground tabular">
            {done} of {steps.length} completed
          </span>
        )
      }
    >
      {steps.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          The unit's route shows here after a serial scan.
        </p>
      ) : (
        <ol className="max-h-[36rem] overflow-auto">
          {steps.map((s, i) => (
            <li
              key={i}
              className={`relative flex gap-3 border-b border-border px-3 py-4 last:border-b-0 ${s.status === 1 ? "rounded-xl border-transparent bg-primary/5" : ""}`}
            >
              {/* the line down to the next stage (green while the stages are done) */}
              {i < steps.length - 1 && (
                <span className={`absolute top-11 left-[1.625rem] h-full w-0.5 -translate-x-1/2 ${s.status === 2 ? "bg-emerald-600/70" : "bg-border"}`} aria-hidden="true" />
              )}
              <span className="relative z-10 mt-0.5 shrink-0">{dot(s.status)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-base font-bold leading-tight break-words">
                    <span className="mr-1.5 font-semibold text-muted-foreground tabular">{i + 1}.</span>
                    {s.process}
                  </p>
                  <span className="shrink-0">
                    <StatusPill status={s.status} />
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{s.station || "—"}</p>
                <StageTimes startedOn={s.startedOn} completedOn={s.completedOn} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

/** the components scanned into the unit so far (GVComponents) */
function ComponentDetails({ e, className }) {
  const rows = e.vis("PnlComponents") ? (e.values.GVComponents ?? []) : [];
  return (
    <SectionCard
      icon={Boxes}
      title="Components"
      flush
      className={className}
      actions={
        rows.length > 0 && (
          <span className="text-xs text-muted-foreground tabular">
            {rows.length} scanned
          </span>
        )
      }
    >
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          No components scanned into this unit yet.
        </p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-160">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className={th}>#</th>
                <th className={th}>Category</th>
                <th className={th}>Material</th>
                <th className={th}>Station</th>
                <th className={th}>Serial</th>
                <th className={th}>Operator</th>
                <th className={th}>Scanned on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className={`${td} tabular text-muted-foreground`}>
                    {i + 1}
                  </td>
                  <td className={td}>{r.Category}</td>
                  <td className={`${td} font-medium`}>{r.Material}</td>
                  <td className={td}>{r.Station}</td>
                  <td className={`${td} tabular`}>{r.Serial}</td>
                  <td className={td}>{r.Operator}</td>
                  <td className={`${td} tabular`}>{when(r.ScannedOn)}</td>
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
function ComponentScan({ e }) {
  const { values, busy, fire, vis } = e;
  const ref = useRef(null);
  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy]);
  return (
    <SectionCard
      icon={Boxes}
      title="Scan components"
      tone="green"
      actions={
        <Button
          variant="ghost"
          size="sm"
          icon={X}
          onClick={() => fire("BTNCloseInputMaterialPanel")}
        >
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        {vis("ScanINbarcodePanel") && (
          <ScanBox
            ref={ref}
            label="Component barcode"
            placeholder="Scan a component barcode"
            value={values.TBINItemCode}
            onChange={(v) => e.change("TBINItemCode", v)}
            onScan={() => fire("BtnINBarcode")}
            busy={busy}
          />
        )}
        {vis("InQtyPanel") && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <Ctl
              e={e}
              id="TBInQty"
              label="Quantity to consume"
              className="w-40"
            />
            <Ctl e={e} id="ddlINUom" label="Unit" className="w-32" />
            <Button
              icon={Plus}
              loading={busy}
              onClick={() => fire("BtnInwardMaterial")}
            >
              Consume
            </Button>
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
  const statusTint =
    status === "13"
      ? "[&_select]:border-rose-300 [&_select]:bg-rose-500/10"
      : status === "12"
        ? "[&_select]:border-emerald-300 [&_select]:bg-emerald-500/10"
        : "";
  return (
    <SectionCard
      icon={ClipboardList}
      title={fg ? "FG Label & Inspection" : "Inspection & Defect Recording"}
      tone="violet"
      actions={
        vis("btnQCClose") && (
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            onClick={() => fire("btnQCClose")}
          >
            Close
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {vis("BarcodePanel") && (
          <ScanBox
            size="md"
            label="Barcode"
            value={values.TBBarcode}
            onChange={(v) => e.change("TBBarcode", v)}
            onScan={() => fire("Go")}
            locked={ctl("Go")?.text === "Clr"}
            onClear={() => fire("Go")}
            busy={busy}
          />
        )}
        {vis("OtherFields") && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {/* inspection information and the verdict */}
            <div className="space-y-4 min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Info className="w-4 h-4 text-primary" /> Inspection Information
              </h3>
              {lot && (
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-[minmax(0,2fr)_repeat(4,auto)]">
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <span className="text-sm leading-none font-medium">
                      Description
                    </span>
                    <p
                      className="truncate rounded-lg bg-muted px-3 py-2 font-medium text-foreground"
                      title={lot.Description}
                    >
                      {lot.Description}
                    </p>
                  </div>
                  {[
                    ["Approved Qty", lot.ApprovedQty],
                    ["Reject Qty", lot.RejectedQty],
                    ["Unit", lot.UomDesc],
                    ["Inspection Lot No", lot.InspectionLotNo],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span className="text-sm leading-none font-medium">
                        {k}
                      </span>
                      <p className="py-2 tabular text-foreground">
                        {v === "" || v == null ? "-" : v}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Ctl
                  e={e}
                  id="DDLWIPQCStatus"
                  label="Status"
                  className={statusTint}
                />
                <Ctl e={e} id="DDLNextAction" label="Next Action" />
                <Ctl e={e} id="DDLDefectCate" label="Defect Category" />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Ctl e={e} id="TBQty" label="Quantity" className="w-32" />
                <Ctl e={e} id="TbBEENo" label="BEE number" className="w-48" />
                {vis("QCPrinterPanel") && (
                  <Ctl
                    e={e}
                    id="DDLQCPrinter"
                    label="Label printer"
                    className="w-56"
                  />
                )}
                {vis("BtnUD") && (
                  <Button
                    variant="outline"
                    icon={ListChecks}
                    loading={busy}
                    onClick={() => fire("BtnUD")}
                  >
                    Checklist
                  </Button>
                )}
              </div>
              {vis("FGLabelPanel") && (
                <div className="grid gap-3 sm:grid-cols-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <Ctl e={e} id="TbFGSerialNo" label="FG serial number" />
                  <Ctl e={e} id="TbASsetTag" label="Asset tag" />
                  <Ctl e={e} id="TBGreenTag" label="Green tag" />
                </div>
              )}
            </div>

            {/* defects */}
            <div className="min-w-0 space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4" /> Add Defect Codes
              </h3>
              {vis("PanelDefects") ? (
                <>
                  <div className="flex items-end gap-2">
                    <Ctl
                      e={e}
                      id="DDLDefectCodes"
                      label="Defect Code"
                      className="min-w-0 flex-1"
                    />
                    {vis("btnAdd") && (
                      <Button
                        icon={Plus}
                        loading={busy}
                        onClick={() => fire("btnAdd")}
                      >
                        Add
                      </Button>
                    )}
                  </div>
                  <Grid
                    c={ctl("GVTransData")}
                    rows={values.GVTransData}
                    onDelete={(k, i) =>
                      fire("GVTransData:delete", values, k, e.controls, i)
                    }
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Set the status to Rejected to record defects.
                </p>
              )}
            </div>

            {/* remark and save */}
            <div className="flex min-w-0 flex-col gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MessageSquare className="w-4 h-4 text-primary" /> Remark
              </h3>
              {vis("TBWQCRemark") ? (
                <Ctl e={e} id="TBWQCRemark" label="" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  A remark can be added with defects.
                </p>
              )}
              <div className="mt-auto flex flex-wrap justify-end gap-2">
                {vis("btnQCClear") && (
                  <Button variant="ghost" onClick={() => fire("btnQCClear")}>
                    Clear
                  </Button>
                )}
                {vis("btnQCSave") && (
                  <Button
                    size="lg"
                    icon={Save}
                    loading={busy}
                    className="min-w-44"
                    onClick={() => fire("btnQCSave")}
                  >
                    {fg ? "Save and Print Label" : "Save Record"}
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
  const files = ctl("LBGuideFiles");
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" /> Station guide
        </span>
      }
      actions={
        <Button
          variant="ghost"
          size="sm"
          icon={X}
          onClick={() => fire("IMBGuideClose")}
        >
          Hide
        </Button>
      }
    >
      <div className="space-y-3">
        {files?.options?.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {!vis("RightTop") && ctl("GuideFileDisplayPanel")?.guide && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fire("BtnToggleGuide")}
              >
                Show document
              </Button>
            )}
            {files.options
              .filter((o) => o.value !== "")
              .map((o) => (
                <Button
                  key={o.value}
                  variant={
                    values.LBGuideFiles === o.value ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => e.change("LBGuideFiles", o.value)}
                >
                  {o.text}
                </Button>
              ))}
          </div>
        )}
        {vis("RightBottom") && values.GVInstruction?.length > 0 && (
          <Grid c={ctl("GVInstruction")} rows={values.GVInstruction} />
        )}
        {vis("GuideFileDisplayPanel") &&
          ctl("GuideFileDisplayPanel")?.guide && (
            <GuideView g={ctl("GuideFileDisplayPanel").guide} />
          )}
      </div>
    </Panel>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 6. STATION
// The screen itself: scan the work station, scan a serial, then the cards react.
// ────────────────────────────────────────────────────────────────────────────
/** One popup per scan result (a new result replaces the previous popup, so they never pile up). */
function notify(kind, title, text) {
  const body = (
    <div>
      <p className="font-semibold">{title}</p>
      {text && <p className="text-sm opacity-80">{text}</p>}
    </div>
  );
  (kind === "error" ? toast.error : toast.success)(body, {
    id: "wip-scan",
    duration: kind === "error" ? 7000 : 2500,
  });
}

function Station({ spec }) {
  const navigate = useNavigate();
  const stationRef = useRef(null);
  const serialRef = useRef(null);
  const [unitTick, setUnitTick] = useState(0);
  const e = useEngine({
    path: PATH,
    state: spec,
    events: spec.events ?? [],
    onResult: (r, control) => {
      setUnitTick((t) => t + 1); // a scan, a QC save or a consume can move the unit along its route
      if (r.alert) {
        beep(false);
        // a refused scan explained (already completed here / not reached yet / not on its route, and where it is now)
        if (r.explain) notify("error", r.explain.title, r.explain.text);
        else notify("error", "Not accepted", r.alert);
      } else if (control === "BtnWorkStationScan")
        notify("success", "Station ready", "Scan a serial");
      else if (r.success) {
        beep(true);
        // scanStageLabelNew's result: 11 the stage started (nothing to scan), 21 the stage completed
        const scanned =
          { 11: "Stage started", 21: "Stage completed" }[r.viewState?.I] ??
          "Scan recorded";
        notify(
          "success",
          control === "btnQCSave"
            ? "Quality result saved"
            : control === "BtnInwardMaterial"
              ? "Component consumed"
              : scanned,
          r.viewState?.LastScanned
            ? `Serial ${r.viewState.LastScanned}`
            : undefined,
        );
      }
    },
  });
  const { values, viewState: vs, busy, fire, vis, ctl } = e;
  const text = (id) => ctl(id)?.text ?? "";
  const stationLocked = text("BtnWorkStationScan") === "Clr";
  const serialLocked = text("BtnWorderScan") === "Clr" || vis("QCPanel");
  const result = Number(vs.I ?? 0);
  const unit = useUnit(
    serialLocked ? String(values.TBJobCoard ?? "").trim() : "",
    unitTick,
  );

  // the scanner always types into the box the operator needs next
  useEffect(() => {
    if (busy) return;
    (stationLocked ? serialRef : stationRef).current?.focus();
  }, [busy, stationLocked, serialLocked]);

  const scan = (button) => fire(button, values);
  const line = text("lblLine");

  return (
    <Page
      {...TITLE}
      width="full"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {vis("DDLDepartment") && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="f-DDLDepartment"
                className="text-sm text-muted-foreground"
              >
                Department
              </label>
              <Ctl e={e} id="DDLDepartment" label="" className="w-52" />
            </div>
          )}
          <Button
            variant="outline"
            icon={BookOpen}
            aria-label="Station instructions"
            title="Station instructions"
            disabled={!stationLocked || busy}
            onClick={() => fire("BtnGuide")}
          />
          <MuteButton />
          <Button
            variant="outline"
            icon={X}
            aria-label="Close WIP Capture"
            title="Close"
            onClick={() => navigate("/start")}
          />
        </div>
      }
    >
      {/* scan bar: station, serial, printer, then the result of the last scan */}
      <SectionCard
        icon={ScanLine}
        title="Scan"
        actions={
          line && (
            <Badge variant="success" dot>
              Line: {line}
            </Badge>
          )
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-[1fr_1fr_18rem]">
            {vis("WorkStationPanel") && (
              <div className="grid min-w-0 gap-2">
                <span className="text-sm leading-none font-medium">
                  Work station
                </span>
                <ScanBox
                  ref={stationRef}
                  size="md"
                  label="Work station"
                  placeholder="Scan the station"
                  value={values.TBWorkStation}
                  onChange={(v) => e.change("TBWorkStation", v)}
                  locked={stationLocked}
                  onScan={() => scan("BtnWorkStationScan")}
                  onClear={() => scan("BtnWorkStationScan")}
                  busy={busy && !stationLocked}
                />
              </div>
            )}
            {vis("JobCardPanel") && (
              <div className="grid min-w-0 gap-2">
                <span className="text-sm leading-none font-medium">
                  Serial number
                </span>
                <ScanBox
                  ref={serialRef}
                  size="md"
                  label="Unit serial"
                  placeholder={
                    stationLocked ? "Scan the serial" : "Scan the station first"
                  }
                  value={values.TBJobCoard}
                  onChange={(v) => e.change("TBJobCoard", v)}
                  locked={serialLocked && text("BtnWorderScan") === "Clr"}
                  onScan={() => scan("BtnWorderScan")}
                  onClear={() => scan("BtnWorderScan")}
                  busy={busy && stationLocked}
                />
              </div>
            )}
            <Ctl
              e={e}
              id="DDLStationPrinter"
              label="Station printer"
              className="md:col-span-2 2xl:col-span-1"
            />
          </div>
          {vis("BtnRework") && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                icon={RefreshCcw}
                onClick={() => scan("BtnRework")}
              >
                Move to rework
              </Button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* the scanned unit: cabinet and components on the left, its route as a timeline on the right */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <Cabinet unit={unit} e={e} line={line} />
          <ComponentDetails e={e} />
        </div>
        <ProcessHistory route={unit?.route} e={e} className="xl:sticky xl:top-2" />
      </div>

      {vis("InputMaterialPanel") && <ComponentScan e={e} />}
      {vis("QCPanel") && <Inspection e={e} fg={result === 40} />}
      {vis("InspectionCheckList") && (
        <QCPanel
          s={values.InspectionCheckList}
          busy={busy}
          onChange={(next) =>
            e.setValues({ ...values, InspectionCheckList: next })
          }
          onEvent={(name, next = values.InspectionCheckList, arg, i) =>
            fire(
              name.replace(/^QC:/, "InspectionCheckList:"),
              { ...values, InspectionCheckList: next },
              arg,
              e.controls,
              i,
            )
          }
        />
      )}
      {vis("DefectHistoryPanel") && (
        <Grid
          c={ctl("GVDefectHistory")}
          rows={values.GVDefectHistory}
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" /> Defect
              history
            </span>
          }
        />
      )}
      {vis("RightTopPanel") && <Guide e={e} />}
    </Page>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 7. PAGE
// Loads the first state from the server and hands it to <Station>.
// ────────────────────────────────────────────────────────────────────────────
export default function WipCapture() {
  const { spec, error } = useSpec(route);
  if (spec) return <Station spec={spec} />;
  return (
    <Page {...header}>
      {(error ? <Button variant="outline" icon={RotateCw} onClick={() => window.location.reload()}>Try again</Button> : <Loader />)}
    </Page>
  );
}
