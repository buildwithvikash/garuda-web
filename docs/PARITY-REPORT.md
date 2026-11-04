# Parity report: batch 1 (setup screens through /api/masters)

Run 26 Oct 2026 on `Garuda_WRL_TEST` against the original DLLs (`build/Publish WRL/bin`). Each suite ran twice: the
new side through the screen engine (the baseline) and through `/api/masters` (`--api`). The batch passes when both runs
give the same result.

| Suite | Screens | Engine | API (`--api`) |
|---|---|---|---|
| forms-write: declarative masters (save / update / cancel, rows + EventLog) | 12 | 11 identical, 1 fails alike | 11 identical, 1 fails alike |
| forms-write: masters with child lists (tree, check lists) | User Role, Business Unit, Department, Work Center | 3 identical, 1 fails alike | 3 identical, 1 fails alike |
| forms-write: masters with page events / grids | Users, Material Category, Material, Model, Value List, Shift, Employee, Check List, BOM, Routing | 9 identical, 1 fails alike | 9 identical, 1 fails alike |
| events (option changes, buttons, grid select / delete) | 12 screens, 80 cases | 74 identical, 5 fail alike, 1 harness limit | 74 identical, 5 fail alike, 1 harness limit |
| page-writes (change / reset password, serial logic update, company update) | 4 screens, 13 cases | 13 identical | 13 identical |
| print (Employee, Material Barcode labels: bytes sent, alerts, print trail) | 2 screens, 7 cases | 6 identical, 1 fails alike | 6 identical, 1 fails alike |

"Fails alike": the original fails on this database and the new code fails with the same error:
Scrap Reasons and User Role cancel (`Invalid column name 'Status'`: their tables have no Status column), Material
Master update (`Cannot update identity column 'REFID'`), Material Barcode reprint of a barcode the original cannot read
(`There is no row at position 0.`). "Harness limit": Check List's grid select in the original
host (`Multiple controls with the same ID 'ctl00'`), known since the events suite was written.

Found and fixed while building the batch (both outside the masters API):
- Change / Reset Password through `/api/forms`: after the password changed, the route called `req.session.destroy()`,
  which the cookie session does not have, so the operator saw an error although the change was saved. It now clears
  the session cookie and the page goes to sign-in, as the original did.
- WIP Capture's unit view logged a failed lookup through `log` without importing it (the error path itself threw).

Found and fixed in the API during parity: a handler that picks a list item by position, without sending the list,
came back empty through the API (BOM, Routing: 6 event cases). The API now looks the position up in the list the
client holds, or the one the screen builds.

Not covered by a write suite (as before this batch): Routing Guide's guide-file upload, and Material Barcode save
(both checked by events / print only); Company is checked by page-writes only (single row, no add / delete).

