// /api/forms: the screen engine (spec, list, record, events, save / update / delete, print, pickers) for every screen
// without an API of its own: TitleControl + TopPanel pages, their events run by the pages' own code (./screens).
import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { operatorMessages } from '../../middlewares/operatorMessages.js';
import { clearSession, writeSession, sessionContext } from '../auth/sessions.js';
import { log } from '../../config/logger.js';
import { canOpen, userMenu } from '../menu/menu.service.js';
import { netString } from '../../shared/net.js';
import { displayState, copyState, engineControls } from './state.js';
import { comboRows } from './children.js';
import { PAGE_EVENTS, PAGE_POSTBACK, PAGE_LIST_TAG, PAGE_SAVE, PAGE_UPDATE, PAGE_CANCEL, PAGE_PRINT, CUSTOM_DISPLAY, eventHelpers } from './pages.js';
import { cabinetByLabel, routeByLabel } from '../production/wip.service.js';
import { listPage, distinctValues } from './lists.js';
import { collect, insert, update, cancel } from './write.js';
import { FORMS } from './specs.js';
import { specPayload } from './resource.js';
import { SCREEN as PRODUCTION_ORDER } from '../production-orders/production-orders.service.js';

/** Screens switched to an API of their own: the engine no longer serves them (none of its routes), so their rules
 *  (Production Order: no change or cancel after create, one business unit's orders only) cannot be gone around. */
const MOVED = { [PRODUCTION_ORDER]: '/api/production/orders' };

async function load(req, res) {
  const path = netString(req.query.path ?? req.body?.path).toLowerCase();
  if (MOVED[path]) return void res.status(410).json({ message: `This screen is served by ${MOVED[path]}.` });
  const spec = FORMS[path];
  if (!spec) return void res.status(404).json({ message: 'Form not found' });
  const ok = spec.menuModuleId == null ? (await userMenu(req.session.userCode)).systemUser : await canOpen(req.session.userCode, spec.menuModuleId);
  if (!ok) return void res.status(403).json({ message: 'You do not have access to this screen' });
  return spec;
}
const ctxOf = sessionContext;
const publicState = (s) => ({ title: s.title, controls: s.controls, viewState: s.viewState ?? {}, recordStatus: s.recordStatus ?? null, statusMessage: s.statusMessage ?? null, buttons: s.buttons });

// errors go out as { message } (reworded by the middleware above)
const fail = (res, e) => res.status(400).json({ message: e.message });

async function getSpec(req, res) {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    res.json(await specPayload(spec, ctxOf(req)));
  } catch (e) {
    fail(res, e);
  }
}

async function getList(req, res) {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const search = req.query.column ? { column: netString(req.query.column), op: netString(req.query.op), value: netString(req.query.value) } : null;
    // a page whose code rewrites the list's Tag (from the form's choices, sent back as f.<name>)
    const filter = Object.fromEntries(Object.entries(req.query).filter(([k]) => k.startsWith('f.')).map(([k, v]) => [k.slice(2), netString(v)]));
    const tag = PAGE_LIST_TAG[spec.file]?.(filter, ctxOf(req));
    res.json(await listPage(tag ? { ...spec, view: { ...spec.view, tag } } : spec, ctxOf(req), Math.max(0, Number(req.query.page) || 0), search));
  } catch (e) {
    fail(res, e);
  }
}

async function getDistinct(req, res) {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    res.json((await distinctValues(spec, ctxOf(req), netString(req.query.column))).map((v) => netString(v)));
  } catch (e) {
    fail(res, e);
  }
}

async function getRecord(req, res) {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const s = await displayState(spec, ctxOf(req), netString(req.query.key));
    // a page with its own display(key) skips ViewControl's status checks: a cancelled record stays editable
    res.json(publicState(CUSTOM_DISPLAY.has(spec.file) ? { ...s, recordStatus: null, statusMessage: null } : s));
  } catch (e) {
    fail(res, e);
  }
}

async function getCopy(req, res) {
  const spec = await load(req, res);
  if (!spec) return;
  if (!spec.titleBar.copybutton) return void res.status(404).json({ message: 'Copy is not available on this screen' });
  try {
    res.json(publicState(await copyState(spec, ctxOf(req), netString(req.query.key))));
  } catch (e) {
    fail(res, e);
  }
}

// AutoPostBack: run the page's handler for a control on the current values; returns option/value patches + alert.
async function postEvent(req, res) {
  const spec = await load(req, res);
  if (!spec) return;
  const handler = PAGE_EVENTS[spec.file]?.[netString(req.body?.control)];
  if (!handler) return void res.status(404).json({ message: 'No such event' });
  const v = Object.fromEntries(Object.entries(await posted(req, spec)).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)]));
  const vs = req.body?.viewState && typeof req.body.viewState === 'object' ? Object.fromEntries(Object.entries(req.body.viewState).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)])) : {};
  try {
    const ui = req.body?.ui && typeof req.body.ui === 'object' ? req.body.ui : {};
    const r = await handler(v, eventHelpers(spec, ctxOf(req), v, { viewState: vs, arg: req.body?.arg, index: Number(req.body?.index ?? -1), ui }));
    // page code that sets a session value (WrapperAvatar.Department = ...): only the department is allowed
    if (r.session && 'department' in r.session) writeSession(res, { ...req.session, department: netString(r.session.department) });
    const { session: _, ...rest } = r;
    res.json({ ...rest, viewState: r.viewState ?? vs });
  } catch (e) {
    fail(res, e);
  }
}

