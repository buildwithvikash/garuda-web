# WIP Capture: plan to make it a plain React screen

Status: approved (owner, 31 Oct 2026). Step 1 built, waiting for its test on TEST; steps 2 and 3 to do.

## What the screen does

The operator's flow at a station (`/production/wipcaptureform`, original `WIPCaptureForm.aspx`):

1. **Department and printer**: the session's department (fixed when the user has one), the station printer.
2. **Scan the station** (`BtnWorkStationScan`): the work centre, its process and production stage.
3. **Scan the unit** (`BtnWorderScan`): the job card / serial. The server records the stage and answers a result:
   - start / complete at this stage: history, route and cabinet of the unit are shown;
   - **30, QC**: the inspection panel (barcode `Go`, status, defects, checklist, `btnQCSave`);
   - **40, FG label**: next FG serial, asset tag, green tag, certificate printer, then save and print;
   - the **input materials** panel (`BtnRM`, component scans `BtnINBarcode`, `BtnInwardMaterial`);
   - **rework**: to Rework Confirmation.
4. **Guide**: the stage's instructions and drawings.

Server: `modules/forms/screens/production/wip-capture-form.js` (667 lines, 31 events) on `modules/production/wip.service.js`
(1,078 lines). Client: `client/src/pages/production/WipCapture.jsx` (1,076 lines, one file).

Not ported from the original (FUNCTIONAL-INVENTORY.md), and **out of scope here**: scan result 20 (multi-quantity
output), production stage type 7, department indicators other than 10000, output printing for serial logic > 1.

## What is wrong today