Unit tests: 36 pass (`npm test`, 2 new for the masters' body check). HTTP smoke (in-process, signed session): 401
without a session, 200 for list / new / record / search fields, 404 for a missing record, key, event or master name,
422 naming an unknown field. After the runs, `GET /new` and `GET /:key` were changed to return values exactly as
stored (no trimming) and to include page-written labels under `ui`; neither path is used by the write or event
suites, and the smoke test was rerun after the change.

# Parity report: batch 2 (quality screens through /api/quality)

Run 26 Oct 2026, same database and original DLLs; each suite through the screen engine and through `/api/quality`
(`--api`, via `scripts/parity/api.js`).

| Suite | Screens | Engine | API (`--api`) |
|---|---|---|---|
| events (scan, QC panel next / prev / value / pass / fail / save, defects, approver status, footer) | Final Inspection, NCMR, Repair, Rework New, Finishing, Self Inspection: 44 cases | 44 identical | 44 identical |
| rework-new (Go, then save: inspection rows, stock, rework history) | Rework Confirmation New | 2 cases identical (saved) | 2 cases identical (saved) |
| page-writes (Final Inspection save, NCMR approve / reject) | 2 screens, 4 cases | 4 identical | 4 identical |

Changes made for this batch, shared with batch 1 (batch 1's API suites were rerun after them, below):
- `forms/resource.routes.js` holds the per-screen REST calls; `/api/masters` and `/api/quality` mount it.
- Fields holding the screen's own structure (QC panel, approval footer, picked file, image) pass the body check as
  they are. Before this, a picked file on Routing Guide (batch 1) would have been refused by the API's check.
- `/api/masters` and `/api/quality` take bodies up to 100 MB, as `/api/forms` does (images, files, whole grids);
  the rest of `/api` stays at 1 MB.
- A refused save (400) keeps the alert the page showed beside its message (`{ message, alert }`): Rework
  Confirmation refuses with both.

Found and fixed in the API during parity: Save (`POST /`) removed the record's key before the page's own save ran.
Rework Confirmation's save works on the inspection `go` loaded, by that key, so through the API it saved nothing
(2 rework cases). Save now passes the record as the screen posts it, key included, as `/api/forms` does.

Batch 1 rerun through the API after these changes: forms-write 11/12 + 12/14 identical (the rest fail alike, as
before), events 74 identical / 5 fail alike / 1 harness limit, page-writes 17/17 (all cases, masters and quality),
print 8 identical / 1 fails alike. The same as before the changes.

Self Inspection is skipped by the events suite on both sides (its form fails to open on this database).

Behaviour kept as the original has it (same through `/api/forms`): Final Inspection's list query fails (the screen has
no View button, so the original never runs it); Self Inspection fails to open on this database
(`Invalid column name 'Category'`, a CEAT column WRL lacks).

# Parity report: batch 3 (shop-floor screens through /api/production/<name>)

Run 26 Oct 2026, same database and original DLLs; each suite through the screen engine and through the API
(`--api`, via `scripts/parity/api.js`).

| Suite | Screens | Engine | API (`--api`) |
|---|---|---|---|
| events | FG Scrap, RM Replacement, Model Transfer, Process Guide, Image Display, WIP Capture, Plan Upload: 49 cases | 49 identical | 49 identical |
| wip comp (department, station, stage label, every component, stage complete; rows + labels) | WIP Capture | identical | identical |
| wip qc (QC stage approved) | WIP Capture | identical | identical |
| wip fg (FG stage approved, FG labels) | WIP Capture | identical | identical |
| production-writes (FG scrap save, RM replacement) | FG Scrap, RM Replacement | 2 identical | 2 identical |
| upload (sheet reader, Plan Upload's BtnUpdate) | Plan Upload | 4 identical | 4 identical |
| print (Model Transfer label, with batch 1's prints and the assignment) | Model Transfer | 8 identical, 1 fails alike | 8 identical, 1 fails alike |

Kept as the original has it: FG scrap's save answers "Incorrect syntax near )" on this database on both sides (the
original's SQL); Plan Upload's update of a sheet with a non-numeric column answers "Invalid column name ten" on both.

No API fix was needed in this batch. WIP Capture's unit view moved with it: `GET /api/production/wip-capture/units/:label`
(the same lookups as `/api/forms/unit`).

With this batch every one of the 47 screens has a REST API of its own (orders and assignments by hand, the other 45
through `forms/resource.js`), each passing the same parity as the screen engine. The client pages still use
`/api/forms`; switching a page to its API is a client change, left for approval (see MIGRATION-PLAN.md, Cutover).

# Client switch: form check and reruns (26 Oct 2026)

Form check (`scripts/parity/client-switch-parity.js`, read only): for the 45 screens with a resource API, the form a
page draws through the API (layout, and records / copies laid over it by `client/src/lib/screenApiCore.js`) against
the form `/api/forms` gives, every property of every control, plus the list page; 3 records per screen.
Result: 44 identical, 1 fails alike (Self Inspection: its form fails on this database on both). A negative check
(one control's visibility flipped in an answer) is caught. Found and fixed by it: a file-upload control (Routing,
Routing Guide) holds `null` in the engine; the API had sent `''`.

`--api` reruns after the switch changes (the parity helper now uses the client's own translation, so every case runs
through what the page sends and applies): events on every screen 188/202 identical, 5 fail alike, 1 harness limit,
8 Production Order label cases (the approved "material name only" change; that screen has its own API and is not
part of this translation); forms-write 11/12 (1 fails alike); page-writes 17/17; rework-new 2/2; production-writes
2/2; wip comp / qc / fg identical; upload 4/4; print 8 identical, 1 fails alike. The same as before.

Switched page: Unit Of Measure (`client/src/lib/screenApi.js`, `API_SCREENS`). Its browser check is the owner's.

# Intended difference: RM Replacement replaces raw material only (owner, 28 Oct 2026)

The original's "Scan existing component" accepted any component in the unit's list (in-process materials too). Now
a component that is not Raw Material is refused with "Only raw material can be replaced"
(`screens/production/rm-replacement-form.js`, btnexistScan), and the page lets only Raw Material rows be picked
from the list. The parity cases use a raw-material component (events 10/10 and the production-writes replacement
identical through the API); an in-process component is now expected to differ from the original.

# Intended difference: RM Replacement refuses a new serial its material's serial logic rejects (owner, 28 Oct 2026)

The original's "Scan new component" ignored the result of ReplaceRMScanValidate: when the new serial failed the
material's serial logic (e.g. its length), nothing was replaced but the page still showed success and cleared both
boxes. Now it alerts "The new serial does not match the serial format of this material" and leaves both boxes as
they are (`screens/production/rm-replacement-form.js`, btnNewScan). Events: 9/10 identical through the API, the one
difference being this case ([Go, btnexistScan, btnNewScan] with BADFORMAT); the production-writes replacement is
identical.

# Intended difference: a material's routing, picked by Production Assignment (owner, 28 Oct 2026)

As already done on LIVE: the Material screen has a Routing dropdown (control `DDLRoute`, API field `route`, saved to
`Material.Route`; the list is Production Assignment's, `RoutingHeader` with Type 1 and Status 1). The original page
had no such control; it is added to the extracted spec in `server/src/modules/forms/specs.js` (`ADDED`). On
Production Assignment, choosing an order now selects its material's routing (and so its first stage and stations)
when that routing is in the list (`screens/production/production-assignment-form.js`, DDlProdOrder), so the user no
longer picks one before printing; a material without a routing keeps the original rule (selected only when there is
a single routing). Checked on TEST: three open orders whose material has a routing got it; two without kept none.
The forms / events parity of these two screens against the original is expected to differ by exactly this.

# Intended difference: Material Barcode is a reprint page for FG, assembly and foaming labels (owner, 29 Oct 2026)

The original Material Barcode page listed, created, saved and printed any material barcode. The page is now reprint
only: the operator scans the label's serial (or its barcode number); only an FG label (its stage label at an FG label
printing stage, ProdcutionStage 6, though its barcode row is usually at component scanning; or a barcode at that
stage with no stage label), an assembly barcode (a stage label, serial S…) or a foaming barcode (a stage label,
serial F… or L… for door / lid foaming) of the user's business unit is found (as TEST's 2.4 million stage labels
group; corrected 29 Oct 2026, the first rule took FG labels at component scanning for assembly); anything else is
refused. The reprint is what the original's Print sent for these job-card barcodes (DocType 4001: the in-process
label, PrintStatus set) and is logged in BarcodePrintTrail with its reason, as before. The server's screen API and
engine for the page are unchanged (not used by the page); the new calls are in
`server/src/modules/masters/material-barcode-reprint.js`. Checked on TEST (read only, nothing printed): an FG, an
assembly and a foaming serial and a barcode number found with the right kind; component serials, an unknown serial
and another business unit refused; a reprint without reason, printer, or with another unit's printer refused.
Its reprint history (read only, `GET …/reprint/history`) lists the BarcodePrintTrail rows of these three label kinds
in the business unit, newest first, with the same date-time filter as the RM Replacement and FG Scrap histories; on
TEST 28,114 of the 37,207 logged reprints are of these kinds.
Many labels at once (owner, 29 Oct 2026): up to 500 serials are checked in one query (OPENJSON; the database needs
compatibility level 130 or higher, TEST is 140) and printed 25 a request with one reason, each logged in
BarcodePrintTrail as a single reprint is; a label that fails is reported and the others go on. Checked on TEST (read
only, nothing printed): 300 FG serials with a repeat, a blank and two other serials checked in 49 ms, 300 found in
order and 2 not found; lists too long, empty or with a bad barcode number refused.

# Intended difference: Model To Model Transfer by a list of FG serials, grouped by product (owner, 29 Oct 2026)

Beside the original's serial range (unchanged: events 10/10 identical), the screen takes up to 500 FG serials: they
are checked in one query and grouped by their product (source material); each product gets its destination, and each
unit is moved with the range transfer's own statements (`production.service.js` moveBarcode: stock row, barcode, job
card, location; no transaction, as there) and its label printed again (printMoved: the routing stage's number of
copies), 25 a request with progress. Only live barcodes (status not 99) of FG materials (Type 100, the screen's
material list) are taken; a unit is checked again when it is moved (still of the source, still live). Each unit is
logged in ModelToModel as its own row (StartSerial = EndSerial = the FG serial, Qty 1) where the range logs one row
for the range. A unit whose label fails after the move is reported as moved, label not printed (reprint it on
Material Barcode). Checked on TEST (read only): 12 FG serials of 3 products grouped in 36 ms, a scrapped, an unknown
and a component serial refused with their reason; bad requests refused. No transfer was run on TEST (it moves stock).
The page now offers only this (owner, 29 Oct 2026): complete FG serials, one a line; the serial range form is gone
from the page (the screen's API and engine, Show and Print by range, are unchanged and still answer). The page's
list is the transfer history (ModelToModel), read only.

# Intended difference: Bill of Material shows each line's material category (owner, 29 Oct 2026)

The BOM Input and BOM Output grids show a Material Category column beside Material Type: the grids' queries (from
the original page) join MaterialCategory (`server/src/modules/forms/specs.js`, GRID_COLUMNS), and a line added or
updated gets its material's category (`screens/material-setup/bill-of-material.js`, bomAddLine). It is not a column
of BOMInput / BOMOutput, so the save writes the same columns as before (checked: the collected rows carry none of
it). Forms 5/5 and events 18/18 identical against the original (they compare the original's columns). On the page
the line's alternate materials open as a pop-up from its Alternative button, and the list of every line's alternates
(GVAltMaterial) is hidden: the screen's controls and events are the same.
On the page the BOM's lines are added and edited in the BOM Input / Output tables (owner, 29 Oct 2026: the shared
RowFormGrid): the add row and an edited line draw the screen's own editors in their cells, and Add / ✓ is the
screen's Add (Update after a Select); ✏ is the grid's Select, 🗑 its Delete. A Cancel event is new
(`GVBOMInput:cancel`, `GVOutput:cancel`): the editors back to Add (mode, line, material, quantity, button text) with
the lines unchanged, where the original stayed in Update until the next Add.

