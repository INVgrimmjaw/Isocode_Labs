import { Router } from 'express';
import type { DeskController } from '../controllers/desk.controller.ts';
import { requireRole } from '../middleware/auth.ts';
import { captureLimiter } from '../middleware/rate-limit.ts';

export function deskRoutes(controller: DeskController): Router {
  const router = Router();
  router.use(requireRole('DESK'));

  router.get('/orders', controller.listOrders);
  router.get('/orders/:id', controller.getOrder);
  router.post('/orders/:id/release', controller.releaseHold);
  router.post('/orders/:id/reject', controller.rejectOrder);

  router.get('/retailers', controller.listRetailers);
  router.get('/retailers/inactive', controller.inactiveRetailers);

  router.get('/captures', controller.listCaptures);
  router.post('/captures', captureLimiter, controller.createCapture);
  router.get('/captures/:id', controller.getCapture);
  router.post('/captures/:id/quote', controller.quoteCapture);
  router.post('/captures/:id/confirm', controller.confirmCapture);
  router.post('/captures/:id/reject', controller.rejectCapture);

  router.get('/tally', controller.tallyPreview);
  router.post('/tally/batches', controller.exportToTally);
  router.get('/tally/batches/:id/file', controller.downloadTallyFile);

  router.get('/van-lists', controller.vanLists);
  return router;
}
