// /api/production/assignments: start a production order at its first stage and print the job cards.
import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import { authorizeScreen } from '../../middleware/authorize.js';
import { operatorMessages } from '../../middleware/operator-messages.js';
import * as c from '../../controllers/production/assignments.controller.js';
import { SCREEN } from '../../services/production/assignments.service.js';

export const assignmentRoutes = Router();
assignmentRoutes.use(requireAuth, authorizeScreen(SCREEN), operatorMessages);

assignmentRoutes.get('/new', c.blank); // the screen as it opens, with its lists
assignmentRoutes.post('/changes/:field', c.change); // department | order | routing | process | station chosen
assignmentRoutes.post('/print', c.print); // job cards + labels for the quantity
