// A screen's REST calls, mounted per screen by masters/ (/api/masters/<name>) and quality/ (/api/quality/<name>).
// Each runs the screen's parity-tested code through ./resource.js.
//   GET    /                          list (?page=&column=&op=&value=, f.<name>= the page's own list choices)
//   GET    /search-fields             filterable columns; /search-fields/:column/values their values
//   GET    /layout                    what a page draws the screen from (as /api/forms/spec) + the API's names
//   GET    /new                       a blank record with its options; GET /:key a saved one; GET /:key/copy Copy
//   GET    /pickers/:field?search=    a search picker's rows
//   POST   /events/:event             an option change or button: { record, viewState, ui, arg, index } -> patch
//   POST   /  PUT /:key  DELETE /:key  save, update, cancel (status 200; DELETE body { remark, record? })
//   POST   /print                     the page's print with { record, printer }
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../middlewares/auth.js';
import { portedErrors } from '../../middlewares/errorHandler.js';
import { operatorMessages } from '../../middlewares/operatorMessages.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../shared/AppError.js';
import { created, ok } from '../../shared/http.js';
import { netString } from '../../shared/net.js';
import { clearSession, writeSession } from '../auth/sessions.js';
import { sessionContext as ctx } from '../auth/context.js';
import { screenResource } from './resource.js';
import { validateBody } from './resource.validation.js';

const keyOf = (req) => {
  const k = netString(req.params.key);
  if (!/^\d{1,18}$/.test(k)) throw AppError.notFound(`Record ${k}`);
  return k;
};
const found = (r, key) => {
  if (!r) throw AppError.notFound(`Record ${key}`);
  return r;
};
const search = (req) => (req.query.column ? { column: netString(req.query.column), op: netString(req.query.op), value: netString(req.query.value) } : null);
const filterOf = (req) => Object.fromEntries(Object.entries(req.query).filter(([k]) => k.startsWith('f.')).map(([k, v]) => [k.slice(2), netString(v)]));
/** a page that signs the user out (password changed) or sets the session's department */
const session = (req, res, r) => {
  if (r?.logout) clearSession(res);
  if (r?.session) writeSession(res, { ...req.session, ...r.session });
  const { session: _, ...rest } = r ?? {};
  return rest;
};

/** one screen's REST calls (see the list at the top) */
export function resourceRouter(route) {
  const m = screenResource(route);
  const body = validate(validateBody(m.FIELDS, m.NESTED));
  const router = Router();
  router.use(authorizeScreen(route));
  router.get('/', async (req, res) => ok(res, await m.list(ctx(req), { page: Math.max(0, Number(req.query.page) || 0), search: search(req), filter: filterOf(req) })));
  router.get('/search-fields', async (req, res) => ok(res, await m.searchFields(ctx(req))));
  router.get('/search-fields/:column/values', async (req, res) => ok(res, await m.columnValues(ctx(req), netString(req.params.column))));
  // Declared before /:key so these words are not read as keys.
  router.get('/layout', async (req, res) => ok(res, await m.layout(ctx(req))));
  router.get('/new', async (req, res) => ok(res, await m.blank(ctx(req))));
  router.get('/pickers/:field', async (req, res) => {
    ok(res, found(await m.picker(ctx(req), netString(req.params.field), req.query.search == null ? null : netString(req.query.search)), req.params.field));
  });
  router.post('/events/:event', body, async (req, res) => ok(res, session(req, res, await m.event(ctx(req), netString(req.params.event), req.valid.body))));
  router.post('/print', body, async (req, res) => ok(res, await m.printRecord(ctx(req), req.valid.body)));
  router.get('/:key', async (req, res) => ok(res, found(await m.get(ctx(req), keyOf(req)), req.params.key)));
  router.get('/:key/copy', async (req, res) => {
    if (!m.copy) throw AppError.notFound('Copy on this screen');
    ok(res, found(await m.copyOf(ctx(req), keyOf(req)), req.params.key));
  });
  router.post('/', body, async (req, res) => created(res, session(req, res, await m.create(ctx(req), req.valid.body))));
  router.put('/:key', body, async (req, res) => ok(res, found(await m.save(ctx(req), keyOf(req), req.valid.body), req.params.key)));
  router.delete('/:key', body, async (req, res) => {
    ok(res, found(await m.cancel(ctx(req), keyOf(req), req.valid.body.remark, req.valid.body), req.params.key));
  });
  return router;
}

/** { name: route } -> a router with each screen at /<name> (signed in; each screen checks the user's role) */
export function screensRouter(screens) {
  const router = Router();
  router.use(requireAuth, operatorMessages);
  for (const [name, route] of Object.entries(screens)) router.use(`/${name}`, resourceRouter(route));
  router.use(portedErrors);
  return router;
}
