// Shop-floor scope: the only screens this app offers (production order -> FG label, its masters and the screens
// around it). Every other form, and its menu entry, is hidden; its code stays. Add a route here to bring one back.
export const KEEP = new Set([
  // the flow
  '/production/productionorderform',
  '/production/productionassignmentform',
  '/production/wipcaptureform',
  '/quality/reworkconfirmationnew',
  '/production/prodplanupload', // monthly label plans the QC / FG label checks need
  // product
  '/materialsetup/materialform',
  '/materialsetup/modelform',
  '/materialsetup/billofmaterial',
  '/materialsetup/unitofmeasureform',
  '/materialsetup/serialgenerationlogicform',
  // route and stations
  '/productionsetup/productionprocess',
  '/productionsetup/routingform',
  '/productionsetup/workcenterform',
  '/productionsetup/productionlineform',
  '/businesssetup/departmentform',
  '/businesssetup/businessunitform',
  // labels and quality
  '/settings/printerform',
  '/settings/parameterform',
  '/settings/parametervaluelistform',
  '/settings/defectcodemasterform',
  '/settings/rootcauseform',
  '/settings/reworkresolutionform',
  '/settings/shiftmasterform',
  // users
  '/settings/employeeform',
  '/authorization/usersform',
  '/authorization/userroleform',
  '/authorization/changepasswordform',
  '/authorization/resetpasswordform',
  // work instructions
  '/productionsetup/routingguideform',
  '/production/processguideform',
  // shop-floor corrections
  '/materialsetup/materialbarcode',
  '/production/modeltomodeltransferform',
  '/production/rmreplacementform',
  // added on review
  '/businesssetup/companyform',
  '/businesssetup/ledgerform',
  '/materialsetup/variantfieldform',
  '/materialsetup/variantfieldvalueform',
  '/materialsetup/materialcategoryform',
  '/settings/scrapreasonform',
  '/settings/materialtagform',
  '/production/fgscrapform',
  '/production/wrlimagedisply',
  // other QC actions
  '/quality/qualityinspectionform',
  '/quality/ncmrconfirmation',
  '/quality/repairconfirmation',
  '/quality/finishingconfirmation',
  '/ceat/ceatinselfinspectionform',
]);
