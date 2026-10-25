// /api/production/orders: production orders (PRODHeader + its service-request lines).
import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import { authorizeScreen } from '../../middleware/authorize.js';
import { operatorMessages } from '../../middleware/operator-messages.js';
import * as c from '../../controllers/production/orders.controller.js';
import { SCREEN } from '../../services/production/orders.service.js';

export const orderRoutes = Router();
orderRoutes.use(requireAuth, authorizeScreen(SCREEN), operatorMessages);

orderRoutes.get('/', c.list); // ?page=&column=&op=&value=
orderRoutes.get('/search-fields', c.searchFields);
orderRoutes.get('/search-fields/:column/values', c.columnValues);
orderRoutes.get('/new', c.blank); // a blank order with its options
orderRoutes.post('/changes/:field', c.change); // material | orderType | salesOrder chosen: what it fills
orderRoutes.post('/service-requests', c.addServiceRequest); // add the picked service request as a line
orderRoutes.get('/:prodNo', c.get);
orderRoutes.post('/', c.create);
orderRoutes.put('/:prodNo', c.save);
orderRoutes.delete('/:prodNo', c.cancel); // body: { remark }
