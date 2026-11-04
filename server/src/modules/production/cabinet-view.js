// WIP Capture's cabinet card: which unit view applies and the values it names (no database: tested on its own).

const FG_STAGE = 6; // ProductionProcess.ProdcutionStage of FG / SUS FG LABEL PRINTING

/** The label a unit carries, as Material Barcode's reprint tells them apart: 'FG' (its stage label is at an FG label
 *  printing stage), 'Assembly' (a serial starting with S, printed at QC foaming), 'Foaming' (F foaming, L door / lid
 *  foaming), else null. */
export function labelKind(serial, labelStage) {
  if (Number(labelStage) === FG_STAGE) return 'FG';
  const first = String(serial ?? '').trim().charAt(0).toUpperCase();
  if (first === 'S') return 'Assembly';
  return /[A-Z]/.test(first) ? 'Foaming' : null;
}

/** the value of the first variant field whose name matches (the names differ by model: NMN_GRAPHICS, GRAPHICS ...) */
export const variantValue = (variants, pattern) => (variants ?? []).find((v) => pattern.test(String(v.name ?? '')))?.value ?? '';

export const GRAPHICS = /graphic/i;
export const CUSTOMER = /customer/i;
