// How a screen page talks to the server: the screen engine (/api/forms) or, for the screens in API_SCREENS, the
// screen's own REST API. Both give the page the same answers (control states and patches), so a page draws and
// behaves the same either way; ./screenApiCore.js does the translation. A screen switches by adding its route here and
// switches back by removing it (docs/CLIENT-SWITCH-PLAN.md).
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
  "/materialsetup/unitofmeasureform": "/masters/units-of-measure",
  "/materialsetup/variantfieldform": "/masters/variant-fields",
  "/materialsetup/variantfieldvalueform": "/masters/variant-values",
  "/businesssetup/ledgerform": "/masters/ledgers",
  "/productionsetup/productionlineform": "/masters/production-lines",
  "/productionsetup/productionprocess": "/masters/production-processes",
  "/settings/defectcodemasterform": "/masters/defect-codes",
  "/settings/materialtagform": "/masters/material-tags",
  "/settings/printerform": "/masters/printers",
  "/settings/reworkresolutionform": "/masters/rework-resolutions",
  "/settings/rootcauseform": "/masters/root-causes",
  "/settings/scrapreasonform": "/masters/scrap-reasons",
  "/businesssetup/businessunitform": "/masters/business-units",
  "/businesssetup/departmentform": "/masters/departments",
  "/productionsetup/workcenterform": "/masters/work-centers",
  "/authorization/userroleform": "/masters/user-roles",
  "/materialsetup/materialcategoryform": "/masters/material-categories",
  "/settings/parametervaluelistform": "/masters/value-lists",
  "/settings/shiftmasterform": "/masters/shifts",
  "/materialsetup/modelform": "/masters/models",
  "/authorization/usersform": "/masters/users",
  "/materialsetup/materialform": "/masters/materials",
  "/materialsetup/serialgenerationlogicform": "/masters/serial-logics",
  "/materialsetup/billofmaterial": "/masters/bills-of-material",
  "/productionsetup/routingform": "/masters/routings",
  "/productionsetup/routingguideform": "/masters/routing-guides",
  "/settings/parameterform": "/masters/check-lists",
  "/materialsetup/materialbarcode": "/masters/material-barcodes",
  "/settings/employeeform": "/masters/employees",
  "/businesssetup/companyform": "/masters/company",
  "/authorization/resetpasswordform": "/masters/reset-password",
  "/authorization/changepasswordform": "/masters/change-password",
  "/quality/qualityinspectionform": "/quality/final-inspections",
  "/quality/ncmrconfirmation": "/quality/ncmr-confirmations",
  "/quality/repairconfirmation": "/quality/repair-confirmations",
  "/quality/finishingconfirmation": "/quality/finishing-confirmations",
  "/quality/reworkconfirmationnew": "/quality/rework-confirmations",
  "/ceat/ceatinselfinspectionform": "/quality/self-inspections",
};

const enc = encodeURIComponent;
const post = (path, body) => api(path, { method: "POST", body });

/** the screen engine, as the pages called it */
function engine(path) {
  const p = `path=${enc(path)}`;
  return {
    spec: () => api(`/forms/spec?${p}`),
    record: (key) => api(`/forms/record?${p}&key=${enc(key)}`),
    copy: (key) => api(`/forms/copy?${p}&key=${enc(key)}`),
    list: (query) => api(`/forms/list?${p}${query}`),
    distinct: (column) => api(`/forms/distinct?${p}&column=${enc(column)}`),
    event: (body) => post("/forms/event", { path, ...body }),
    write: (kind, body) => post(`/forms/${kind}`, { path, ...body }),
    print: (body) => post("/forms/print", { path, ...body }),
    combo: (id, search) =>
      api(
        `/forms/combo?${p}&id=${enc(id)}${search == null ? "" : `&search=${enc(search)}`}`,
      ),
    unit: (label) => api(`/forms/unit?${p}&label=${enc(label)}`),
  };
}

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
    // WIP Capture's unit view (route and cabinet of a scanned serial)
    unit: (label) => api(`${base}/units/${enc(label)}`),
  };
}

const cache = new Map();
/** the transport for a screen route (one per screen: the API's keeps the layout it fetched) */
export function screenApi(path) {
  if (!cache.has(path))
    cache.set(path, API_SCREENS[path] ? rest(API_SCREENS[path]) : engine(path));
  return cache.get(path);
}
