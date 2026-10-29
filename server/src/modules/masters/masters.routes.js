// /api/masters/<name>: the setup screens (authorization, business, material, production setup, settings) as REST
// resources; the calls are in forms/resource.routes.js, the reference in docs/API.md.
import { Router } from 'express';
import { screensRouter } from '../forms/resource.routes.js';
import materialBarcodeReprint from './material-barcode-reprint.js';
import materialImages from './material-images.js';
import serialLogicPreview from './serial-logic-preview.js';

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

// the material images (material-images.js) first: they are not part of the Material screen's record
const router = Router();
router.use(materialImages);
router.use(serialLogicPreview); // before the screen's /:key routes ('preview' is not a key)
router.use(materialBarcodeReprint); // before the screen's /:key routes ('reprint' is not a barcode number)
router.use(screensRouter(MASTERS));
export default router;
