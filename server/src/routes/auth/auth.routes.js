// /api/auth: sign-in page data, sign-in, change password, sign-out, who is signed in.
import { Router } from 'express';
import { requireAuth } from '../../middleware/authenticate.js';
import * as c from '../../controllers/auth/auth.controller.js';

export const authRoutes = Router();

authRoutes.get('/login-page', c.getLoginPage);
authRoutes.get('/business-units', c.getBusinessUnits);
authRoutes.post('/login', c.postLogin);
authRoutes.post('/change-password', c.postChangePassword);
authRoutes.post('/logout', c.postLogout);
authRoutes.get('/me', requireAuth, c.getMe);
