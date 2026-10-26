// Every API route, under /api.
import { Router } from 'express';
import express from 'express';
import { authRoutes } from './auth/auth.routes.js';
import { formRoutes } from './forms/forms.routes.js';
import { orderRoutes } from './production/orders.routes.js';
import { assignmentRoutes } from './production/assignments.routes.js';

export const apiRoutes = Router();
// form posts can carry files (guides, images) as base64
apiRoutes.use('/forms', express.json({ limit: '100mb' }));
apiRoutes.use(express.json({ limit: '1mb' }));
apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/forms', formRoutes);
apiRoutes.use('/production/orders', orderRoutes);
apiRoutes.use('/production/assignments', assignmentRoutes);
apiRoutes.use((_req, res) => res.status(404).json({ message: 'Not found' }));