# Intended difference: Serial Generation Logic's lines edited in their table (owner, 29 Oct 2026)

The original had no edit for a logic's lines: a line was deleted (a saved one at once) and added again. Now
`GVTransData:select` puts a line into the editors (its Sequence Field and the date / serial / value part it asks for)
and the screen's Add (BtnAdd) replaces it in place, keeping its RowID and place (the sequence check leaves it out);
`GVTransData:cancel` gives an edit up (`screens/material-setup/serial-generation-logic-form.js`, ViewState EditRow).
Add without an edit is the original's, unchanged: events 3/3 identical. On the page the lines are added and edited
in the table (shared RowFormGrid, page.rowForms), as on Bill of Material. Checked on TEST in memory: a serial-number
line's Length changed through select + Add (RowID and order kept), and a cancel left the lines as they were.

# Intended difference: Routing's lines can be selected and edited (owner, 29 Oct 2026)

The original's line Select (GVTransData_SelectedIndexChanged) put each stored flag / code in its dropdown and failed
when the list did not have it. On TEST every line has BatchNoFreq and InputMaterialQC NULL (they are not columns of
the grid, so a save never writes them), so Select failed on every line ("ddlBatchFreq has a SelectedValue which is
invalid") and no line could be edited. Now a line's flag / code is put in its list when the list has it, else the list
is left at its first option (`screens/production-setup/routing-form.js`, pick); the process and checklist lists keep
the original's handling. A Cancel event is new (`GVTransData:cancel`: the editors back to Add with the next SeqNo, the
lines unchanged). Events 12/14 identical; the 2 differences are these Selects (the original's error, now the line
opened). Checked on TEST in memory: Select opens all 164 lines of 15 routings, and an edit through Select + Add changed
only the field changed. On the page the lines are added and edited in the table (shared RowFormGrid, page.rowForms).

