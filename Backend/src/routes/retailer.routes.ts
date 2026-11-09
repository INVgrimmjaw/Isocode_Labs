import { Router } from 'express';
import type { RetailerController } from '../controllers/retailer.controller.ts';
import { requireRole } from '../middleware/auth.ts';

export function retailerRoutes(controller: RetailerController): Router {
  const router = Router();
  router.use(requireRole('RETAILER'));
  router.get('/home', controller.home);
  router.post('/quote', controller.quote);
  router.get('/orders', controller.listOrders);
  router.get('/orders/:id', controller.getOrder);
  router.post('/orders', controller.placeOrder);
  return router;
}
