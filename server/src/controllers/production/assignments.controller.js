// /api/production/assignments: read the request, check it, call the assignments service, answer. Wired in
// routes/production/assignments.routes.js.
import * as assignments from '../../services/production/assignments.service.js';
import { validateAssignment } from '../../validators/production/assignments.validator.js';
import { sessionContext } from '../../shared/session/session.js';
import { netString } from '../../shared/utils/net.js';

const run = (fn) => async (req, res) => {
  try {
    await fn(req, res, sessionContext(req));
  } catch (e) {
    res.status(e.status ?? 400).json({ message: e.message });
  }
};
const checked = (req, res) => {
  const { value, errors } = validateAssignment(req.body);
  if (errors) res.status(400).json({ message: 'Check the highlighted fields.', errors });
  return errors ? null : value;
};

export const blank = run(async (_req, res, ctx) => res.json(await assignments.blank(ctx)));

export const change = run(async (req, res, ctx) => {
  const value = checked(req, res);
  if (value) res.json(await assignments.change(ctx, netString(req.params.field), value));
});

export const print = run(async (req, res, ctx) => {
  const value = checked(req, res);
  if (value) res.json(await assignments.print(ctx, value));
});