# Intended difference: CheckList Master's parameters edited in their table (owner, 29 Oct 2026)

On the page the checklist's parameters are added and edited in their table (shared RowFormGrid, page.rowForms), with
the screen's own editors in its cells, its Add (Update after a Select), Select and Delete. A Cancel event is new
(`screens/settings/parameter-form.js`, `GVTransData:cancel`: the editors back to Add, the lines unchanged), where the
original stayed in Update until the next Add. Checked on TEST in memory: Select opens all 72 lines of 20 checklists,
an edit changed only its description, a cancel left the lines as they were.

# Intended difference: an inspection with no lot at WIP Capture and Rework Confirmation (owner, 1 Nov 2026)

In the original, when an older rejection had left a lot open at the unit's next stage, the unit got no lot of its own
and its inspection was saved on lot 0. A rejection on lot 0 then completed the stage (its empty quantities compared
equal), and Rework Confirmation failed with "There is no row at position 0" at a stage of type 6 or 8. Three changes,
all in the server:

- WIP Capture's scan: a unit with lot 0 takes the lot open at this stage (`wip.service.js` `openLot`, `wip-capture-form.js`).
- `saveQCINProcess`: a rejected unit never completes its stage, as `saveQCFinalProcess` already did.
- `saveNewRRFConfirmation`: an inspection with no lot header is confirmed; its new lot takes the barcode's DocLine and
  the job card's current process.

Checked on TEST with the transactions rolled back, for S42620261101406: before, the rejection took the job card from 8
stages done to 9 and the confirmation failed; after, it stays at 8 and the confirmation opens lot 626961362 on the
current process. `saveRRFConfirmation` (the Repair and Finishing confirmations) is unchanged.

