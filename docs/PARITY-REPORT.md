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
