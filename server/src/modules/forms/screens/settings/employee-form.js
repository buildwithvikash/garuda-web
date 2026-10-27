// Employee (View/Settings/EmployeeForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { netString } from '../../../../shared/net.js';
import { printLabel, printerDetail } from '../../../production/labels.service.js';
import { errorMsg, guard } from '../_shared.js';
import { CUSTOM_DISPLAY, PAGE_PRINT } from '../registry.js';

CUSTOM_DISPLAY.add('View/Settings/EmployeeForm.aspx');



/** TitleControl.GetCurrentPrinter() + the pages' "printer chosen?" check ("Select A Printer"). */
async function withPrinter(h, out, fn) {
  if (netString(h.printer) === '') {
    out.alert = errorMsg('Select A Printer');
    return;
  }
  await fn(await printerDetail(h.printer));
}

Object.assign(PAGE_PRINT, {
  'View/Settings/EmployeeForm.aspx': async (v, h) => {
    const out = {};
    return guard(out, () => withPrinter(h, out, (bp) => printLabel('employee', v.PrimaryKey, bp, h.ctx.userId)));
  },
});