# Intended difference: the rework scan loads the newest unconfirmed inspection (owner, 1 Nov 2026)

`validateBarcodeRRF` (Rework, Repair and Finishing Confirmation) took the first matching row, and a confirmed inspection
keeps its rejected status. So a unit failed a second time had its older inspection confirmed again: the unit was released
while the new failure stayed unconfirmed and its lot open, which is how the lot-0 case above starts. Now: the newest
inspection not yet confirmed, else the newest. A unit with one inspection behaves as before.

# Intended difference: WIP Capture's serial box offers Change at an inspection (owner, 1 Nov 2026)

After a serial is scanned at an inspection or FG label stage (results 30 and 40), `BtnWorderScan` now reads Clr, as it
already did at a component stage: the box locks and shows Change, which clears the serial and closes the inspection (now
also `QCPanel`) so another can be scanned. The original left the button on Go there, so a new serial could be typed over
the old one with the inspection open. A save still clears the box as before.

# Intended difference: asset and green tags follow a Serial Generation Logic (owner, 1 Nov 2026)

New columns (`db/migrations/2026-11-tag-logic.sql`, on TEST; to be run on LIVE before deploying): `SerialGenerationLogicHeader.UseFor`
(Generate, or Check scanned tag) and `Material.GreenTagLogic`. At WIP Capture's FG label stage (`production/tag-check.js`,
`wip-capture-form.js`, `saveQCFinalProcess`) each tag follows the logic on the unit's material:

- No logic: the box is empty and locked; the unit is saved with no tag (a green tag already on it stays). In the original,
  Asset Tag Type 0 meant a scanned tag, checked for length only.
- Generate: filled in and locked. A green tag from a logic is new; the original never generated one. A green tag already
  on the unit is kept. Green tags count apart from asset tags when the two logics differ (`SerialBarcode.AssetLogic`).
- Check scanned tag: empty, and scanned. At the save of a passed unit the tag must match the logic: fixed text, model and
  separators exactly, the number by length and range, year / month / week by format only (a tag printed last month passes).
  A green tag already on the unit is scanned too and must be the same number. The counters are not touched.

On the Material screen Green Tag Require and the green and asset tag lengths are hidden and no longer used (their columns
stay); Asset Tag Type reads Asset Tag Logic. The duplicate and customer green tag checks stay. A failed unit is not checked.

Checked on TEST: 517 of 518 logics with lines pass the check with what they generate (the other has a Year line with no
format, and no material uses it). The screen's handlers, with temporary settings put back afterwards and every save
rolled back: each setting fills the boxes as above, and an empty, wrong or different tag is refused. Not run on the screen
or with a printer. The labels read `VSerial` and `Serial2`; a label for a model with no tag was not printed.

# Intended difference: RM Replacement on an API of its own (owner, 1 Nov 2026)

A plain React screen on `/api/production/rm-replacements` (`modules/production/rm-replacements`, API.md); `/api/forms` answers 410 for
it and the generic screen resource is gone. What the operator does is unchanged: the same steps, list, raw material rule
and new serial check. Differences: the browser sends serials only, where it used to hold the chosen row's job card, row
and process codes between scans; the raw material and scrapped checks now also run at the replacement itself, not only at
the scan; a repeated request (Idempotency-Key) does not replace twice; a refused unit clears its box; the page's form is
at `?view=replace`. `rm-replacement-form.js` stays for the events parity only; no route serves it.

Checked on TEST against the original DLLs: `production-writes --api "rm replacement"` IDENTICAL through the new service
(the database rows restored after); events 9/10 on the old handler, the one difference being the serial format case above.
On TEST data the service refused an unknown unit, a scrapped unit, a serial not in the unit, a non-raw component, a wrong
format, a used serial and the same serial.

# Intended difference: FG Scrap on an API of its own, with its save corrected (owner, 1 Nov 2026)

A plain React screen on `/api/production/fg-scrap` (`modules/production/fg-scraps`, API.md); `/api/forms` answers 410 for it and the
generic screen resource is gone. `fg-scrap-form.js` stays for the events parity only; no route serves it.

The save differs from the original on purpose:

- **No error after a good scrap.** The original's last statement has a stray `)`, so every scrap answered "Incorrect syntax
  near )" after it was done, and cleared the boxes. That statement is gone. Owner's decision: **the plan quantity does not
  change**, which is what has always happened in practice, since the statement never ran.
- **One transaction**: all of it or none (the original had none, so a failure could leave a unit half scrapped).
- **A unit already scrapped is refused**, at the scan and the save. The original's check compared a serial with 99 and never
  fired, so a second scrap marked the components again and logged them again.
