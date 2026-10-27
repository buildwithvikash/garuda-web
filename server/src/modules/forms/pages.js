// The original pages' code-behind (TitleControl handlers, AutoPostBack events, Page_Load ...), one file per screen in
// ./screens/<folder>/<screen>.js, registered in ./screens/registry.js. Importing this module loads them all.
// Domain services run these handlers (events.service.js); the generic /forms routes read the registries.
import './screens/authorization/change-password-form.js';
import './screens/authorization/reset-password-form.js';
import './screens/authorization/users-form.js';
import './screens/business-setup/business-unit-form.js';
import './screens/ceat/ceatin-self-inspection-form.js';
import './screens/material-setup/bill-of-material.js';
import './screens/material-setup/material-barcode.js';
import './screens/material-setup/material-category-form.js';
import './screens/material-setup/material-form.js';
import './screens/material-setup/model-form.js';
import './screens/material-setup/serial-generation-logic-form.js';
import './screens/production-setup/routing-form.js';
import './screens/production-setup/routing-guide-form.js';
import './screens/production/fg-scrap-form.js';
import './screens/production/model-to-model-transfer-form.js';
import './screens/production/process-guide-form.js';
import './screens/production/prod-plan-upload.js';
import './screens/production/production-assignment-form.js';
import './screens/production/production-order-form.js';
import './screens/production/rm-replacement-form.js';
import './screens/production/wip-capture-form.js';
import './screens/production/wrl-image-disply.js';
import './screens/quality/ncmr-confirmation.js';
import './screens/quality/quality-inspection-form.js';
import './screens/quality/repair-finishing-confirmation.js';
import './screens/quality/rework-confirmation-new.js';
import './screens/settings/employee-form.js';
import './screens/settings/parameter-form.js';
import './screens/settings/parameter-value-list-form.js';
import './screens/settings/printer-form.js';
import './screens/settings/shift-master-form.js';

export { CUSTOM_DISPLAY, PAGE_CANCEL, PAGE_DISPLAY, PAGE_EVENTS, PAGE_INIT, PAGE_LISTS, PAGE_LIST_TAG, PAGE_LOAD, PAGE_POSTBACK, PAGE_PRINT, PAGE_SAVE, PAGE_UPDATE, eventHelpers } from './screens/registry.js';
export { importExcel } from './screens/production/prod-plan-upload.js';
