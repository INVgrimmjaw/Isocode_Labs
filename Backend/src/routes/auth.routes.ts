import { Router } from 'express';
import type { AuthController } from '../controllers/auth.controller.ts';
import { requireUser } from '../middleware/auth.ts';
import { authLimiter } from '../middleware/rate-limit.ts';

export function authRoutes(controller: AuthController): Router {
  const router = Router();
  router.post('/otp/request', authLimiter, controller.requestOtp);
  router.post('/otp/verify', authLimiter, controller.verifyOtp);
  router.post('/logout', controller.logout);
  router.get('/me', requireUser, controller.me);
  return router;
}
