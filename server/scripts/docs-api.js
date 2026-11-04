// docs/API.md: the REST APIs, the masters' and quality screens' fields and events from the code.
// Usage (from server/): node --env-file=.env scripts/docs-api.js . ../docs/API.md
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [srv, out] = process.argv.slice(2);
const imp = (p) => import(pathToFileURL(`${srv}/src/${p}`).href);
const { MASTERS } = await imp('modules/masters/masters.routes.js');
const { QUALITY } = await imp('modules/quality/quality.routes.js');
const { PRODUCTION } = await imp('modules/production/production.routes.js');
const { screenResource } = await imp('modules/forms/resource.js');
const { PLAIN_SERVICES } = await imp('modules/masters/plain-masters.js');
const { FORMS } = await imp('modules/forms/specs.js');
const md = [];
md.push(`# Garuda WRL API

All under \`/api\`, JSON in and out. Every call except sign-in needs the session cookie (\`POST /api/auth/login\`);
a screen's calls also need the user's role to open that screen. Errors: \`{ message }\`, plus \`errors\` (field -> problem)
on 422. 400: the screen refused (its own message, as the original showed it); 401 not signed in; 403 no access; 404 no
such record / event; 500 \`{ message }\` with the request reference that is in the log.

## Sign-in — /api/auth

| Call | Does |
|---|---|
| \`GET /login-page\` | what the sign-in page shows (company, business units shown or not) |
| \`GET /business-units\` | the sign-in business unit list |
| \`POST /login\` | \`{ userId, password, businessUnit }\` -> the session cookie; the original's refusals (locked, expired, must change password ...) |
| \`POST /change-password\` | \`{ userId, current, next }\` |
| \`POST /logout\` | ends the session |
| \`GET /me\` | the signed-in user and their menu |

## Production orders — /api/production/orders

| Call | Does |
|---|---|
| \`GET /?page=&column=&op=&value=\` | a page of orders, optionally filtered on one column |
| \`GET /search-fields\`, \`GET /search-fields/:column/values\` | filterable columns, a column's values |
| \`GET /new\` | a blank order with its options |
| \`POST /changes/:field\` | \`material\` / \`orderType\` / \`salesOrder\` chosen: what changes |
| \`POST /service-requests\` | adds the picked service request as a line |
| \`GET /:prodNo\` · \`POST /\` · \`PUT /:prodNo\` · \`DELETE /:prodNo\` (\`{ remark }\`) | read, create, update, cancel |

## Production assignment — /api/production/assignments

| Call | Does |
|---|---|
| \`GET /new\` | the screen as it opens, with its lists |
| \`POST /changes/:field\` | \`department\` / \`order\` / \`routing\` / \`process\` / \`station\` chosen: what changes |
| \`POST /print\` | starts the order at its first stage and prints the job cards (only values the server offered) |

## Setup and quality screens — /api/masters/<name>, /api/quality/<name>

Each of these screens is a resource. The screen's own code runs underneath (parity-tested against the original); the
API only names its fields. A field is the column its control is bound to (camelCase); a grid, check list or tree is
named after its child table and holds the screen's own values (grid rows with their column names, the checked values);
a control with no column is named after its control ID. The QC panel (\`qc\`), the approval footer (\`footer\`), a
picked file and an image hold the screen's own structure: send them back as you got them, with the operator's input.

A refused save / update / delete answers 400 \`{ message, alert? }\` (alert: what the original page showed). The list
(\`GET /\`) works where the screen has one; on screens without a View button (Final Inspection, NCMR ...) it fails as
the original's list query does.

| Call | Does |
|---|---|
| \`GET /?page=&column=&op=&value=\` (\`f.<name>=\` a page's own list choices) | a page of records (1000 a request; \`total\` = all) |
| \`GET /search-fields\`, \`GET /search-fields/:column/values\` | filterable columns, a column's values |
| \`GET /layout\` | what a page draws the screen from (the same as \`/api/forms/spec\`), plus \`api: { fields, names, events }\` (field -> control, control -> API name, event -> control) |
| \`GET /new\` | \`{ record, options, ui, viewState, events, printers, copyFrom }\`: a blank record as the screen opens it |
| \`GET /:key\` · \`GET /:key/copy\` | a saved record (\`status\` / \`statusMessage\` when cancelled); Copy where the screen has it. \`ui\` holds every control (visible, enabled, readOnly, text, refilled) |
| \`GET /pickers/:field?search=\` | a search picker's rows |
| \`POST /events/:event\` | \`{ record, viewState, ui, arg, index }\` -> \`{ record, options, ui, alert, viewState }\`: what an option change or button does |
| \`POST /\` · \`PUT /:key\` · \`DELETE /:key\` (\`{ remark, record? }\`) | create (201, \`{ key, message }\`), update, cancel (status 200, not erased) |
| \`POST /print\` | \`{ record, printer }\`: the screen's print |

Send the whole \`record\` the API gave you back (with your changes), and the \`viewState\` of the last answer: the screen's
code works on the full form, as the original page did.
`);
for (const [base, screens] of [['masters', MASTERS], ['quality', QUALITY], ['production', PRODUCTION]]) for (const [n, r] of Object.entries(screens)) {
  const plain = base === 'masters' && PLAIN_SERVICES[n];
  const m = plain || screenResource(r);
  md.push(`### ${FORMS[r].title} — \`/api/${base}/${n}\``, '');
  if (n === 'material-barcodes') {
    md.push("Original: `View/MaterialSetup/MaterialBarcode.aspx`. Reprint only: the reprint calls below; the screen's list, save and delete are not served.", '');
    continue;
  }
  if (plain) {
    // a plain page's screen (modules/masters/plain-masters.js): its own field names, no events or layout
    md.push(`Original: \`${FORMS[r].file}\`. Plain page; the old screen engine is gone. Fields: ${Object.keys(m.FIELDS).map((f) => `\`${f}\``).join(', ')}.`);
    md.push('', 'Calls: `GET /`, `/search-fields`, `/search-fields/:column/values`, `/new`, `/:key`' + (m.copy ? ', `/:key/copy`' : '') + '; `POST /`, `PUT /:key`, `DELETE /:key` with `{ record }` (DELETE `{ remark }`). A record comes as `{ record, options, status, statusMessage }` (plus `copyFrom`, `tree` where the screen has them); create answers `{ key, message, alert }`, and `logout: true` when a password was changed.', '');
    continue;
  }
  md.push(`Original: \`${FORMS[r].file}\`. Fields: ${Object.keys(m.FIELDS).map((f) => `\`${f}\``).join(', ')}.`);
  if (Object.keys(m.EVENTS).length) md.push('', `Events: ${Object.keys(m.EVENTS).map((f) => `\`${f}\``).join(', ')}.`);
  if (m.print) md.push('', 'Print: yes.');
  md.push('');
}
md.push("Material also has its artwork, unit frame and basket images (`:kind` = `artwork`, `unitframe` or `basket`; table MaterialImages), each stored on its own as soon as it is uploaded, apart from the record's Save / Update: `GET /api/masters/materials/:code/images` (which ones it has: `kind`, `fileName`, `mimeType`, `size`, `updatedOn`), `GET …/images/:kind` (the file itself), `PUT …/images/:kind` with `{ fileName, data }` (base64; PNG, JPEG, WebP or PDF, told by the file's bytes, up to 10 MB; 404 for a material that does not exist) and `DELETE …/images/:kind`. Same access as the Material screen. The original screen had only the one image (`materialImage`); added by the owner, 28 Oct 2026.", '');
md.push('Material\'s `route` is the material\'s routing (`Material.Route`): Production Assignment selects it when an order of that material is chosen. The original screen had no such field; added by the owner, 28 Oct 2026, as on LIVE.', '');
md.push("Material Barcode is a reprint page (owner, 29 Oct 2026): `GET /api/masters/material-barcodes/reprint/:serial` finds the FG label, assembly or foaming barcode with that serial (or barcode number) in the user's business unit (`kind`, `serial`, `barcodeNo`, material, job card, production order, process, reprints; 404 for any other barcode), `GET …/reprint/printers` lists the unit's printers, and `POST …/reprint` with `{ barcodeNo, printer, remark }` prints the label again (the in-process label, as the original Print) and logs it in BarcodePrintTrail; `GET …/reprint/history?page=&start=&end=` lists those reprints, newest first, read only (reprinted on, label, serial, material, job card, reason, reprinted by; 1000 a page; the same time range as the histories below).", '');
md.push('Many labels at once (e.g. 300 FG labels from their serials): `POST …/reprint/check` with `{ serials }` (up to 500; blanks and repeats left out) answers each serial in order, found (the label, as above) or `{ serial, error }`; `POST …/reprint/many` with `{ barcodeNos, printer, remark }` (up to 50 a request; the page sends 25 at a time) prints them in order with one reason and answers `[{ barcodeNo, serial, ok, error? }]`: a label that fails is reported and the rest go on. The serial lookup uses OPENJSON (database compatibility level 130 or higher).', '');
md.push("Serial Generation Logic also has `POST /api/masters/serial-logics/preview` (owner, 29 Oct 2026; read only): `{ rows, barcodeLength, serialCode?, material? }` (the form's lines, saved or not) answers what the logic makes, built as production builds a serial from its lines (dates today, the model's Alt Name, the serial number padded to its length): `first`, `last` (its Ending No, else the largest the length holds), `count`, `length`, `parts` (each line's part and separator), `problems` (e.g. a length that differs from the Barcode Length, a start after the end), and for a saved logic the `materials` using it (the Model part's material, the first one by default). Nothing is taken or counted.", '');
md.push("### WIP Capture — `/api/production/wip-capture`\n\nOriginal: `View/Production/WIPCaptureForm.aspx`. Its own module (`modules/production/wip-capture`); the old screen engine is gone. A station's state (scanned station, process, unit, scan result, QC lot, checklist) stays on the server for a shift; each opened screen has its own. The scan rules are the original page's ported code, unchanged.\n\nEvery call below on `/sessions/:id` answers `{ station, alert?, success?, explain?, model? }`: `station` is the screen to draw; `alert` a refusal (status 200: the scan is answered, and a box may be cleared); `explain` `{ title, text }` where a refused unit is now. A station that is gone answers `{ restarted: true, alert }`.\n\n| Call | Does |\n|---|---|\n| `POST /sessions` | opens a station: `{ id, station, alert? }` |\n| `POST /sessions/:id/department` `{ department }` | chooses the department (ignored when the user's is fixed) |\n| `POST /sessions/:id/station` `{ station }` · `DELETE` | scans / clears the station |\n| `POST /sessions/:id/unit` `{ serial, stationPrinter? }` · `DELETE` | scans / clears the unit; `station.result`: `started`, `completed`, `recorded`, `inputs`, `qc`, `fg` |\n| `GET /sessions/:id/unit` | the scanned unit's `{ route, cabinet }`, each null when its lookup fails |\n| `POST /sessions/:id/inputs/scan` `{ component }` | a component scan |\n| `POST /sessions/:id/inputs/consume` `{ qty, uom }` | consumes it when a quantity is asked |\n| `DELETE /sessions/:id/inputs` | closes the component panel |\n| `POST /sessions/:id/qc/status`, `/qc/defect-category` | a list that answers at once |\n| `POST /sessions/:id/qc/defects` · `/qc/defects/remove` `{ arg, index }` | adds `defectCode` / removes a row |\n| `POST /sessions/:id/qc/checklist` · `/qc/checklist/:event` `{ f, arg, index }` | opens the checklist / its events (`next`, `prev`, `save`, `value`, `list`, `go`, `goto`, `Pass`, `Fail`, `close`); only its typed inputs are taken |\n| `POST /sessions/:id/qc/clear` | clears the inspection |\n| `POST /sessions/:id/qc/save` | saves the result, and for FG the label; takes an `Idempotency-Key` header |\n| `POST /sessions/:id/guide` · `/guide/file` `{ guideFile }` · `/guide/document` · `DELETE /guide` | the station's guide |\n| `GET /units/:label/image/:kind` | the unit's FG material image (`artwork`, `unitframe`, `basket`) |\n\nThe QC calls also take what was typed: `status`, `nextAction`, `defectCategory`, `defectCode`, `inspectedQty`, `bee`, `printer`, `fgSerial`, `assetTag`, `greenTag`, `remark`. A box the screen does not show open (a generated tag, a locked status), or a list item that is not listed, is ignored.\n\n", '');
md.push("### Rework Confirmation — `/api/quality/rework-confirmations`\n\nOriginal: `View/Quality/ReworkConfirmationNew.aspx`. Its own module (`modules/quality/rework-confirmations`); the old screen engine is gone.\n\n| Call | Does |\n|---|---|\n| `GET /options` | `{ departments, department, rootCauses, actions, showRootCause, statuses, newActions, checklist }` |\n| `GET /units/:serial` | the rejected unit's inspection: `{ serial, barcodeNo, qty, uom, status, nextAction, hasInspection, details, defects, process, selfInspection, history, checklist }` |\n| `GET /records/:id/serial` | a list row's unit |\n| `POST /checklist` `{ state, rows }` · `POST /checklist/:event` `{ state, arg, index }` | the checklist panel; nothing is stored |\n| `POST /` `{ serial, qty, rootCause, actionTaken, remark, status, newAction, department }` | confirms; the inspection, barcode and quantity are looked up by the server. Takes an `Idempotency-Key` header |\n| `GET /?department=&page=` | the units waiting in a department |\n\n", '');
md.push("### Image Display — `/api/production/image-display`\n\nOriginal: `View/Production/WRLImageDisply.aspx`. Its own module (`modules/production/image-display`); the old screen engine is gone.\n\n| Call | Does |\n|---|---|\n| `GET /units/:serial` | the unit's material image: `{ image }` (a data URL) |\n\n### Plan Upload — `/api/production/plan-uploads`\n\nOriginal: `View/Production/ProdPlanUpload.aspx`. Its own module (`modules/production/plan-uploads`); the old screen engine is gone.\n\n| Call | Does |\n|---|---|\n| `POST /read` `{ file: { name, data } }` | the sheet's first page (data: base64 .xlsx): `{ columns, rows }` |\n| `POST /` `{ columns, rows }` | each row applied in order: `{ applied: [true \\| false], error? }`; `false` is a row not of this or next month, or of an unknown material; `error` stops at the row that failed, the rows before it stay. Takes an `Idempotency-Key` header |\n| `GET /?page=&column=&op=&value=` | the plans so far; `GET /columns` the columns it can be filtered on, `GET /values/:column` a column's values |\n\n### Process Guide — `/api/production/process-guides`\n\nOriginal: `View/Production/ProcessGuideForm.aspx`. Its own module (`modules/production/process-guides`); the old screen engine is gone.\n\n| Call | Does |\n|---|---|\n| `GET /options` | `{ departments, department, departmentFixed, stations, users, user, logins }` |\n| `GET /stations/:code?department=` | a station scanned: `{ station, alias, process, department }` |\n| `GET /guide?serial=&station=&department=` | the job card at that station: `{ instructions, files: [{ label, kind, url }], materials: [{ model, material }] }` |\n| `GET /logins` | who is logged in at a station |\n| `POST /logins` `{ station, user, password, qr }` | logs in (a QR holds user\\|password), answers `{ logins }` |\n| `DELETE /logins/:userCode` | logs out, answers the logins |\n\n", '');
md.push("### Model Transfer — `/api/production/model-transfers`\n\nOriginal: `View/Production/ModelToModelTransferForm.aspx`. Its own module (`modules/production/model-transfers`), not a screen resource; the old screen engine is gone.\n\n| Call | Does |\n|---|---|\n| `GET /options` | what the screen chooses from: `{ materials: [{ value, label }], printers: [{ value, label }] }` |\n| `POST /check` `{ serials }` | up to 500 serials (blanks and repeats left out) checked and grouped by product: `{ groups: [{ materialCode, material, materialAlias, units: [{ serial, barcodeNo }] }], refused: [{ serial, error }] }` |\n| `POST /` `{ source, destination, barcodeNos, printer }` | up to 50 units of one product moved, each in its own transaction, then its label printed again: `[{ barcodeNo, serial, ok, printed, error? }]`. A unit that fails is reported and the rest go on; `printed: false` means moved, label not printed. Takes an `Idempotency-Key` header |\n| `GET /history?page=&column=&op=&value=` | the transfers so far, read only; `GET /history/columns` the columns it can be filtered on, `GET /history/values/:column` a column's values |\n", '');
md.push("### Component Replacement — `/api/production/rm-replacements`\n\nOriginal: `View/Production/RMReplacementForm.aspx`. Its own module (`modules/production/rm-replacements`), not a screen resource; the old screen engine is gone.\n\n| Call | Does |\n|---|---|\n| `GET /units/:serial` | the unit and its components: `{ serial, components: [{ category, material, process, serial, replaceable }] }`; a scrapped or unknown unit is refused (400) |\n| `POST /` `{ unit, existing, replacement }` | replaces the component; `{ message, serial, components }` as it is now. Refused (400) for a serial not in the unit, a component that is not raw material, or a new serial its material's logic rejects or that is already scanned; 422 for a missing serial |\n| `GET /history?page=&start=&end=` | the components replaced in units of the user's business unit, newest first, read only |\n\nThe request carries serials only: the job card and row come from the server's own lookup. `POST /` takes an `Idempotency-Key` header: the same key again gets the first answer, not a second replacement.\n", '');
md.push("### FG Scrap — `/api/production/fg-scrap`\n\nOriginal: `View/Production/FGScrapForm.aspx`. Its own module (`modules/production/fg-scraps`), not a screen resource; the old screen engine is gone.\n\n| Call | Does |\n|---|---|\n| `GET /categories` | the scrap reasons: `[{ value, label }]` |\n| `GET /units/:serial` | the unit and its components: `{ serial, components: [{ category, material, process, serial }] }`; a scrapped or unknown unit is refused (400) |\n| `POST /` `{ unit, category, remark }` | scraps the unit in one transaction; `{ message, serial }`. Refused (400) for a unit already scrapped or unknown, or a category not in the list; 422 for a missing field or a remark over 150 characters |\n| `GET /history?page=&start=&end=` | the units / items scrapped on job cards of the user's business unit, newest first, read only |\n\n`POST /` takes an `Idempotency-Key` header: the same key again gets the first answer, not a second scrap. The plan quantity does not change.\n", '');
md.push('Both histories take an optional time range: `start` and `end` as `YYYY-MM-DDTHH:mm` (what a date-time box holds), each limit included. A value that is not a date and time, or a start after the end, answers 400.', '');
md.push('## Screen engine — /api/forms (removed)', '', "Removed on 4 Nov 2026: every screen has an API of its own (above) and the client no longer calls it, so `/api/forms` answers 404. The engine's code in `modules/forms` (state, writer, the pages' own code in `screens/`) stays: the screen resources run it.", '');
writeFileSync(out, md.join('\n'));
process.exit(0);