- **The category must be in the list** (the original took the empty choice); a repeated request does not scrap twice; a
  refused save keeps what was typed; the form is at `?view=scrap`; the job card, row and process codes no longer reach the
  page.

Checked on TEST against the original DLLs: `production-writes --api "fg scrap"` IDENTICAL in the data through the new service
(barcodes, scans and FGScrap rows, restored after), its only difference being the original's error; events 6/6 on the old
handler. On TEST data the service refused an unknown unit, a scrapped unit, a repeat scrap and a category not in the list.
Not run on the screen.

# Intended difference: Model To Model Transfer on an API of its own, each unit in one transaction (owner, 1 Nov 2026)

`modules/production/model-transfers` at `/api/production/model-transfers` (API.md); `/api/forms` answers 410 for the screen and the
generic screen resource is gone, so **the original's serial range transfer can no longer be run**, as the page stopped
offering it on 29 Oct. `model-to-model-transfer-form.js` and `modelToModelTransfer` stay for the parity scripts only.

Each unit's move (stock row, barcode, job card, location) and its ModelToModel row are now one transaction, where the
original's statements each stood alone and a failure partway left stock wrong. The unit is locked and checked again inside
it, so a second request finds it already moved. The label still prints after the commit: a printer failure reports
"moved, label not printed". A repeated request (Idempotency-Key) gets the first answer. The list of materials and printers
no longer comes from the screen's spec. The statements themselves are unchanged, including that the stock step always
takes from ReleasedQty, whatever the unit's QC status (not addressed).

Checked on TEST, every transaction rolled back and printing stubbed: a real unit's move changed the barcode, job card, both
stock rows and the log inside the transaction and nothing after it; a failure forced at its end also left nothing changed,
and the next unit in the request was still reported. Events 10/10 on the old handler. Not run: a committed transfer, a real
label, the screen.

# Intended differences: Image Display, Plan Upload and Process Guide on APIs of their own (owner, 1 Nov 2026)

`modules/production/image-display`, `modules/production/plan-uploads`, `modules/production/process-guides` (API.md); `/api/forms` answers 410 for the three, and
the plain pages no longer draw from a control list. The old handlers stay for the parity scripts. Plan Upload's row rule and the
sheet reader are one code, used by both (`plan-uploads.service.js`). What the operator sees differently:

- **Image Display:** "This serial is not known" and "This material has no image" in place of the original's .NET messages.
- **Plan Upload:** the list of plans is read only (a row used to open an empty upload form, with nothing to change). A failed
  row's message says which row. "Back to list" is "Plans so far".
- **Process Guide:** the User box is a plain read-only field (it was a disabled list). Scanning an order before a station says "Scan the
  station first" (the original's null reference). The station's process is found again from the station on each guide request.

Kept as the original has them, on purpose, and worth a decision:

- **A wrong password at the station login still logs people out:** whoever is at the station, and that user anywhere, are logged out
  before the password is checked.
- **Passwords are compared as plain text** against `Users.Password`, and the QR code holds user|password.
- Any user of the screen can log anyone out.

Checked on TEST: Process Guide's station (by code, by alias, without a department), guide, refusals, and a wrong password's logout on a
throw-away row, removed after; events 19/19 on its old handler; upload parity identical (4 of 4). Not run: a real login, the
screens in the browser, a committed Plan Upload through the new route (its row code is what parity ran).

# Intended difference: Rework Confirmation on an API of its own (owner, 1 Nov 2026)

`modules/quality/rework-confirmations` (API.md); `/api/forms` answers 410 for it and `/api/quality` has no engine screens left. The save rule
(`saveNewRRFConfirmation`) is unchanged; the browser no longer sends the inspection, barcode or inspected quantity, the server looks them up from the serial.

- **A list row used to open a generic edit form** whose Update wrote straight to InspectionTrans with no checks. It now opens the unit in the normal
  scan and confirm flow, and the generic Update is gone.
- The inspection's Status, Next Action and Unit are read only: they could be changed on the old form, but nothing read them.
- The empty printer list is gone: it had no printers and the save never used it.

Kept as the original has it, and worth a decision: **Status and Next action on the confirmation are checked but never stored.** Choosing Rejected or Scrap
confirms the rework exactly as Approved does.

Checked on TEST, two real rejected units, each save rolled back: new reads match the old Go handler (barcode, details, process, self inspection, history,
defects, checklist count); refusals for wrong quantity, no remark, no action and an unknown serial; inside the transaction the barcode moved to QC status 11,
after it stayed 13. Events 9/9 on the old handler. Not run: a committed confirmation, the checklist panel on a unit that has one (both units had none), the screen.

