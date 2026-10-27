# Plan: switch the client pages to their REST APIs (masters first)

Status: approved 26 Oct 2026. Built: `GET /layout`, full `ui` in record answers, DELETE with the form,
`client/src/lib/screenApi.js` + `screenApiCore.js` (also used by the parity runs), the form check
(`server/scripts/parity/client-switch-parity.js`). Switched: Unit Of Measure (checked by the owner 26 Oct), Variant
Field (waiting for the browser check). `GenericPage.jsx` calls the server through `screenApi.js` too (the engine for
the screens not switched, the same requests as before).

## How the pages work today

- 10 screens have a page file (`client/src/pages/<group>/<Page>.jsx`). Nine of them are copies of the generic page
  (about 620 lines each) with small changes; WIP Capture is its own (1,084 lines). The other 37 screens draw with
  `pages/system/GenericPage.jsx`.
- Every page draws the form from the **control list** that `/api/forms/spec` sends (control types, captions, panels,
  required / max length, grid columns, the role tree), and talks to the engine with control IDs:
  `spec`, `list`, `distinct`, `record`, `copy`, `event`, `save`, `update`, `cancel`, `print`, `combo`.
- The masters' API (`/api/masters/<name>`) sends and takes **data by field name** (`record`, `options`, `ui`). It does
  not send the layout. So a page cannot switch by changing URLs only.

## Approach (recommended): same pages, new transport

The pages keep drawing exactly as they do. One client module, `client/src/lib/screenApi.js`, does what the pages ask
of `/api/forms` through the screen's API instead, and turns the answers back into what the pages already expect:

| The page asks for | Today | After the switch |
|---|---|---|
| layout + blank form | `GET /forms/spec` | `GET /api/masters/<name>/layout` (new; the same control list) + `GET /new` |
| a record / Copy | `GET /forms/record`, `/forms/copy` | `GET /:key`, `GET /:key/copy`, laid over the layout |
| list, filters | `GET /forms/list`, `/forms/distinct` | `GET /`, `GET /search-fields/:column/values` |
| option change / button / grid row | `POST /forms/event` `{ control, values }` | `POST /events/:event` `{ record }`; the answer back into control patches |
| save / update / delete | `POST /forms/save` ... | `POST /`, `PUT /:key`, `DELETE /:key`; a 400 refusal back into `{ ok: false, message, alert }` |
| print, search picker | `POST /forms/print`, `GET /forms/combo` | `POST /print`, `GET /pickers/:field` |

The translation is the one `server/scripts/parity/api.js` already does for every parity run (control IDs <-> field
names, answers back into patches), so it is proven on all 47 screens' events and writes.

Backend changes this needs (additive, no change to existing calls):
1. `GET /<name>/layout`: the control list and buttons `/forms/spec` sends today, from the screen's API module.
2. `controls` (field -> control ID) and `events` (event name -> control ID) in the `/new` answer, so the client does
   not re-derive the names.

Each page file and `GenericPage.jsx` then change only their `api('/forms/...')` calls to `screenApi(...)` calls. No
markup, style or behaviour change.

**Alternative (not recommended now):** rebuild each master as a page of its own on the JSON API, as Production Order
and Assignment were. That is a UI redesign per screen, about 30 new pages, each needing its own approval and
check. It can still be done later, screen by screen, on top of the switched transport.

## Rollout: one screen at a time

A list in the client, `API_SCREENS` (routes that use their API), decides which transport a page uses. A screen
switches by adding its route; it switches back by removing it. Order, simplest first:

1. **Declarative masters (12):** Unit Of Measure, Variant Field, Variant Value, Ledger, Production Line, Production
   Process, Defect Code, Identification Tag Design, Barcode Printer, Rework Resolution, Root Cause, Scrap Reasons.
2. **Masters with child lists (4):** Business Unit, Department, Work Center (check list), User Role (role tree).
3. **Masters with page events (12):** Users, Material Category, Material, Model, Serial Logic, BOM, Routing,
   Routing Guide (file upload), Check List, Value List, Shift, Material Barcode (print).
4. **Special (4):** Change Password, Reset Password (sign-out after the change), Company (single row), Employee
   (print).

Then quality (6) and production (7) the same way, after the masters are in use.

## Gate for each screen

1. **Form check (automatic, new script `scripts/parity/client-switch-parity.js`):** for the blank form and sample
   records of the screen, the form the page would draw through the API (layout + API answer, through `screenApi.js`)
   must equal the form `/forms/spec` / `/forms/record` give today, for every property the page reads (value, items,
   visible, enabled, read-only, text, grid rows, tree nodes). Events and writes are already covered by the `--api`
   parity runs.
2. **Browser check (owner or operator, on TEST):** open the screen, list, open a record, change an option, save,
   update, delete; it looks and behaves as before.
3. Only then is the next screen added to `API_SCREENS`.

## What does not change

The look and behaviour of every page; `/api/forms` (it stays for any screen not switched, and as the way back); the
database; the original .NET site. Nothing is committed by me; you commit each step.

## Rollback

Per screen: remove its route from `API_SCREENS` (the page goes back to `/api/forms` at once). All of it: revert the
client commit. The backend additions are new calls only.

## Effort

Backend additions and `screenApi.js`: small. The form-check script: medium (reuses the parity helpers). Each page's
call swap: a few lines. The browser checks are the main cost: about 32 masters, a few minutes each.
