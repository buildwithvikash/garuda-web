// RM Replacement: a component of a unit replaced by a new serial. The browser sends serials only; the job card and row
// come from the server's own lookup each time, and every rule is checked at the replacement itself.
import { AppError } from '../../../shared/AppError.js';
import { netString } from '../../../shared/net.js';
import { componentStatus, fgComponents, replaceRMScan } from '../production.service.js';

export const SCREEN = '/production/rmreplacementform';

const SCRAPPED = 99;

/** owner, 28 Oct 2026: only a raw material can be replaced (the original also took in-process materials) */
const isRawMaterial = (row) => /^raw material$/i.test(netString(row.Category).trim());

/** a component as the screen shows it: never its job card, row or process codes */
export const componentView = (row) => ({
  category: netString(row.Category),
  material: netString(row.Material),
  process: netString(row.Process),
  serial: netString(row.Serial),
  replaceable: isRawMaterial(row),
});

/** the unit's row for a serial that is to be replaced, else why not */
export function chooseComponent(rows, serial) {
  const row = rows.find((r) => netString(r.Serial).trim() === serial);
  if (!row) throw AppError.badRequest('Serial No not found');
  if (!isRawMaterial(row)) throw AppError.badRequest('Only raw material can be replaced');
  return row;
}

/** the unit's component rows, unless it is scrapped */
async function unitRows(serial) {
  const rows = await fgComponents(serial);
  if ((await componentStatus(serial)) === SCRAPPED) throw AppError.badRequest('This Serial No is Scrapped');
  return rows;
}

export const unit = async (serial) => ({ serial, components: (await unitRows(serial)).map(componentView) });

/** { unit, existing, replacement }: the component replaced; the unit's list as it is now */
export async function replace({ unit: serial, existing, replacement }, ctx) {
  const row = chooseComponent(await unitRows(serial), existing);
  // owner, 28 Oct 2026: a new serial the material's serial logic rejects is refused (the original showed success,
  // replacing nothing)
  if (!(await replaceRMScan({ ...row, NewSerialNo: replacement }, ctx))) throw AppError.badRequest('The new serial does not match the serial format of this material');
  return { message: 'Component replaced', ...(await unit(serial)) };
}
