# Handoff: Garuda WRL web app (status 21 Oct 2026)

Read this first, then `docs/AUDIT-AND-PLAN.md` (audit, agreed decisions, phased plan) and `README.md`.

## 1. What this project is

- **Goal:** replace the ASP.NET WebForms MES "Garuda WRL" (Western Refrigeration, freezer plant) with
  **React 19 + Vite + Tailwind 4** (client) and **Node/Express 5 + mssql** (server) on the **same SQL Server
  database and schema** (no schema changes without the owner's approval).
- **Scope now:** only the shop-floor flow *production order → assignment → station scans → QC → rework → FG label*
  plus its masters (47 screens). Everything else was removed (recoverable, see §6).
- **Repo:** `C:\Users\vikash.kumar\Desktop\Custom App\Garuda\garuda-web` (git, branch `main`).
  Original .NET source: `..\source\Garuda` (pages) and `..\source\Avatar\Avatar`, `..\source\Yojak\Yojak` (business
  logic, DataWrapper). Original compiled site for parity runs: `..\build\Publish WRL\bin`.
- **Database:** test copy **Garuda_WRL_TEST** on `vikashk-pc\WRLDEV` (credentials in `server/.env`, never print them).
  **Never write to production LIVE.**
- Owner preferences: no `Co-Authored-By: Claude` lines in commits; stop only processes you started (never kill the
  owner's dev servers by pattern); don't commit/push unless asked (owner asked for small logical local commits during
  the refactor); test writes only on Garuda_WRL_TEST.

## 2. How to run

```
cd garuda-web
npm install
npm run dev            # scripts/dev.mjs: API :4000 (node --watch) + Vite :5180 (proxy /api, /GuideFiles)
npm test               # 23 server unit tests (node:test)
npm run build          # client build to client/dist (server serves it in production: npm start)
```
Sign in at http://localhost:5180 with a test user (system user "garuda"; ask the owner for the password; do not store
it). A WRL login needs a production line. Session = signed cookie; a non-system user's department comes from their
employee record; WIPCapture locks the department once the session has one (original behaviour).

## 3. Architecture (current)

```
client/src
  main.jsx                 routes: /login, /change-password, AppLayout -> /start, * -> NotMigrated
  layouts/AppLayout.jsx    menu from /api/auth/me, menu search, header
  pages/NotMigrated.jsx    picks EngineForm for any route in me.migrated.forms
  pages/forms/EngineForm.jsx (791 lines) draws EVERY screen from a server control list (ASP.NET markup -> JSON)
server/src  (QMAS-style feature modules since 26 Oct; see README "Where things are")
  modules/menu/keep.js             THE keep-list of 47 screens (forms routes + menu read it)
  modules/menu/menu.service.js     menu.json pruned to keep-list, per-user role filter
  modules/forms/forms.json         specs of the 47 kept screens (scripts/extract-forms.js regenerates, filtered by KEEP)
  modules/forms/forms.routes.js    /spec /list /record /event /save /update /cancel /print (handlers inline)
  modules/forms/screens/           per-screen ported code-behind, one file per screen (31 + 5 shared helper files),
                                   registered in screens/registry.js (PAGE_EVENTS[file][control], PAGE_LOAD ...);
                                   modules/forms/pages.js only loads them and re-exports the registries
  modules/production/{wip,production,labels}.service.js, modules/quality/quality.service.js, modules/forms/qc.js
                                   ported Avatar.dll business logic (DB writes, labels)
  modules/forms/write.js           generic DataWrapper insert/update/cancel; state, lists, children: generic engine
  modules/production-orders/, modules/production-assignments/   domain APIs: .routes / .service / .repo / .validation
  modules/forms/resource.js        a screen as a REST resource (field names = bound columns), the same page code
  modules/masters/                 /api/masters/<name>: the 32 setup screens through resource.js (docs/API.md,
                                   docs/MIGRATION-PLAN.md); the client still uses /api/forms for them
  modules/quality/quality.routes.js  /api/quality/<name>: the 6 quality screens, the same way
  modules/production/production.routes.js  /api/production/<name>: the 7 shop-floor screens, the same way
  shared/sql.js                    the ONLY SQL splice guards: num, digitsOrEmpty, requireDigits, lit
  shared/{net,format,values}.js    .NET-compatible parsing/formatting; db/pool.js query, db/tx.js transactions
  shared/AppError.js + middlewares/errorHandler.js   AppError.badRequest / notFound / unprocessable -> the response
server/scripts/parity      original-vs-new harness (.js; dev only, not deployed) (PowerShell runs the original DLLs; compares screens, DB rows, labels)
```
Key behaviour: each client event posts all field values + ViewState + `ui` (visibility/enabled/text, and the items of
any dropdown that is page-level or was refilled by an event/first load) to `/api/forms/event`; the handler returns
control patches.

## 4. Done so far (commits on main)

| Commit | What |
|---|---|
| `b075850` (tag `backup-before-redesign`) | Full port + E2E fixes (below) |
| `71fdd50` | Keep-list (47 screens), reports/dashboards APIs off, Windows-safe `npm run dev`, keep-list test, audit/plan doc |
| `e34a1a7` | Reports & dashboards removed from codebase; `reports/format.js` -> `lib/format.js` |
| `182dce1` | Phase 1: specs/page code trimmed to the keep-list (47 screens, including the 9 the owner added), `lib/sql.js`, parity scripts pruned. Regression equal to baseline |
| `551ef5f` | Phases 2-3: client on the **QMAS design system** (owner asked to use QMAS's design) |
| `78d25b9` | Phase 4 (in progress): `useEngine.js` (shared event plumbing for RecordForm and flow screens), `pages/flow/` kit (ScanBox, result banner, beep, step track), dedicated WIP Capture (scan-first, results 11/21/30/40), sectioned layouts for Production Order, Production Assignment, Rework Confirmation New (`flow/layouts.js`); ScanBox no longer a nested `<form>` |
| `a6508f5` | ComboField search no longer a nested `<form>` (Enter/search button submitted the record form instead) |
| `e545591` | WIP Capture: route progress and the stage's components as a checklist (fitted when consumed >= required) |
| next | WIP Capture redesigned to the owner's mockup: Scan & Identify, Cabinet Details, Process History (whole route with Completed / In Process / Pending), Component Details, Inspection & Defect Recording. Read-only `GET /api/forms/unit?path=/production/wipcaptureform&label=` (replaces `/route`) returns `route` (`routeByLabel`) and `cabinet` (`cabinetByLabel`: FG material name/category/model/image, MaterialVariant values such as colour/dimension, customer via PRODHeader.SalesOrder -> SOHeader -> Ledger); each part fails alone (logged) |
| `c174b1b` (PR #5, Varun) | Client moved to **shadcn/ui** (JS), one page file per sidebar tab: see `client/STRUCTURE.md` (`engine/`, `features/wip-capture/`, `pages/<group>/`). Replaces the QMAS kit of §5 |
| `401703e` Phase 5 | Operator messages (`server/src/lib/messages.js`, applied to every `/forms/*` response; originals logged as `[message]`), rule fixes: scans blocked on Hold(11) / Cancelled(200) production orders (`assertOrderOpen`, wip.js), WIP QC remark saved (InspectionTrans.Remark), PRODHeader.AssignedQty +1 per job card. DB script `server/sql/2026-10-phase5-rule-fixes.sql`: run on TEST 25 Oct (index: already there; AssignedQty backfill: 31,289 orders), **not on LIVE** |
| *uncommitted* Phase 6 | Security: `lib/throttle.js` (sign-in / change-password lockout per user ID and per client), `lib/http.js` (security headers, CSP report-only by default, `X-Request-Id`, one log line per API call, `LOG_FILE`), cookie Secure flag from `COOKIE_SECURE`, `TRUST_PROXY`, DB name hidden on the sign-in page (`SHOW_DB_ON_LOGIN`), sign-in errors reworded, unreadable request bodies -> 400, stored dropdown value in `state.js` guarded with `num()`; `server/.env.example` added |
| *uncommitted* Phase 7 | README rewritten (run / deploy / maintain / parity / gaps), dead `client/src/layouts/CommandPalette.jsx` removed, STRUCTURE.md line fixed |

E2E test (21 Oct, browser, test DB): freezer F390GL24 (22600118), route 12502 (17 stations) from order PO82603053 to
FG label; rework, hold/cancel, ~47 scenarios. Report: https://claude.ai/artifact/A3Ddeh4NKpLysYmtfPUaQS (private to
the owner). Bugs fixed then: write.js key check (stage completion), WIPCapture ViewState on first load, dropdown items
not posted (defect add / assignment reset), first-table key set on row (no double key).

## 5. Design (Phases 2-3, done)

The owner chose QMAS's design (`Custom App/QMAS/frontend`) instead of a new one. Copied from QMAS: index.css,
styles/dark.css, app/theme.js (key `garuda.theme`), app/confirm.js + layouts/ConfirmHost.jsx, ui/ (Button, Badge,
fields, Loader, Modal, PopMenu, DataTable, PageHeader), utils/ (prefs, csv), logo/login background. Deps added:
lucide-react, react-hot-toast. Shell: layouts/Navbar, Sidebar, CommandPalette (Ctrl+K), nav.js (group order/icons,
home tiles). Engine screens: `pages/forms/` EngineForm (container) -> RecordList (DataTable, server-paged) /
RecordForm (fire/act logic unchanged) + FormControls, Grid, QCPanel, engineState. Calendar control dropped (unused).
Checked in the browser (test DB): home, sidebar, UOM list + record, WIP Capture department postback.
Regression suites for the server were not rerun after this commit (client-only change).

Parity regression commands (run ONE AT A TIME, they share rows):

```
cd server
set B=C:/Users/vikash.kumar/Desktop/Custom App/Garuda/build/Publish WRL/bin
node --max-old-space-size=8192 --env-file=.env scripts/parity/events-parity.mjs "%B%"
node --max-old-space-size=8192 --env-file=.env scripts/parity/forms-parity.mjs "%B%" /businesssetup/ /materialsetup/ /productionsetup/ /settings/ /authorization/ /production/ /quality/ /ceat/
node --env-file=.env scripts/parity/wip-parity.mjs "%B%" comp      (also: qc, fg)
node --env-file=.env scripts/parity/print-parity.mjs "%B%"
node --env-file=.env scripts/parity/rework-new-parity.mjs "%B%"
node --env-file=.env scripts/parity/upload-parity.mjs "%B%"
node --env-file=.env scripts/parity/page-writes-parity.mjs "%B%"
node --env-file=.env scripts/parity/production-writes-parity.mjs "%B%"
node --env-file=.env scripts/parity/grid-db-parity.mjs "%B%"
```
Baselines after Phase 1: events 196/202 (5 fail alike, 1 ParameterForm harness limit); forms 127/138, 0 different;
WIP comp/qc/fg identical; print 9/10 (1 fails alike); rework/upload/page-writes/production-writes/grid-db identical.

## 6. Agreed decisions (owner, 21 Oct)

1. Rebuild the 5 flow screens (Production Order, Production Assignment, WIP Capture, Rework Confirmation New, FG label
   inside WIP) as dedicated React screens + clean JSON APIs that call the SAME business functions (wip.js etc.), so DB
   writes/labels stay identical; prove it with rowset/label parity.
2. Operator-friendly messages (map original texts like "There is no row at position 0", "Object reference not set…",
   typos "Succefully/Departmet/Paramaters"); original text to server log.
3. Rule fixes: block scans when the production order is Hold(11)/Cancelled(200); save the WIP QC remark
   (TBWQCRemark -> InspectionTrans.Remark); maintain PRODHeader.AssignedQty on assignment; add a non-destructive index
   on MaterialBarcode(Serial) (show the script to the owner before running).
4. Hidden code removed from the codebase (done for reports/dashboards; Phase 1 does the rest).
Recovery of anything removed: `git checkout backup-before-redesign -- <path>` or folder
`..\garuda-web-backup-2026-10-21` (full copy incl. .env and git history).

## 7. Remaining plan (see AUDIT-AND-PLAN.md §3)

- **Phase 4: done.** Server parity after Phase 5 (25 Oct): WIP comp/qc/fg, rework, production writes identical; events
  196/202 (baseline); print 9/10 identical + 1 failing alike (baseline), incl. a real 2-piece Production Assignment (print-parity now picks the
  order by its job cards, and reports AssignedQty).
- **Phase 5: done** (`401703e`). DB script run on TEST 25 Oct: part 1 no-op (unique `IX_MaterialBarcode` on Serial
  exists), part 2 backfilled AssignedQty on 31,289 orders (assignment list in PRODUCTION: 9,866 -> 859 orders). Not run
  on LIVE. Notes: the original already limits assignment per stage (`assignProcess`), so AssignedQty mainly fixes the
  order list (`Qty > AssignedQty`); a deleted job card does not lower AssignedQty yet; 1,075 orders were assigned
  beyond their quantity in the past and now show it.
- **Phase 6: done, uncommitted.** Verified: 28/28 unit tests; forms parity 127/138, 0 different (baseline); on a
  throwaway server: headers present, DB name hidden, 3rd failed sign-in -> 429, bad JSON -> 400, sign-in page shows
  no CSP violations. SQL audit: every spliced value goes through `lib/sql.js` guards, the list search is
  parameterised; the one gap (stored dropdown value in `state.js`) is fixed. Not done: CSP enforce (needs a check of
  the screens behind sign-in in a browser: then `CSP=enforce`); 'User does not exist' vs 'Wrong password' still
  tells which user IDs exist (original wording; owner to decide).
- **Phase 7: done, uncommitted** (README, cleanup). Left as is: 3 unused shadcn primitives (separator, tabs,
  tooltip: Varun's kit, tree-shaken), functions exported but only used in their module.
- **Backend layout (25 Oct, uncommitted):** `server/src` moved to config / db / middleware / routes / controllers /
  services / repositories / data / shared (owner's tree; per-domain stubs left out: every screen runs through the forms
  engine). Pure moves and splits, no logic change: imports rewritten by script, tests + parity re-run.
- **Domain APIs (25 Oct, uncommitted; owner chose "one API per screen"):** screens move out of the generic engine one
  at a time: routes/<domain>/x.routes.js -> controllers -> services -> repositories, a validator, its own client page
  (features/<x>/). The service keeps the proven rules: it runs the screen's own handlers for option changes and
  saves through the forms writer, translating its JSON names to the control ids (one FIELDS map). Proof per screen:
  `forms-write-parity.mjs <bin> --api <route>` (original page vs the API: rows, lines, event log) + events parity.
  Done: **Production Order** (/api/production/orders; write parity IDENTICAL via API and via engine, events 15/15).
  **Production Assignment** (/api/production/assignments: new, changes/:field, print): Print replays the choices
  through the screen handlers on the server (services/forms/events.service.js runEvent/openForm) and refuses values the
  server did not offer; print-parity --api IDENTICAL, events 14/14; not yet checked in a browser.
  Next, in order: Rework Confirmation, WIP Capture, then the masters. Not yet checked in a
  browser (needs a sign-in). Known: order type 4 fails on TEST (no SRHeader table), as the original does.
- **Owner rule (25 Oct): Claude does not commit.** Leave changes in the working tree; the owner commits.
  `package-lock.json` has npm `peer` flag changes from an install: not part of this work.
- Open: push `401703e` and the uncommitted work; restart the API on :4000 (it runs pre-Phase-5 code); LIVE: run
  the SQL script after review (part 1 builds the index only if missing: outside production hours).

## 8. Known issues / gotchas

- ProcessOrderForm, ReWorkOrderForm, CEAT self-inspection were half-ported by another session; ProcessOrder/ReWorkOrder
  are now removed; **Self Inspection (/ceat/ceatinselfinspectionform) is kept but fails on this DB**
  ("Invalid column name 'Category'") and still needs finishing.
- Open DB observations: FOAMING self-inspection lots stay open; consumed components keep CurrentQty 1 (used =
  StorageCode -1); PO numbers step by 2 per save (matches original); PO82603052 is a parity leftover (TrackID 5).
- Test data left by the E2E run (intentional, for review): PO82603053/55/57, job cards JB226173248–250/252,
  test LED barcodes 99999900001–3 (ZZE2ELED000x), plans PlanOrderPrint 99999921/22.
- Queries on MaterialBarcode by Serial are slow (no index) — avoid ad-hoc scans; one ran 30+ min and slowed the server.
- Parity harness: events-parity output can exceed 256 MB for very large forms; heap needs `--max-old-space-size=8192`.
- Shell: the owner uses PowerShell (`Remove-Item a, b`, not `rm a b`). Git warns LF->CRLF; harmless.
- When this was written, a temporary API (:4000) and Vite (:5180) started by the agent were running for checks;
  they were stopped at handoff. Start your own with `npm run dev`.
