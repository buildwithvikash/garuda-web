// A production assignment as the API takes it: the choices (codes) and the quantity. Nothing is required here: the
// screen's own Print checks what is missing ("Select A Department", "Enter Positive Qty" ...) and says so.
import { validate, rules } from '../../shared/utils/validate.js';

const draft = {
  department: rules.code(),
  printer: rules.code(),
  businessUnit: rules.code(),
  status: rules.code(),
  order: rules.code(),
  material: rules.code(),
  bom: rules.code(),
  routing: rules.code(),
  variant: rules.code(),
  process: rules.code(),
  station: rules.code(),
  totalQty: rules.number(),
  totalUom: rules.code(),
  qty: rules.number(),
  uom: rules.code(),
  assignDate: rules.date(),
};

export const validateAssignment = (body) => validate(body, draft);