// TitleControl Print: the page's print handler with the chosen printer
async function postPrint(req, res) {
  const spec = await load(req, res);
  if (!spec) return;
  const handler = PAGE_PRINT[spec.file];
  if (!handler) return void res.status(404).json({ message: 'Nothing to print on this screen' });
  const raw = values(req.body);
  const v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)]));
  try {
    res.json(await handler(v, { ...eventHelpers(spec, ctxOf(req), v), printer: netString(req.body?.printer) }));
  } catch (e) {
    fail(res, e);
  }
}

// ComboBoxControl picker: open (first 2000 rows) or search
async function getCombo(req, res) {
  const spec = await load(req, res);
  if (!spec) return;
  const c = engineControls(spec).find((x) => x.id === netString(req.query.id) && x.type === 'ComboBox');
  if (!c) return void res.status(404).json({ message: 'No such list' });
  try {
    res.json(await comboRows(c, req.session.businessUnit, req.query.search == null ? null : netString(req.query.search)));
  } catch (e) {
    fail(res, e);
  }
}

const values = (b) => (b?.values && typeof b.values === 'object' ? b.values : {});
// the posted values as the page's handlers see them: after a Page_Load that also runs on postbacks
const posted = async (req, spec) => (PAGE_POSTBACK[spec.file] ? PAGE_POSTBACK[spec.file](values(req.body), spec, ctxOf(req)) : values(req.body));

async function postSave(req, res) {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const own = PAGE_SAVE[spec.file];
    if (own) {
      const raw = await posted(req, spec);
      const v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)]));
      const r = await own(v, { ...eventHelpers(spec, ctxOf(req), raw, { viewState: req.body?.viewState ?? {}, ui: req.body?.ui ?? {} }), raw });
      if (r.logout) clearSession(res); // the page cleared the session: signed out
      return void res.json(r);
    }
    const key = await insert(spec, await collect(spec, await posted(req, spec), ctxOf(req)), ctxOf(req));
    res.json({ ok: true, key, message: 'Record Created Successfully' });
  } catch (e) {
    fail(res, e);
  }
}

// WIP Capture's unit view: the scanned label's route and cabinet details (read only; the WIP events are unchanged).
// Each part fails on its own, so a missing table or column never hides the other.
async function getUnit(req, res) {
  if (netString(req.query.path).toLowerCase() !== '/production/wipcaptureform') return void res.status(404).json({ message: 'Form not found' });
  const spec = await load(req, res);
  if (!spec) return;
  const label = netString(req.query.label).trim();
  if (label === '' || label.length > 100) return void res.status(400).json({ message: 'Scan a unit serial' });
  const [route, cabinet] = await Promise.allSettled([routeByLabel(label), cabinetByLabel(label)]);
  for (const r of [route, cabinet]) if (r.status === 'rejected') log('error', `${req.id} forms/unit: ${r.reason?.message}`);
  res.json({ route: route.value ?? null, cabinet: cabinet.value ?? null });
}

async function postUpdate(req, res) {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const own = PAGE_UPDATE[spec.file];
    if (own) {
      const raw = await posted(req, spec);
      const v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)]));
      return void res.json(await own(v, { ...eventHelpers(spec, ctxOf(req), raw, { viewState: req.body?.viewState ?? {}, ui: req.body?.ui ?? {} }), raw }));
    }
    const key = await update(spec, await collect(spec, await posted(req, spec), ctxOf(req)), ctxOf(req));
    res.json({ ok: true, key, message: 'Record Updated Successfully' });
  } catch (e) {
    fail(res, e);
  }
}

async function postCancel(req, res) {
  const spec = await load(req, res);
  if (!spec) return;
  try {
    const own = PAGE_CANCEL[spec.file];
    if (own) {
      const raw = await posted(req, spec);
      const v = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, x !== null && typeof x === 'object' ? x : netString(x)]));
      return void res.json(await own(v, { ...eventHelpers(spec, ctxOf(req), raw, { viewState: req.body?.viewState ?? {}, ui: req.body?.ui ?? {} }), raw, remark: netString(req.body?.remark) }));
    }
    await cancel(spec, await collect(spec, await posted(req, spec), ctxOf(req)), ctxOf(req), netString(req.body?.remark));
    res.json({ ok: true, message: 'Record Deleted Successfully' });
  } catch (e) {
    fail(res, e);
  }
}

const router = Router();
router.use(requireAuth, operatorMessages);
router.get('/spec', getSpec);
router.get('/list', getList);
router.get('/distinct', getDistinct);
router.get('/record', getRecord);
router.get('/copy', getCopy);
router.post('/event', postEvent);
router.post('/print', postPrint);
router.get('/combo', getCombo);
router.post('/save', postSave);
router.get('/unit', getUnit);
router.post('/update', postUpdate);
router.post('/cancel', postCancel);

export default router;