# Server folders follow the client's groups (owner, 1 Nov 2026)

Screen modules moved under their group, as `client/src/pages` has them: `modules/production/<screen>` and `modules/quality/rework-confirmations`. API paths did not change.

# Intended difference: WIP Capture on an API of its own (owner, approved 31 Oct 2026; built 2 Nov 2026)

`modules/production/wip-capture` (API.md); `/api/forms` answers 410 for it. The scan rules are the original page's ported code, unchanged; only where its state lives and how the browser calls it changed.

- **The server keeps the station.** The browser sends what the operator did and typed, never the scanned station, process, order, scan result, QC lot or checklist rows. A box the screen does not show open is ignored, so a generated FG serial or asset tag, a locked status, a fixed department, or a printer not in the list cannot be sent in.
- **A scan or clear applies only when the screen offers it**; calls on a station run one at a time, in order.
- **A scan box empties as soon as the scan is sent.** Before, it held the scan until the answer, so a second fast scan was typed onto the end of the first.
- Left out because nothing could reach them: the inspection's Barcode box and Go, its Close button (both stages always hide them), and the input panel's open button (the screen has none).
- `GET /api/production/wip-capture/units/:label` is gone (nothing used it); `GET /sessions/:id/unit` answers with the image this station's routing asks for.
- The server keeps the 1,000 most recently used stations.

Kept: every message, the sound, the large refused-scan flash, the saved printer buttons on each device, the layout.

Checked on TEST: `wip-parity.js comp | qc | fg --api` against the original, every row and label identical, except the unit's scan answer at inspection showing Change (owner, 1 Nov 2026). The built screen run in a browser on a throw-away copy of the app with a test session, each run's rows put back: wrong station and serial refused; components with three scans sent straight after each other, all fitted in order, stage completed; QC reject (defect category, add, duplicate refused, remove, remark kept), approve, no printer refused, saved with 2 labels; FG with serial and asset tag locked, saved with 3 labels.

