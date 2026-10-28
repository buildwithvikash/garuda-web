# Garuda Web

The Garuda WRL shop floor (production order → assignment → WIP capture → QC → FG label, plus its masters) rebuilt in
React + Node.js on the **existing** SQL Server database. Same tables, same writes as the original ASP.NET app: the
parity scripts prove it against the original DLLs.

- 47 screens (the keep-list in `server/src/modules/menu/keep.js` drives both the menu and the API).
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

Database changes for a new site: review and run [`server/db/migrations/2026-10-phase5-rule-fixes.sql`](server/db/migrations/2026-10-phase5-rule-fixes.sql)
(Serial index only if missing, then the `PRODHeader.AssignedQty` backfill: preview first, the update is commented out).
On TEST both are done.

## Maintain

**Where things are**

```
server/
  src/
    server.js              entry point: database, Settings table, listen
    app.js                 the Express app: middlewares, every module's routes, guide files, the built UI
    config/                env.js (every setting, from .env), logger.js
    db/                    pool.js (query / scalar / execute), tx.js (transactions), options.js (dropdown items),
                           tables.js (rows as cell text)
    middlewares/           auth (sign-in, roles), validate, errorHandler, requestLog, securityHeaders,
                           operatorMessages
    modules/<feature>/     one folder per feature: <feature>.routes.js (the API, handlers inline),
                           <feature>.service.js, <feature>.repo.js (SQL), <feature>.validation.js
      auth/                sign-in, change password, /me; sessions (cookie), password crypto, sign-in throttle
      menu/                menu.json (from the original Layout.Master), keep.js (the 47 screens)
      settings/            the Settings table
      forms/               the screen engine (/api/forms) for every screen without an API of its own:
                           forms.json (specs), state, write (Save / Update / Delete), lists, events ...
        screens/           each screen's own code-behind, one file per screen, registered in registry.js
        resource.js        a screen as a REST resource with JSON field names; resource.routes.js its calls,
                           resource.validation.js its body check (used by masters/, quality/, production/)
      production/          WIP capture, production and label logic the screens share (ported Avatar.dll);
                           production.routes.js: /api/production/<name> for the 7 shop-floor screens
      quality/             final / self inspection, NCMR, repair / rework / finishing confirmation;
                           quality.routes.js: /api/quality/<name> for those 6 screens (see docs/API.md)
      production-orders/   /api/production/orders
      production-assignments/  /api/production/assignments
      masters/             /api/masters/<name>: the 32 setup screens (see docs/API.md)
    shared/                AppError, http (ok / created), sql guards, .NET conversions (net, format, values),
                           operator messages, validate rules
  db/migrations/           database scripts (reviewed before running)
  scripts/                 extract-forms / extract-menu, docs-inventory / docs-api (regenerate docs/FUNCTIONAL-INVENTORY.md
                           and docs/API.md from the code), parity/ (original vs new comparisons, see below)
  tests/                   unit tests (npm test)
client/src/                see client/STRUCTURE.md
```

**Change a screen's look**: its page is three files (one set per sidebar tab): `client/src/pages/<group>/<Page>.jsx`
(settings, e.g. the form's layout, and switching list / form), `<Page>/List.jsx` (the saved records) and
`<Page>/Form.jsx` (create / update). `node client/scripts/split-page.mjs <file>` splits a one-file page the same way.
**Change what a screen does**: its handlers are in `server/src/modules/forms/screens/<folder>/<screen>.js` (a screen
with its own API also has a `server/src/modules/<feature>/` folder); keep
the original's writes unless the change is intended, and run the parity scripts after.
**Add or remove a screen**: the route in `server/src/modules/menu/keep.js`, then refresh `forms.json` from the
original site's source (in `server/`:
`node scripts/extract-forms.js ../../source/Garuda src/modules/menu/menu.json src/modules/forms/forms.json`), and
`npm run page -w client -- <route> "<Title>"` for its page file.
**Operator messages**: the wording rules are in `server/src/shared/messages.js` (the original text is logged as
`[message] …`).
**Logs**: one line per API call (`<request id> <method> <path> <status> <ms> user=…`); an error shown to an operator
carries the same reference.

**SQL safety**: queries keep the original SQL text. Every value spliced into SQL goes through `shared/sql.js`
(`num`, `digitsOrEmpty`, `requireDigits`, `lit`) or is passed as a parameter; keep it that way in new code.

## Parity checks (original vs new)

Development tools, not part of the running app (nothing deploys `scripts/`): they prove a change keeps what the
original does. Needed while screens are still being reworked; they can go once that is finished.

Each script runs the **original** compiled pages from `build/Publish WRL/bin` (through Windows PowerShell) and the
new code on the same inputs, then compares screens, database rows and printed labels. They write, so run them on
`Garuda_WRL_TEST` only; each puts its rows back. Run them one at a time (they share rows), from `server/`.
In Git Bash put `MSYS_NO_PATHCONV=1` in front, or `/route/` arguments are turned into Windows paths.

```bash
B="<path>/build/Publish WRL/bin"
node --max-old-space-size=8192 --env-file=.env scripts/parity/events-parity.js "$B"
node --max-old-space-size=8192 --env-file=.env scripts/parity/forms-parity.js "$B" /businesssetup/ /materialsetup/ /productionsetup/ /settings/ /authorization/ /production/ /quality/ /ceat/
node --env-file=.env scripts/parity/wip-parity.js "$B" comp      # also: qc, fg
node --env-file=.env scripts/parity/print-parity.js "$B"
node --env-file=.env scripts/parity/rework-new-parity.js "$B"
node --env-file=.env scripts/parity/production-writes-parity.js "$B"
node --env-file=.env scripts/parity/page-writes-parity.js "$B"
node --env-file=.env scripts/parity/upload-parity.js "$B"
node --env-file=.env scripts/parity/grid-db-parity.js "$B"
node --env-file=.env scripts/parity/login-parity.js "$B"
node --env-file=.env scripts/parity/client-switch-parity.js   # the API forms vs the engine forms; read only
```

`--api` (forms-write, events, page-writes, print) runs the new side through the screens' REST APIs (Production
Order / Assignment, `/api/masters`, `/api/quality`, `/api/production/<screen>`; also rework-new, wip, production-writes,
upload) instead of the page code directly; the results must match the run without it.

Baselines (26 Oct 2026): events 188/202 identical (5 fail alike, 1 harness limit: ParameterForm's duplicate
`ctl00`, 8 intended: Production Order's material lists show the name only, not "Name - Alias"); forms 127/138 identical, 0 different; WIP comp/qc/fg, rework, production writes identical; print 9/10
identical, 1 failing alike. `PARITY_DEBUG=1` adds the harness line to original-side errors.

Intended differences from the original (owner's decisions, 21 and 26 Oct 2026): operator-friendly messages;
Production Order's material lists show the material name only; no scans on a
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
