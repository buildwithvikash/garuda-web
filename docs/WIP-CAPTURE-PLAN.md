# WIP Capture: plan to make it a plain React screen

Status: proposal, waiting for the owner's approval. Nothing is changed yet.

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

## Questions for the owner

1. Does an operator ever use **two tabs** (or two stations) on one PC at once? (The session is per tab.)
2. Are **QC (30)** and **FG label (40)** used at this plant, or only start / complete? (Decides what to test first.)
3. Is anything from the "not ported" list needed now (multi-quantity output, stage type 7, other indicators)?
4. 12 hours for a station session (one shift) right?
