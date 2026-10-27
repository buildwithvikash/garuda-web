// /api/masters/<name>: the setup screens (authorization, business, material, production setup, settings) as REST
// resources; the calls are in forms/resource.routes.js, the reference in docs/API.md.
import { screensRouter } from '../forms/resource.routes.js';

/** API name -> screen */
export const MASTERS = {
  // Authorization
  'change-password': '/authorization/changepasswordform',
  'reset-password': '/authorization/resetpasswordform',
  'user-roles': '/authorization/userroleform',
  users: '/authorization/usersform',
  // Business Setup
  'business-units': '/businesssetup/businessunitform',
  company: '/businesssetup/companyform',
  departments: '/businesssetup/departmentform',
  ledgers: '/businesssetup/ledgerform',
  // Material Setup
  'bills-of-material': '/materialsetup/billofmaterial',
  'material-barcodes': '/materialsetup/materialbarcode',
  'material-categories': '/materialsetup/materialcategoryform',
  materials: '/materialsetup/materialform',
  models: '/materialsetup/modelform',
  'serial-logics': '/materialsetup/serialgenerationlogicform',
  'units-of-measure': '/materialsetup/unitofmeasureform',
  'variant-fields': '/materialsetup/variantfieldform',
  'variant-values': '/materialsetup/variantfieldvalueform',
  // Production Setup
  'production-lines': '/productionsetup/productionlineform',
  'production-processes': '/productionsetup/productionprocess',
  routings: '/productionsetup/routingform',
  'routing-guides': '/productionsetup/routingguideform',
  'work-centers': '/productionsetup/workcenterform',
  // Settings
  'defect-codes': '/settings/defectcodemasterform',
  employees: '/settings/employeeform',
  'material-tags': '/settings/materialtagform',
  'check-lists': '/settings/parameterform',
  'value-lists': '/settings/parametervaluelistform',
  printers: '/settings/printerform',
  'rework-resolutions': '/settings/reworkresolutionform',
  'root-causes': '/settings/rootcauseform',
  'scrap-reasons': '/settings/scrapreasonform',
  shifts: '/settings/shiftmasterform',
};

export default screensRouter(MASTERS);
