# Garuda Web: audit and improvement plan

Status: audit done 21 Oct 2026, plan awaiting approval. Baseline: commit `b075850` (tag `backup-before-redesign`)
plus the uncommitted shop-floor keep-list (47 screens).

## 1. How the application works today

```
browser (React 19, Vite, Tailwind 4)
  AppLayout ── menu from /api/auth/me (menu.json, filtered by UserRoleForm + keep-list)
  NotMigrated ── picks a renderer by route:
      EngineForm.jsx (791 lines) draws EVERY screen from a control list
        └ controls = ASP.NET markup converted to JSON (forms.json, 2.6 MB, ~1,000 original screens)
        └ every button/dropdown change -> POST /api/forms/event {values, viewState, ui}
server (Express 5, mssql)
  forms/routes.js ── /spec /list /record /event /save /update /cancel /print
  forms/state.js, write.js, lists.js, children.js ── the generic "engine": Tag strings -> SQL
  forms/pages.js (5,027 lines) ── per-screen code ported line by line from the .aspx.cs files:
        PAGE_EVENTS[file][control] handlers that receive the posted page and return control patches
  forms/wip.js, production.js, quality.js, qc.js, labels.js, planning.js ── ported Avatar.dll business logic
  db/index.js ── pool, query/scalar/execute/transaction
database: SQL Server Garuda_WRL (schema unchanged)
verification: scripts/parity/* run the original DLLs through PowerShell and compare screens, DB rows and label bytes
```

Data flow for a shop-floor scan: WIPCapture field -> `/forms/event` (all field values, ViewState, visibility of
every control) -> `PAGE_EVENTS[WIP].BtnWorderScan` -> `wip.scanStageLabelNew` (SQL strings) -> patch of control
states back to the client, which re-renders the generated form.

## 2. What the audit found

### Architecture (the main issue)
| # | Finding | Effect |
|---|---|---|
| A1 | The UI is generated from ASP.NET markup. Screens keep the original panel layout, control IDs (`DDLProdOrder`, `TBJobCoard`), hidden panels toggled by events, and a server round trip per field change. | Every screen looks and behaves like a 2012 WebForms page; operator screens cannot be designed for scanning. |
| A2 | Server-side page code emulates WebForms: ViewState, `Visible`/`Enabled` per control, `SelectedIndexChanged` handlers, original exception texts ("Object reference not set…"). | Hard to read and change; business rules are mixed with screen state. Two of the four E2E bugs came from this emulation (ViewState lost on load, dropdown items not posted). |
| A3 | `pages.js` is one 5,027-line file for ~40 screens; helper functions are duplicated (`num` in 3 files, `digitsOrEmpty`, `lit`, `select`, `guard`). | Merge conflicts, hard to find code, copy drift. |
| A4 | `forms.json` holds specs for ~1,000 original screens; 47 are used. | 2.6 MB parsed at start, noise when searching. |
| A5 | Business logic (wip.js, production.js, quality.js) is reasonably separated and parity-proven, but builds SQL as strings guarded by validators, mirroring the original. | Correct and safe against injection where guarded, but not parameterised; any unguarded future edit is a risk. |

### Bugs and gaps (confirmed)
| # | Item | Source |
|---|---|---|
| B1 | Order on Hold / Cancelled can still be scanned on the floor. | original behaviour |
| B2 | Inspector remark on WIP QC is never saved. | original behaviour |
| B3 | Raw technical messages shown to operators ("There is no row at position 0", "Pending Process- " with no name, "Object reference not set…"). | original behaviour |
| B4 | `PRODHeader.AssignedQty` never maintained: assignment dropdown lists 9,867 orders. | original behaviour |
| B5 | FOAMING self-inspection lots stay open; Self Inspection screen fails on this DB ("Invalid column name 'Category'"). | port incomplete |
| B6 | `npm run dev` uses `a & b`, which runs sequentially on Windows (cmd), so only the server starts. | tooling |
| B7 | Spelling in user messages ("Succefully", "Departmet", "Paramaters"). | original behaviour |
| B8 | ProcessOrderForm / ReWorkOrder / CEAT pages: half-ported by a session that stopped; now hidden by the keep-list. | port incomplete |

Fixed already in the E2E run: stage completion key bug, WIPCapture ViewState on load, dropdown items not posted
(defect add, assignment reset), single-table key double-generation.

### Security and reliability
| # | Finding | Severity |
|---|---|---|
| S1 | SQL by string concatenation with validators (`num`, `digitsOrEmpty`, `lit`). No injection found in the audit sample, but safety depends on every call site. | Medium |
| S2 | `lit()` builds `'...'` without the `N` prefix: non-ASCII text (remarks, names) can be mangled. | Low |
| S3 | Session: signed cookie, httpOnly, sameSite lax; `secure` only when NODE_ENV=production; no rate limit on `/api/auth/login`; no security headers. | Medium |
| S4 | Passwords: stored with the original reversible scheme (needed for compatibility with the old site while both run). | Known constraint |
| S5 | Errors: generic message to users, details to console only; no request IDs, no structured log file. | Low |
| S6 | `/api/forms` accepts 100 MB JSON bodies (guide uploads). | Low |

