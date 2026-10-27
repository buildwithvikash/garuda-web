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
| \`GET /?page=&column=&op=&value=\` (\`f.<name>=\` a page's own list choices) | a page of records (10) |
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
  const m = screenResource(r);
  md.push(`### ${FORMS[r].title} — \`/api/${base}/${n}\``, '');
  md.push(`Original: \`${FORMS[r].file}\`. Fields: ${Object.keys(m.FIELDS).map((f) => `\`${f}\``).join(', ')}.`);
  if (Object.keys(m.EVENTS).length) md.push('', `Events: ${Object.keys(m.EVENTS).map((f) => `\`${f}\``).join(', ')}.`);
  if (m.print) md.push('', 'Print: yes.');
  md.push('');
}
md.push('WIP Capture also has `GET /api/production/wip-capture/units/:label`: route and cabinet details of the scanned unit (`{ route, cabinet }`, each null when its lookup fails).', '');
md.push('## Screen engine — /api/forms', '', 'Every screen above also still answers through the screen engine (`spec`, `list`, `record`, `event`, `save`, `update`, `cancel`, `print`, `combo`, `unit`, `distinct`, `copy`, keyed by `?path=<route>`), which the client pages use today. Both run the same page code; a page moves to its API when that switch is approved.', '');
writeFileSync(out, md.join('\n'));
process.exit(0);
