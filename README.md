# Garuda Web

React + Node.js + Tailwind rebuild of Garuda, running against the **existing** SQL Server database.
Migration plan and progress: [`../docs/MIGRATION_PLAN.md`](../docs/MIGRATION_PLAN.md).

## Setup

Requires Node.js 22+ (developed on 24).

```bash
npm install
cp server/.env.example server/.env   # then fill in DB_*, PASSWORD_AES_KEY, SESSION_SECRET
```

- `PASSWORD_AES_KEY` must be the key the existing app uses in `WrapperAvatar.encrypt`, or no one can log in
  when `Settings.PasswordEncrypt = 1`.
- Point `DB_*` at the **UAT** database while modules are being migrated and parity-tested.

## Run

```bash
npm run dev -w server      # API on http://localhost:4000
npm run dev -w client      # UI on http://localhost:5180 (proxies /api to 4000)
```

Production: `npm run build`, then `npm start` serves the API and the built UI from one Node process.

## Test

```bash
npm test
```

Checks login rules against the original `AVLogin` behaviour and password encryption against values produced
by the original `Avatar.dll`.

## Layout

```
server/src/
  config.js            env settings
  db/                  mssql pool, parameterized query/scalar/execute/transaction
  lib/                 .NET-compatible conversions, password crypto, signed session cookie
  middleware/auth.js   requireAuth (logged in) + authorize(ModuleID) (role check)
  modules/<name>/      routes · service · repo per module
  modules/menu/menu.json  menu tree generated from the original Layout.Master (npm run extract-menu -w server)
client/src/
  layouts/AppLayout.jsx   header, role-filtered menu, menu search
  pages/                  one screen per original page
```

## Parity checks (original vs new, read-only on UAT)

Each script runs the **original** compiled code from `build/Publish WRL/bin` (via Windows PowerShell) and the new code
on the same inputs, then compares results:

```bash
node --env-file=.env scripts/parity/login-parity.mjs "<path>/build/Publish WRL/bin"
node --env-file=.env scripts/parity/dashboards-parity.mjs "<path>/build/Publish WRL/bin"
node --max-old-space-size=8192 --env-file=.env scripts/parity/reports-parity.mjs "<path>/build/Publish WRL/bin"
node --max-old-space-size=8192 --env-file=.env scripts/parity/wrlreports-parity.mjs "<path>/build/Publish WRL/bin"
```

(run from `server/`; `PARITY_SHIFT='{...}'` replays a past shift for dashboards).

Form scripts (they write, so run them on the test copy `Garuda_WRL_TEST` only; each puts its rows back):
`forms-parity.mjs`, `events-parity.mjs [route ...]`, `print-parity.mjs`, `wip-parity.mjs <bin> comp|qc|fg`,
`rework-new-parity.mjs`, `order-writes-parity.mjs` (ProcessOrder / ReWorkOrder / CEAT self inspection saves).
`PARITY_DEBUG=1` adds the harness line to original-side errors. Don't run two at once: they share rows.

Known gaps (the port raises a clear error, or the original's own behaviour is kept):
- WIPCapture: scan result 20 (multi-qty stage-1 output; no WRL line has one), stage type 7, and department
  ControlIndicator values other than 10000 are not ported. Output printing for serial logic > 1 is not ported.
- ReworkConfirmationNew: confirming part of a quantity needs the ERP posting split, which is not ported.
- FG save for a material with SalesTax=1 (other plant) fails with a null reference, as in the original (the Sanjan
  connection string is commented out in Web.config).
- ProcessOrderForm / ReWorkOrderForm display(key): a failure while choosing the record's department, order or
  material stops the display with its alert (the original showed the half-filled form with the alert). For
  ProcessOrderForm that is the usual case: an order already fully assigned is not in the order list.
  ProcessOrderForm's SATO save (SavePharma) is not ported; the yellow marking of BOM-only materials is not shown.
  WRL has no process-card label template (MaterialTag type 10), so its print sends an empty job, as the original.
- ReWorkOrderForm: WRL has no rework routing (RoutingHeader Type 2), so btnCreate stops at "Select a Routing" and
  nothing can be saved, as in the original.
- CEATINSelfInspectionForm: Go ends with an "Invalid object name SCADACuringDetails" alert (a CEAT table WRL does not
  have), after filling the form, as in the original. Delete is not ported (the form is cleared after a save, so there
  is no record to delete).
- events-parity ParameterForm "add, select, delete" case: the harness fails on the original side (duplicate `ctl00`);
  a harness limit, not a port difference.

## Reports

- Generic reports (`ReportControl` pages) are data: regenerate `reports.json` with `npm run extract-reports -w server`.
- `MAX_REPORT_ROWS` (default 100000) caps a report result; larger results ask the user to narrow the filters.

## Adding a migrated screen

1. Server: `server/src/modules/<module>/{repo,service,routes}.js`; mount in `src/index.js` with
   `requireAuth, authorize(<ModuleID from menu.json>)`.
2. Client: page under `client/src/pages/<module>/`, route in `client/src/main.jsx` at the path the menu uses
   (original `View/X/Y.aspx` → `/x/y`).
3. Parity-check against the existing page on UAT, then update the record in the migration plan.
