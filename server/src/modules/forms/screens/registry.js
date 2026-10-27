// The screen registries the engine reads (forms routes, state, events): each screen file adds its page's code-behind
// to them. eventHelpers is what every handler gets as `h`.
import { netString } from '../../../shared/net.js';
import { newFormState } from '../state.js';
import { fill } from '../../../db/options.js';
import { gridTable } from '../children.js';

export const PAGE_INIT = {};

// Lists the page refills while the form is open: the current items follow from the other values.
export const PAGE_LISTS = {};

export const PAGE_EVENTS = {};

/** What a handler gets besides the values: list items, the grid's DataTable, ViewState, the grid command's key. */
export function eventHelpers(spec, ctx, v, { viewState = {}, arg = '', index = -1, ui = {} } = {}) {
  let state = null;
  const byId = (id) => spec.controls.find((c) => c.id === id);
  const h = {
    spec,
    ctx,
    vs: viewState,
    arg: netString(arg),
    index, // the grid row clicked (GridViewDeleteEventArgs.RowIndex)
    fill: (sql, params) => fill(sql, 'Select A Value', params),
    control: (id) => spec.controls.find((c) => c.id === id),
    /** a control as the page shows it now (posted by the client: visible / enabled / text), else as in the markup */
    ui(id) {
      const c = byId(id);
      const a = c?.attrs ?? {};
      return { visible: a.visible?.toLowerCase() !== 'false', enabled: a.enabled?.toLowerCase() !== 'false', text: c?.text ?? '', ...(ui[id] ?? {}) };
    },
    /** Control.Visible as read in code: false when the control or any panel around it is hidden */
    shown(id) {
      for (let c = byId(id); c; c = c.parent ? byId(c.parent) : null) if (!h.ui(c.id).visible) return false;
      return true;
    },
    /** current items of a dropdown: the page's own refill if it has one, the posted items, else as the form was built */
    async options(id) {
      const own = PAGE_LISTS[spec.file]?.[id];
      if (own) return own(v, h);
      if (Array.isArray(ui[id]?.options)) return ui[id].options;
      state ??= await newFormState(spec, ctx);
      return state.controls.find((c) => c.id === id)?.options ?? [];
    },
    /** the grid's DataTable: the posted rows, or the rows given (e.g. after the page rewrote them) */
    async table(gridId, given) {
      const rows = (Array.isArray(given) ? given : Array.isArray(v[gridId]) ? v[gridId] : []).map((r) => Object.fromEntries(Object.entries(r ?? {}).map(([k, x]) => [k, netString(x)])));
      return gridTable(h.control(gridId), rows);
    },
  };
  return h;
}

/** Page_Load code after the form is built and cleared: (controls, ctx). */
/** display(key) code of a page around AU.Display: { before(controls, row, ctx), after(controls, row, ctx) } */
export const PAGE_DISPLAY = {};

export const PAGE_LOAD = {};

/** Pages whose list opens records through their own display(key): the record status does not lock the form. */
export const CUSTOM_DISPLAY = new Set();

/**
 * Save handlers that replace the engine's: (values, helpers) -> { ok, message?, alert?, key?, set?, logout? }.
 * ok/message are TitleControl.Success / Message (ok: success alert, the form is cleared unless CallNewOnSave = false;
 * not ok: the message as an error); alert is what the page itself showed; logout ends the session (the page cleared
 * UserId/UserCode and redirected to the login page).
 */
/** Delete handlers (TitleControl.btndeleteHandler): (values, helpers with .remark) -> { ok, message } */
export const PAGE_CANCEL = {};

/** Update handlers that replace the engine's (TitleControl.btnupdateHandler): same shape as PAGE_SAVE. */
export const PAGE_UPDATE = {};

export const PAGE_SAVE = {};

/** Print handlers (TitleControl.btnprintHandler): (values, helpers with .printer) -> { alert?, success? } */
export const PAGE_PRINT = {};

/** Page_Load code that also runs on every postback: (values, spec, ctx) -> the values the handlers / Save then see */
export const PAGE_POSTBACK = {};

/** The page's lists that rewrite the record list's Tag: (filter sent back by the client) -> Tag, or nothing */
export const PAGE_LIST_TAG = {};
