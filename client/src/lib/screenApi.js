// How an engine-style control talks to a screen's own REST API (for the screens in API_SCREENS), answering as the old
// screen engine (/api/forms) did; ./screenApiCore.js does the translation. The engine itself is gone from the client.
import { api } from "@/api.js";
import {
  eventOf,
  listShape,
  mapsOf,
  overlay,
  toPatch,
  toRecord,
} from "./screenApiCore.js";

/** route -> its API (under /api) */
export const API_SCREENS = {
  "/materialsetup/materialbarcode": "/masters/material-barcodes",
};

const enc = encodeURIComponent;
const post = (path, body) => api(path, { method: "POST", body });

/** the screen's REST API, answering as the engine does */
function rest(base) {
  let layout = null;
  let maps = null;
  const ready = async () => layout ?? (await load());
  async function load() {
    layout = await api(`${base}/layout`);
    maps = mapsOf(layout);
    return layout;
  }
  // a refused save / update / delete (400) is the page's own { ok: false, message, alert }
  const refused = (e) => {
    if (e.status === 400)
      return {
        ok: false,
        message: e.message,
        ...(e.data?.alert && { alert: e.data.alert }),
      };
    throw e;
  };
  const body = (b) => ({
    record: toRecord(b.values ?? {}, maps),
    viewState: b.viewState ?? {},
    ui: b.ui ?? {},
    ...(b.arg !== undefined && { arg: b.arg }),
    ...(Number.isInteger(b.index) && { index: b.index }),
    ...(b.printer !== undefined && { printer: String(b.printer) }),
    ...(b.remark !== undefined && { remark: b.remark }),
  });
  const keyOf = (b) => enc(String(b.values?.PrimaryKey ?? "")); // the record's key, as TitleControl reads it
  return {
    // the blank form is the layout itself (the engine's spec)
    spec: () => load(),
    record: async (key) =>
      overlay(await ready(), await api(`${base}/${enc(key)}`), maps),
    copy: async (key) =>
      overlay(await ready(), await api(`${base}/${enc(key)}/copy`), maps),
    // query: the engine's "&page=..&column=..&op=..&value=..&f.x=.." string
    list: async (query) =>
      listShape(await api(`${base}?${query.replace(/^&/, "")}`)),
    distinct: (column) => api(`${base}/search-fields/${enc(column)}/values`),
    async event({ control, ...b }) {
      await ready();
      const event = eventOf(control, maps);
      if (!event) throw new Error(`No such event: ${control}`);
      return toPatch(await post(`${base}/events/${enc(event)}`, body(b)), maps);
    },
    async write(kind, b) {
      await ready();
      const call =
        kind === "save"
          ? post(base, body(b))
          : api(`${base}/${keyOf(b)}`, {
              method: kind === "update" ? "PUT" : "DELETE",
              body: body(b),
            });
      return call.then((r) => toPatch(r, maps), refused);
    },
    async print(b) {
      await ready();
      return toPatch(await post(`${base}/print`, body(b)), maps);
    },
    // a search picker's rows (ComboBoxControl), by the control's field
    async combo(id, search) {
      await ready();
      return api(
        `${base}/pickers/${enc(maps.names[id] ?? id)}${search == null ? "" : `?search=${enc(search)}`}`,
      );
    },
  };
}

const cache = new Map();
/** the transport for a screen route (one per screen: the API's keeps the layout it fetched) */
export function screenApi(path) {
  if (!cache.has(path)) {
    if (!API_SCREENS[path]) throw new Error(`No API for ${path}`);
    cache.set(path, rest(API_SCREENS[path]));
  }
  return cache.get(path);
}
