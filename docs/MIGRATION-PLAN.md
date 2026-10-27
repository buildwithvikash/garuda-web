# Backend migration plan: screens to REST APIs

Decision (owner, 26 Oct 2026): keep the current parity-tested Node backend; move the remaining engine screens to
APIs of their own in batches (masters, then quality, then production); every screen in a batch passes parity through
its API before the next batch starts. Functional inventory: [FUNCTIONAL-INVENTORY.md](FUNCTIONAL-INVENTORY.md).
API reference: [API.md](API.md).

## Approach

A screen's rules stay where parity proved them: its ported page code (`server/src/modules/forms/screens/...`) and the
forms writer. An API gives the screen REST calls and JSON field names on top:

- **Masters** (setup screens: list / record / save / update / cancel plus a few events) go through one shared adapter,
  `modules/forms/resource.js`, mounted per screen at `/api/masters/<name>` (`modules/masters/`). Field names come from
  the database columns the screen binds, so nothing is hand-mapped and nothing can be left out.
- **Quality** screens (batch 2) use the same adapter at `/api/quality/<name>` (`modules/quality/quality.routes.js`):
  their steps (scan `go`, QC panel `qc*`, approve `footerSave`, save) are the screen's events, so named calls per step
  would only re-map what the adapter already names, and every step stays under parity. The QC panel and approval
  footer travel as the screen's own structures.
- **Production** screens (batch 3) use the same adapter at `/api/production/<name>`
  (`modules/production/production.routes.js`), beside orders and assignments: their scans and buttons are the
  screen's events, run by the page code parity checks. WIP Capture's unit view is `GET /wip-capture/units/:label`.

The screen engine (`/api/forms`) stays mounted and unchanged until the client screens are switched over; both run the
same code, so either can serve a screen.

## Batches and their gate

| Batch | Screens | API | Gate (all through the API, `--api`) | Status |
|---|---|---|---|---|
| 0 | Production Order, Production Assignment | `/api/production/*` | forms-write, events, print | done (Oct 2026) |
| 1 | the 32 setup screens (Authorization, Business Setup, Material Setup, Production Setup, Settings) | `/api/masters/<name>` | forms-write (save / update / cancel), events, page-writes, print | done 26 Oct; see the parity report |
| 2 | Quality: Final Inspection, NCMR, Repair, Rework New, Finishing, Self Inspection | `/api/quality/<name>` | events, page-writes, rework-new | done 26 Oct; see the parity report |
| 3 | Production: WIP Capture, FG Scrap, RM Replacement, Model Transfer, Process Guide, Plan Upload, Image Display | `/api/production/<name>` | wip comp/qc/fg, production-writes, upload, print, events | done 26 Oct; see the parity report |

A batch is done when every screen's suites show the same result through the API as through the engine (identical,
or failing alike where the original fails on this database), the unit tests pass and the HTTP smoke test answers
401 / 403 / 404 / 422 as documented.

## What does not change without the owner's approval

- the database schema and data (the APIs read and write the same tables, through the same code);
- the client screens (they keep calling `/api/forms` until a switch-over is approved, screen by screen);
- the original .NET site and DLLs (untouched, used only by the parity scripts);
- LIVE: nothing runs against `Garuda_WRL` (LIVE); parity and development use `Garuda_WRL_TEST`.

## Cutover

1. A batch's APIs deploy with the server; they are additive (new routes), the engine keeps serving the screens.
2. With approval, a screen's page is switched to its API (client change), checked on TEST by an operator, then
   released.
3. When no page calls `/api/forms` for a screen, its engine routes may be retired (approval needed; the page code
   stays, the API uses it).

## Rollback

- Server: the APIs are new routes only; rolling back is redeploying the previous build (`git revert` of the batch,
  or the previous release folder). The engine routes were never removed, so screens keep working.
- Client: a switched page goes back to its engine version by reverting that page's commit.
- Database: no schema or data migration is part of a batch, so there is nothing to roll back there.
  (`db/migrations/2026-10-phase5-rule-fixes.sql` is separate and already documented.)