Not run: a real station with a scanner, a real printer, two stations at once, a server restart in a shift, the checklist panel and the guide on a real unit (the test units have none; the guide's view has a unit test), a rejected save through the screen.

# Authorization and Business Setup on plain pages (owner, approved 3 Nov 2026)

User Master, User Roles, Change Password, Reset Password, Business Unit, Company, Department and Ledger Master are plain React pages on `/api/masters/<name>` with their own field names (`modules/masters/plain-masters.js`, API.md); `/api/forms` answers 410 for them. Their fields are grouped in numbered sections (owner, 3 Nov 2026), as Production Order's are. Saves still run the screens' parity-tested code (the forms writer and the password handlers), so keys, EventLog, child rows and messages are unchanged.

Intended differences:

- **Retype Password is masked** on both password pages (it was plain text).
- **Business Unit's "Combo trial" picker and its empty tree are gone**: the picker listed nothing and neither was saved.
- **User Master's "Select all"** ticks every process in the page itself; before, the server's event did the same.
- **Delete stays hidden** on every page, as on the old form.
- **Department's Control Indicator is required** on the page (owner, 3 Nov 2026): left empty it saved as 0 and failed on
  FK_Department_DeptControlIndicator, on the original too. The server still takes what it is sent, as before.

Checked on TEST against the original DLLs, through the new services: `forms-write-parity.js --api` for User Master, Business Unit, Department and Ledger Master: identical; User Roles fails alike on cancel (UserRoles has no Status column). `page-writes-parity.js --api`: the 10 Change / Reset Password cases and the Company update identical. Built pages run in a browser with a TEST system-user session: every page opens, lists name coded values (Company's licence type), the role tree and the tick lists show the saved choices, a department created, updated and copied through the page (removed afterwards), and the old engine path answers 410.

Not run: Change / Reset Password through the page (the comparison runs them on a temporary user), a user's photo or a logo uploaded through the page.

# Settings on plain pages (owner, approved 4 Nov 2026)

Defect Codes, Employee, Identification Tag Designs, Barcode Printer, Rework Resolution, Root Cause and Material Scrap Reason are plain pages on `/api/masters/<name>` the same way (`plain-masters.js`, API.md), fields grouped in sections; `/api/forms` answers 410 for them. Saves run the same writer. Employee keeps its Print (a saved, not cancelled record, on one of the unit's printers: `POST /:key/print`, the screen's own print handler); Tag Design keeps its PRN preview beside the command. Check List, Check List Values and Shift (owner, 4 Nov 2026) add, edit and delete their rows through the screen's own handlers (`POST /events/:event`), in the table itself with the shared row editor (RowFormGrid, as Bill of Material): duplicate checks, line numbers, the input type's Min / Max and List editors and the editor's Cancel are the screen's.

Intended differences:

- **Dates are date pickers** on Employee (Join, Birth, Anniversary); they were plain text boxes holding the same yyyy-mm-dd.
- **Delete stays hidden**, as on the old form.
- **Check List's line editors not in a column** (Min, Max, Pass Value, Unit, Result Defined By, List Items, Instrument, Guide Image) sit under the line being added or edited, shown as the input type asks.

Checked on TEST against the original DLLs: `forms-write-parity.js --api` for the 10 screens: identical, except Scrap Reason's cancel, which fails alike on both sides (ScrapReasons has no Status column). `events-parity.js --api` for the 3 table screens: 7 of 10 cases identical, 2 fail alike, 1 is the original host's known `ctl00` error. Built pages run in a browser with a TEST system-user session: Shift adds a break, refuses a duplicate ("Value Already Added") and deletes it; Check List edits a line, shows the numeric and list editors as the input type changes, and cancels the edit; Check List Values adds a value on a new record (nothing saved); each page opens a saved record with its values, the lists open, Tag Design draws the preview, Print without a printer is refused ("Choose a printer first."), the old engine path answers 410 and Shift is still served.

Not run: a label actually printed, a tag image uploaded through the page.

# Material Setup on plain pages (owner, approved 4 Nov 2026)

Unit of Measure, Variant Field, Variant Values, Material Category, Model, Material Master, Serial Generation Logic and Bill Of Material are plain pages on `/api/masters/<name>` the same way (`plain-masters.js`, API.md), fields grouped in sections; `/api/forms` answers 410 for them. Material Barcode was already a page of its own (the reprint views) and is unchanged. Saves run the same writer. Every option change and table row runs the screen's own handler (`POST /events/:event`): Material's type, category, model and base UOM picks; Model's and Material's variants in the shared VariantGrid (Add builds the Alias, a new value is created as before); Serial Generation Logic's parts and Bill Of Material's input / output lines in the shared row editor (RowFormGrid), the editors shown as the screen's panels say (serial / date / value editors, Output Scan, the sub-routing); an input line's Alternative opens its alternates in a pop-up (add, remove, Update, close: the screen's buttons). The lists the screen's code filled (a type's categories, a field's values, a type's materials) go back with each event as the screen has them, as the engine's client posted them, so its handlers read the same items. Serial Generation Logic keeps its preview; Material keeps its artwork / unit frame / basket images.

Intended differences:

- **Fields the old pages already hid are not part of the API** (Material's batch, FIFO, reorder, depreciation, inspection, tag lengths, ledger map; Material Category's tag design and inspection; BOM's weight and business unit, which the screen keeps hidden). As before, a saved record keeps their values and a new one gets the screen's defaults; they can no longer be sent.
- **The record's code shows locked on every screen** (BOM Code included, which the screen kept hidden), as on the other plain pages.

Checked on TEST against the original DLLs: `forms-write-parity.js --api` for the 8 screens: Unit of Measure, Variant Field, Variant Values and Model identical. The other four differ only in fields the page does not name, which the script fills on the original side: Material Category's TagCode / inspection / CertificateControl, BOM's Weight / WeightUom, Material's HSNCode / Barcode / ExipiryMonths / DepreciationMethod and its ledger map (so the original's update fails on the ledger map with the known `REFID` error and the new side's does not; a record with stored ledger map rows still loads and saves them as before), and Serial Generation Logic's `UseFor`, the new column the original does not have. `events-parity.js --api` for the 5 screens with events: 39 of 42 cases identical, 3 fail with the same error on both sides (Model's Add on a category without `~`, Material's ledger-map delete), shown as different only because the original's message carries its line number. A plain-service run of the events (Model: field → values, Add, refused repeat, delete; Material: type → categories (list held with its Select item), category → models, base UOM → purchase / sales units; Serial Generation Logic: the serial editors shown, add, edit, cancel, delete; BOM: type → materials, material → unit / sub-routing, add a line, Alternative opens the pop-up, add / Update / remove an alternate, close, edit and cancel a line): 23 of 23 as expected, nothing saved. Built pages run in a browser with a TEST system-user session: BOM opens with its tables, Alternative opens the pop-up and ✕ closes it; Material opens with its sections (purchase / sales hidden by TEST's finance settings), ✏ on a variant lists its field's values; Serial Generation Logic draws the preview and ✏ on its serial part shows the serial editors only; Model opens beside its variants; the old engine path answers 410 for all 8.

Not run: a record saved through these pages in the browser (the writes are covered by forms-write-parity), an image uploaded.