### Performance
| # | Finding |
|---|---|
| P1 | Several lookups scan `MaterialBarcode` by `Serial` (no index): seconds per query on the test DB; a 30-min ad-hoc query slowed the whole server. |
| P2 | WIP scan posts the full page (all controls, visibility, refilled lists) on every event; large lists (9,867 orders) travel back and forth. |
| P3 | `forms.json` (2.6 MB) parsed at start; `newFormState` re-runs list queries for fallbacks. |

### Tests
27 unit tests (login, formatting, passwords, report engine). Functional safety comes from the parity scripts, which need
the original DLLs and the test DB. No automated test runs the new API alone.

## 3. Proposed plan (incremental, each phase shippable and verified)

**Guiding rule:** keep the parity-proven business logic (the code that writes production records) and change what sits
around it. Each phase ends with a build, unit tests, the parity suites that cover it, and a browser check.

| Phase | What changes | Verification |
|---|---|---|
| 0 Baseline | Commit the keep-list; fix `npm run dev` for Windows; add a smoke test that boots the API. | build, tests |
| 1 Structure & dead code | Split `pages.js` into one file per screen under `forms/screens/`; one shared `sql.js` (num/lit/digits, with `N''`); trim `forms.json` to the kept screens; move reports/dashboards/unused screens out (they stay in git history and the backup). | events + forms + WIP + print parity unchanged |
| 2 Design system | Tokens (colour, type, spacing, status colours), components: Button, Field, Select, Table (virtualised, sticky header, search), Dialog, Toast, StatusBadge, EmptyState, PageHeader; new AppLayout (collapsible sidebar, favourites, quick "Scan" entry, user/line/department header). | browser at 1366×768 and 1920×1080, keyboard, dark/light |
| 3 Generic screens restyled | EngineForm rebuilt on the design system: sectioned layout, inline validation, dirty-state guard, confirmation for delete/cancel, faster lists (server paging, column search). All 40 master screens benefit at once. | forms parity, browser pass over every master |
| 4 Shop-floor screens rebuilt | Dedicated React screens + clean JSON APIs for Production Order, Production Assignment, WIP Capture (station/scan-first, big status banner, sound/colour feedback, route progress, component checklist, QC panel), Rework Confirmation, FG label. They call the same business functions (wip.js etc.), so DB writes stay identical. | write parity per action (rowset), full E2E flow in the browser, label bytes |
| 5 Messages & rules | Operator-friendly messages (map of original texts -> clear text + code); fix B1–B4 and B7 as agreed. | targeted tests + E2E |
| 6 Security & performance | Parameterise remaining spliced SQL through one helper; login rate limit, security headers, secure cookie by config, request IDs + log file; index proposal for `MaterialBarcode.Serial` (DB change: needs your approval). | tests, load check with realistic volumes |
| 7 Final pass | Remove obsolete files/dependencies, update README (run/deploy/maintain), final report. | full regression + E2E |

## 4. Decisions (agreed 21 Oct 2026)

1. Shop-floor screens: **rebuild** as dedicated screens + clean APIs; equivalence proven at database/label level.
2. Messages: **clear operator messages**; original text goes to the server log.
3. Rule fixes: **all four**: block scans on Hold/Cancelled orders (B1), save QC remark (B2), maintain AssignedQty (B4),
   add a non-destructive index on `MaterialBarcode(Serial)` (P1; script shown before it runs).
4. Hidden screens, reports, dashboards: **removed from the codebase** in Phase 1 (recoverable from tag
   `backup-before-redesign` and `garuda-web-backup-2026-10-21`).

## 5. Decisions as originally asked

1. **Parity vs. idiomatic code for shop-floor screens.** Rebuilding the 5 flow screens (Phase 4) means they no longer
   mimic the original page-for-page; equivalence is then proven at the database level (same writes, same labels),
   not screen by screen.
2. **Original messages.** Keep exact original texts (parity) or replace with operator-friendly ones (B3, B7).
3. **Business-rule changes** B1 (block scans on Hold/Cancelled), B2 (save QC remark), B4 (maintain AssignedQty):
   each changes behaviour versus the original site, which may still be running in parallel.
4. **Hidden code.** Move reports, dashboards and the ~40 hidden screens out of the codebase in Phase 1 (recoverable from
   git and the backup), or keep them in place.
5. **Database index** on `MaterialBarcode(Serial)` (non-destructive, improves scan speed).
