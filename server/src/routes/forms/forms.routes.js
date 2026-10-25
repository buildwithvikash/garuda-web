// /api/forms: the screen engine (spec, list, record, events, save / update / delete, print, pickers).
import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import { operatorMessages } from '../../middleware/operator-messages.js';
import * as c from '../../controllers/forms/forms.controller.js';

export const formRoutes = Router();
formRoutes.use(requireAuth, operatorMessages);

formRoutes.get('/spec', c.getSpec);
formRoutes.get('/list', c.getList);
formRoutes.get('/distinct', c.getDistinct);
formRoutes.get('/record', c.getRecord);
formRoutes.get('/copy', c.getCopy);
formRoutes.post('/event', c.postEvent);
formRoutes.post('/print', c.postPrint);
formRoutes.get('/combo', c.getCombo);
formRoutes.post('/save', c.postSave);
formRoutes.get('/unit', c.getUnit);
formRoutes.post('/update', c.postUpdate);
formRoutes.post('/cancel', c.postCancel);
