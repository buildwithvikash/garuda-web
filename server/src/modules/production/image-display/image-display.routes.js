// /api/production/image-display: Material Image Display (original View/Production/WRLImageDisply.aspx). Scan a unit, see its
// material's image. Read only.
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../../middlewares/auth.js';
import { portedErrors } from '../../../middlewares/errorHandler.js';
import { operatorMessages } from '../../../middlewares/operatorMessages.js';
import { query } from '../../../db/pool.js';
import { AppError } from '../../../shared/AppError.js';
import { ok } from '../../../shared/http.js';
import { netString } from '../../../shared/net.js';

export const SCREEN = '/production/wrlimagedisply';

const router = Router();
router.use(requireAuth, authorizeScreen(SCREEN), operatorMessages);

// the image as a data URL, as the original's page showed it
router.get('/units/:serial', async (req, res) => {
  const serial = netString(req.params.serial).trim();
  if (serial === '' || serial.length > 100) throw AppError.badRequest('Scan a unit serial');
  const [row] = await query('select m.MaterialImage image from Material m inner join MaterialBarcode mb on m.MatCode = mb.Material where mb.Serial = @s', { s: serial });
  if (!row) throw AppError.badRequest('This serial is not known');
  if (!Buffer.isBuffer(row.image)) throw AppError.badRequest('This material has no image');
  ok(res, { image: `data:image/png;base64,${row.image.toString('base64')}` });
});

router.use(portedErrors);

export default router;
