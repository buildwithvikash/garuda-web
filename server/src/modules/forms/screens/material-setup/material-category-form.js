// Material Category (View/MaterialSetup/MaterialCategoryForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { PAGE_EVENTS } from '../registry.js';

Object.assign(PAGE_EVENTS, {
  'View/MaterialSetup/MaterialCategoryForm.aspx': {
    DDLInspectionRequired: async (v) => (v.DDLInspectionRequired === 'False' ? { set: { DDLInspectionType: { index: 0 }, DDLInspectionCheckList: { index: 0 } } } : {}),
  },
});