1. **The browser keeps the scan state, and the server trusts it.** Between requests the page sends back `viewState`
   (scanned station `Tag:TBWorkStation`, `ProcessCode`, `ControlID`, scan result `I`, `LastScanned`, QC lot ...) and
   `ui` (a button's text `Clr` means "station / serial locked", panel visibility). A modified request can record a
   unit at a station that was never scanned, or skip the station scan. Same as Production Order before its switch.
2. **Control IDs everywhere**: the page and the API speak `TBJobCoard`, `BtnWorderScan`, `GVHistory`, `DDLWIPQCStatus`;
   state is read from button captions (`text === 'Clr'`).
3. **One 1,076-line file** with its own copy of the engine (applyPatch, panelState, fire).
4. Postbacks can race (a fast scanner sends the next scan before the previous answer), as in the other screens.

## The plan: three steps, each tested and merged on its own

### Step 1: the server keeps the scan state (no visible change)

Built (`server/src/modules/forms/screenSessions.js`, `server/tests/screen-sessions.test.js`): each page load has a
random id; `/forms/spec` starts its state, `/forms/event` uses only the kept ViewState and page state (the request's are
not read) and keeps the answer. A refresh starts afresh, as before (the id is per page load, so a duplicated tab is a
station of its own). After a restart the page says so and reloads. `/api/production/wip-capture/events` answers 409
until step 2. The handlers are unchanged.

- A **station session** on the server: department, printer, scanned station, its process and stage, the scanned unit,
  the scan result, the QC lot / checklist rows. Created when the screen opens; the browser holds only its id.
- Kept in the server's memory (it runs as one process), per user, for up to a shift (12 h). After a server restart
  the operator scans the station again (the screen says so).
- The ported handlers stay as they are (parity proved them): they get their `viewState` and `ui` from the session,
  never from the request. "Locked" becomes a flag in the session, not a button caption.
- Check: `wip-parity.js comp | qc | fg --api` identical, events parity unchanged, plus a new test that a forged
  station / process in a request is ignored.

### Step 2: a plain React screen on a WIP API with plain names

New calls on `/api/production/wip-capture` (old ones stay until the switch):

| Call | Does |
|---|---|
| `POST /sessions` `{ department }` | opens a station session: departments, printers, what the department scans |
| `POST /sessions/:id/station` `{ code }` · `DELETE /sessions/:id/station` | scan / clear the station |
| `POST /sessions/:id/unit` `{ serial }` · `DELETE /sessions/:id/unit` | scan / clear the unit: `{ result: 'recorded' \| 'qc' \| 'fg' \| 'inputs', unit, history, route, ... }` |
| `POST /sessions/:id/inputs/:barcode` · `POST /sessions/:id/inputs/done` | component scans |
| `POST /sessions/:id/qc/...` | QC: barcode, status, defects, checklist, save |
| `POST /sessions/:id/fg` | FG label: tags, save and print (one per click: Idempotency-Key) |
| `GET /sessions/:id/guide` | instructions and drawings |

Client, `pages/production/WipCapture/` as for the other two screens:
`wipApi.js`, `useStation.js` (the session; scans queued so a fast scanner never races), and views
`Station.jsx` (department, printer, station), `UnitScan.jsx` (serial, history, route, cabinet), `Inputs.jsx`,
`Inspection.jsx` (QC), `FgLabel.jsx`, `Guide.jsx`. Plain labels and messages, texts where they show.
Kept: the scan sound, mute, the big scan boxes for the shop floor.

### Step 3: remove the old path

`/api/forms` stops serving the screen (as for the other two); the old events go once nothing uses them.

## How it is tested

- Each step: `npm test`, `wip-parity.js "$B" comp`, `qc`, `fg` with `--api` identical, the build.
- In the browser at a real station with the scanner: station, unit, components, QC pass / fail, FG label print,
  guide; two stations on two PCs at the same time; a server restart in the middle of a shift.

## What the queries found (LIVE, 31 Oct 2026)

- **QC is used**: 19 processes of stage type 2 / 8 in active routings (leak tests, HLD high / low, post-foaming QA,
  QC-Foaming in 10 routings, gas charging, electrical safety, multi-function test, CPT, FG final inspection).
- **FG label is used**: FG LABEL PRINTING (7 routings), SUS FG LABEL PRINTING (3).
- **Not needed**: no stage type 7, every production department has indicator 10000, no multi-quantity output in the
  last 90 days. (Output printing for serial logic > 1 was not checked: it stays in LATER.md.)

So QC and FG label are tested as thoroughly as start / complete.

## Answers (owner, 31 Oct 2026)

1. **Two tabs / two stations on one PC: yes.** Each page load has its own station state: two tabs are two independent
   stations (a duplicated tab too). A refresh starts afresh, as the original did.
2. **QC (30) and FG label (40): not sure.** The scan result comes from the process' stage type
   (`ProductionProcess.ProdcutionStage`: 2 / 8 QC, 6 FG label, 7 not ported). To find out (read only):
   ```sql
   SELECT pp.ProdcutionStage AS StageType, pp.ProcessCode, pp.Name, COUNT(DISTINCT rt.RouteCode) AS ActiveRoutings
   FROM ProductionProcess pp
   JOIN RoutingTrans rt ON rt.ProcessCode = pp.ProcessCode
   JOIN RoutingHeader rh ON rh.RouteCode = rt.RouteCode AND rh.Status = 1
   WHERE pp.ProdcutionStage IN (2, 6, 7, 8)
   GROUP BY pp.ProdcutionStage, pp.ProcessCode, pp.Name ORDER BY pp.ProdcutionStage;
   ```
3. **The "not ported" features: to check.** Needed only if one of these returns rows (read only):
   ```sql
   SELECT ControlIndicator, COUNT(*) AS Departments FROM Department WHERE DeptType IN (6000, 7000) GROUP BY ControlIndicator; -- other than 10000?
   SELECT TOP 20 po.PRODNo, ob.ProcessCode, ob.Qty FROM ProcessOutputBOM ob JOIN ProcessOrder po ON po.PSNo = ob.PSNo
   WHERE ob.Qty > 1 AND po.AssignDate >= DATEADD(day, -90, GETDATE()) ORDER BY po.AssignDate DESC; -- multi-quantity output
   ```
   (Stage type 7: a row with StageType 7 in the query under 2.) If any is needed it is a separate step after this plan.
4. **A station session lasts 12 h (one shift): yes.**
