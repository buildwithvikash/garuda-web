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
server/src
  index.js                 express app: /api/auth, /api/forms, static client, error handler
  modules/menu/keep.js     THE keep-list of 47 screens (forms routes + menu read it)
  modules/menu/service.js  menu.json pruned to keep-list, per-user role filter
  modules/forms/forms.json specs of the 47 kept screens (scripts/extract-forms.mjs regenerates, filtered by KEEP)
  modules/forms/routes.js  /spec /list /record /event /save /update /cancel /print
  modules/forms/pages.js   per-screen ported code-behind (PAGE_EVENTS[file][control], PAGE_LOAD, PAGE_SAVE...) ~3,600 lines
  modules/forms/wip.js, production.js, quality.js, qc.js, labels.js   ported Avatar.dll business logic (DB writes, labels)
  modules/forms/write.js   generic DataWrapper insert/update/cancel; state.js, lists.js, children.js: generic engine
  lib/sql.js               the ONLY SQL splice guards: num, digitsOrEmpty, requireDigits, lit
  lib/net.js, lib/format.js  .NET-compatible parsing/formatting; db/index.js pool/query/transaction
server/scripts/parity      original-vs-new harness (PowerShell runs the original DLLs; compares screens, DB rows, labels)
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

E2E test (21 Oct, browser, test DB): freezer F390GL24 (22600118), route 12502 (17 stations) from order PO82603053 to
FG label; rework, hold/cancel, ~47 scenarios. Report: https://claude.ai/artifact/A3Ddeh4NKpLysYmtfPUaQS (private to
the owner). Bugs fixed then: write.js key check (stage completion), WIPCapture ViewState on first load, dropdown items
not posted (defect add / assignment reset), first-table key set on row (no double key).

## 5. In progress right now (UNCOMMITTED, Phase 1)

Working-tree changes not yet committed:
- `forms.json` trimmed 335 -> 47 specs (2.6 MB -> 375 KB); `extract-forms.mjs` filters by KEEP.
- `forms/routes.js`: `FORMS` = specs ∩ KEEP (PORTED/ENABLED/NOT_USED lists removed).
- `pages.js`: 12 hidden screens' sections removed (work-centre availability/tax, monthly/daily/planning order/machine
  availability/process-order plan, area cleaning, workstation utilisation, scrap posting, ProcessOrder, ReWorkOrder,
  ProductionCapture); `PAGE_CANCEL`/`PAGE_UPDATE`/`p2` moved to the shared part; orphan imports removed.
- `planning.js` deleted; unused exports removed (production.js validateJobcard/processActivityWithoutRouting,
  qc.js qcChecked, write.js remove).
- New `lib/sql.js`; duplicated `num`/`lit`/`digitsOrEmpty`/`requireDigits` removed from production/quality/labels/pages.
- Parity scripts pruned to kept screens (events/forms/print/grid-db/page-writes/production-writes/upload);
  `order-writes-parity.mjs` deleted.

Verified so far: `node --check` all files, 23/23 unit tests, a dead-code scan (no unused imports/declarations left).
**Regression still running when this was written** (background, output in the agent's temp dir; just rerun it):

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
Expected baselines before Phase 1: events 294/300 identical (5 fail alike, 1 known ParameterForm harness limit);
forms ~206/231 (rest timestamps / fail alike); WIP comp/qc/fg identical; print 9/10 (1 fails alike); rework 2/2.
Run suites ONE AT A TIME (they share rows). wip/print parity start their own listener on 127.0.0.1:9100.
**Next step: check results; if equal to baseline, commit Phase 1** ("Phase 1: trim specs and page code to the
shop-floor scope; one SQL guard module").

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

- **Phase 2 design system (next):** tokens in `client/src/index.css` (@theme): steel-blue primary, status colours
  (ok green, hold amber, rejected red, info blue, rework violet), system font stack (plant PCs may be offline),
  ≥40px targets, tabular numbers. Components in `client/src/ui/`: Button, Field/Input/Select/Textarea, Card,
  PageHeader, Badge/StatusBadge, Banner, Toast (provider+hook), ConfirmDialog (native <dialog>), Spinner/Skeleton,
  EmptyState, Table, Icon (inline SVG, no new dependency). New AppLayout (grouped sidebar with icons, collapsible,
  Ctrl+K menu search, user/line/department chip, logout/change password), Home page with big shop-floor tiles,
  restyled Login/ChangePassword. Two menu groups are both captioned "Production" (setup vs floor): rename the setup
  one to "Production Setup".
- **Phase 3:** rebuild EngineForm on the design system (sections, inline validation, dirty-state guard, confirm
  delete, server-paged lists); split remaining master-screen code out of pages.js into `forms/screens/*.js`.
- **Phase 4:** dedicated flow screens + APIs (scan-first WIP Capture: station -> serial, big status banner, sound/
  colour feedback, route progress, component checklist, QC panel with checklist/defects, FG serial/asset/printer).
- **Phase 5:** messages + rule fixes (§6). **Phase 6:** parameterise remaining spliced SQL, login rate limit,
  security headers, secure cookie by config, request IDs + log file, Serial index. **Phase 7:** cleanup, README
  (run/deploy/maintain), final report (old vs new structure, fixes, tests, remaining issues).

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
