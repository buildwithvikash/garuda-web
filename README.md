# Garuda Web

The Garuda WRL shop floor (production order → assignment → WIP capture → QC → FG label, plus its masters) rebuilt in
React + Node.js on the **existing** SQL Server database. Same tables, same writes as the original ASP.NET app: the
parity scripts prove it against the original DLLs.

- 47 screens (the keep-list in `server/src/data/menu/keep.js` drives both the menu and the API).
- Client: React 19, Vite 6, Tailwind 4, shadcn/ui (JavaScript). Layout: [`client/STRUCTURE.md`](client/STRUCTURE.md).
- Server: Express 5 + mssql. Status, history and decisions: [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Setup

Node.js 22+ (developed on 24). From this folder:

```bash
npm install
cp server/.env.example server/.env
```

Fill in `server/.env` (every setting is explained in [`server/.env.example`](server/.env.example)):

- `DB_*`: the database. Use the test copy `Garuda_WRL_TEST` for development and for every parity run.
- `PASSWORD_AES_KEY`: the original site's key (Web.config), or existing passwords will not work.
- `SESSION_SECRET`: any long random string.

## Run (development)

```bash
npm run dev
```

API on http://localhost:4000 (restarts on change), UI on http://localhost:5180 (proxies `/api` and `/GuideFiles`).

## Test

```bash
npm test
```

Unit tests: login rules, password encryption against the original `Avatar.dll`, .NET number formats, the keep-list,
operator messages and the sign-in throttle.

## Deploy (production)

```bash
npm install
npm run build        # client -> client/dist
npm start            # one Node process: API + built UI on PORT
```

Run it as a service, e.g. with pm2 (`pm2 start npm --name garuda -- start`, then `pm2 save`), or as a Windows service.

Settings to check on a server (`server/.env`):

| Setting | When |
|---|---|
| `NODE_ENV=production` | always |
| `COOKIE_SECURE=false` | while the plant serves plain HTTP (the cookie is HTTPS-only by default in production) |
| `TRUST_PROXY=1` | behind IIS / a reverse proxy, so sign-in limits see the real client address |
| `GUIDE_FILES_DIR` | the old site's `GuideFiles` folder (station guides) |
| `LOG_FILE` | a file for request / error lines (rotate it with the OS) |
| `CSP=enforce` | after checking the screens show no "Content Security Policy" lines in the browser console (default: report only) |

Database changes for a new site: review and run [`server/sql/migrations/2026-10-phase5-rule-fixes.sql`](server/sql/migrations/2026-10-phase5-rule-fixes.sql)
(Serial index only if missing, then the `PRODHeader.AssignedQty` backfill: preview first, the update is commented out).
On TEST both are done.

## Maintain

**Where things are**

```
server/src/
  server.js                entry point: database, Settings table, listen
  app.js                   the Express app: middleware, /api, guide files, the built UI
  config/                  env.js (every setting, from .env), database.js (pool options)
  db/                      connection.js (pool, query / scalar / execute), transaction.js
  middleware/              authenticate, authorize, request-log, security-headers, operator-messages, error-handler
  routes/                  index.js (/api), auth/auth.routes.js, forms/forms.routes.js: the wiring only
  controllers/             auth/, forms/: one function per request (read the request, call services, answer)
  services/
    auth/                  sign-in rules, change password
    menu/                  menu.json pruned to the keep-list, per-user role filter
    settings/              the Settings table
    forms/                 the screen engine: specs, state, lists, write (Save / Update / Delete), children, qc,
                           values, schema, pages.service.js (each screen's own code-behind)
    production/            WIP capture, production, labels (+ raw-print.ps1)
    quality/               final and self inspection, NCMR, repair / rework / finishing confirmation
  repositories/auth/       the sign-in queries
  data/                    forms/forms.json (screen specs), menu/menu.json + menu/keep.js (the 47 screens)
  shared/utils/            .NET-compatible conversions (net, format), sql guards, password, messages, throttle, log
  shared/session/          the signed session cookie
server/scripts/parity/     original vs new comparisons (see below)
server/sql/migrations/     database scripts (reviewed before running)
client/src/                see client/STRUCTURE.md
```

**Change a screen's look**: edit its page file `client/src/pages/<group>/<Page>.jsx` (one per sidebar tab).
**Change what a screen does**: its handlers are in `server/src/services/forms/pages.service.js` (search for the page's
`.aspx` name); keep the original's writes unless the change is intended, and run the parity scripts after.
**Add or remove a screen**: the route in `server/src/data/menu/keep.js`, then refresh `forms.json` from the
original site's source (in `server/`:
`node scripts/extract-forms.mjs ../../source/Garuda src/data/menu/menu.json src/data/forms/forms.json`), and
`npm run page -w client -- <route> "<Title>"` for its page file.
**Operator messages**: the wording rules are in `server/src/shared/utils/messages.js` (the original text is logged as
`[message] …`).
**Logs**: one line per API call (`<request id> <method> <path> <status> <ms> user=…`); an error shown to an operator
carries the same reference.

