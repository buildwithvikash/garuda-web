// Checks the request body with a module's validator (shared/validate.js rules): the cleaned values go to
// req.valid.body; problems answer 422 { message, errors: { field: message } }.
import { AppError } from '../shared/AppError.js';

export const validate = (validator) => (req, _res, next) => {
  const { value, errors } = validator(req.body);
  if (errors) return next(AppError.unprocessable('Check the highlighted fields.', errors));
  req.valid = { ...req.valid, body: value };
  next();
};
