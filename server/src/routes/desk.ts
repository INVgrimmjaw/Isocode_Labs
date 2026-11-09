import { Router } from 'express';
import { z } from 'zod';
import type { RetailerOption } from '#shared/api';
import { createCapture, confirmCapture, getCapture, listCaptures, rejectCapture } from '../capture/service.ts';
import { prisma } from '../db.ts';
import { deskCounts, inactiveRetailers, vanLists } from '../insights/service.ts';
import { captureLimiter } from '../http/limits.ts';
import { currentUser, requireRole } from '../http/session.ts';
import { getDeskOrder, listDeskOrders, rejectOrder, releaseHold } from '../orders/service.ts';
import { createTallyBatch, tallyBatchFile, tallyPreview } from '../tally/service.ts';
import { istDateKey } from '../time.ts';
import { captureText, confirmCaptureBody, idParam } from './schemas.ts';

export const deskRouter = Router();

deskRouter.use(requireRole('DESK'));

deskRouter.get('/counts', async (_req, res) => {
  res.json(await deskCounts());
});

deskRouter.get('/orders', async (req, res) => {
  const query = z
    .object({
      status: z.enum(['CREDIT_HOLD', 'READY', 'EXPORTED', 'REJECTED']).optional(),
      q: z.string().max(80).optional(),
    })
    .parse(req.query);
  res.json(await listDeskOrders({ status: query.status, search: query.q }));
});

deskRouter.get('/orders/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await getDeskOrder(id));
});

deskRouter.post('/orders/:id/release', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await releaseHold(id, currentUser(req).id));
});

deskRouter.post('/orders/:id/reject', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
  res.json(await rejectOrder(id, currentUser(req).id, reason));
});

deskRouter.get('/retailers', async (_req, res) => {
  const retailers = await prisma.retailer.findMany({
    orderBy: { shopName: 'asc' },
    select: { id: true, shopName: true, area: true },
  });
  res.json(retailers satisfies RetailerOption[]);
});

deskRouter.get('/retailers/inactive', async (_req, res) => {
  res.json(await inactiveRetailers());
});

deskRouter.get('/captures', async (req, res) => {
  const { status } = z
    .object({ status: z.enum(['NEEDS_REVIEW', 'CONFIRMED', 'REJECTED']).default('NEEDS_REVIEW') })
    .parse(req.query);
  res.json(await listCaptures(status));
});

deskRouter.post('/captures', captureLimiter, async (req, res) => {
  const body = z.object({ retailerId: z.string().min(1).max(64), text: captureText }).parse(req.body);
  const retailer = await prisma.retailer.findUnique({ where: { id: body.retailerId } });
  if (!retailer) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Shop not found.' } });
    return;
  }
  const capture = await createCapture({ retailerId: retailer.id, text: body.text, channel: 'WHATSAPP' });
  res.status(201).json(capture);
});

deskRouter.get('/captures/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await getCapture(id));
});

deskRouter.post('/captures/:id/confirm', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const body = confirmCaptureBody.parse(req.body);
  res.json(await confirmCapture({ captureId: id, actor: currentUser(req), body }));
});

deskRouter.post('/captures/:id/reject', async (req, res) => {
  const { id } = idParam.parse(req.params);
  await rejectCapture(id, currentUser(req).id);
  res.status(204).end();
});

deskRouter.get('/tally', async (_req, res) => {
  res.json(await tallyPreview());
});

deskRouter.post('/tally/batches', async (req, res) => {
  const { orderIds } = z
    .object({ orderIds: z.array(z.string().min(1).max(64)).min(1).max(500) })
    .parse(req.body);
  res.status(201).json(await createTallyBatch(orderIds, currentUser(req).id));
});

deskRouter.get('/tally/batches/:id/file', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { fileName, xml } = await tallyBatchFile(id);
  res.type('application/xml').attachment(fileName).send(xml);
});

deskRouter.get('/van-lists', async (req, res) => {
  const { date } = z
    .object({ date: z.iso.date().optional() })
    .parse(req.query);
  res.json(await vanLists(date ?? istDateKey(new Date())));
});