**SQL safety**: queries keep the original SQL text. Every value spliced into SQL goes through `shared/utils/sql.js`
(`num`, `digitsOrEmpty`, `requireDigits`, `lit`) or is passed as a parameter; keep it that way in new code.

## Parity checks (original vs new)

Each script runs the **original** compiled pages from `build/Publish WRL/bin` (through Windows PowerShell) and the
new code on the same inputs, then compares screens, database rows and printed labels. They write, so run them on
`Garuda_WRL_TEST` only; each puts its rows back. Run them one at a time (they share rows), from `server/`.
In Git Bash put `MSYS_NO_PATHCONV=1` in front, or `/route/` arguments are turned into Windows paths.

```bash
B="<path>/build/Publish WRL/bin"
node --max-old-space-size=8192 --env-file=.env scripts/parity/events-parity.mjs "$B"
node --max-old-space-size=8192 --env-file=.env scripts/parity/forms-parity.mjs "$B" /businesssetup/ /materialsetup/ /productionsetup/ /settings/ /authorization/ /production/ /quality/ /ceat/
node --env-file=.env scripts/parity/wip-parity.mjs "$B" comp      # also: qc, fg
node --env-file=.env scripts/parity/print-parity.mjs "$B"
node --env-file=.env scripts/parity/rework-new-parity.mjs "$B"
node --env-file=.env scripts/parity/production-writes-parity.mjs "$B"
node --env-file=.env scripts/parity/page-writes-parity.mjs "$B"
node --env-file=.env scripts/parity/upload-parity.mjs "$B"
node --env-file=.env scripts/parity/grid-db-parity.mjs "$B"
node --env-file=.env scripts/parity/login-parity.mjs "$B"
```

Baselines (25 Oct 2026): events 196/202 identical (5 fail alike, 1 harness limit: ParameterForm's duplicate
`ctl00`); forms 127/138 identical, 0 different; WIP comp/qc/fg, rework, production writes identical; print 9/10
identical, 1 failing alike. `PARITY_DEBUG=1` adds the harness line to original-side errors.

Intended differences from the original (owner's decisions, 21 Oct 2026): operator-friendly messages; no scans on a
production order on hold (11) or cancelled (200); the WIP QC remark is saved; `PRODHeader.AssignedQty` follows the
job cards.

## Known gaps

- WIP Capture: scan result 20 (multi-quantity stage output; no WRL line has one), stage type 7, and department
  ControlIndicator values other than 10000 are not ported; output printing for serial logic > 1 is not ported.
- Rework Confirmation New: confirming part of a quantity needs the ERP posting split, which is not ported.
- FG save for a material with SalesTax=1 (other plant) fails with a null reference, as in the original.
- Self Inspection (`/ceat/ceatinselfinspectionform`) fails on this database (a CEAT column / table WRL lacks), as the
  original does.
- Deleting a job card does not lower `PRODHeader.AssignedQty`.
