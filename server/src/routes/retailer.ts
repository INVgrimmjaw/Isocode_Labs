import { Router } from 'express';
import { z } from 'zod';
import type { RetailerHome } from '#shared/api';
import { createCapture, confirmCapture, getCapture, rejectCapture } from '../capture/service.ts';
import { loadCatalogue } from '../catalogue/service.ts';
import { prisma } from '../db.ts';
import { captureLimiter } from '../http/limits.ts';
import { currentRetailerId, currentUser, requireRole } from '../http/session.ts';
import { creditSummary } from '../orders/credit.ts';
import { getRetailerOrder, listRetailerOrders, orderLabel, placeOrder } from '../orders/service.ts';
import { captureText, confirmCaptureBody, idParam, placeOrderBody } from './schemas.ts';

const USUAL_ITEMS = 8;

export const retailerRouter = Router();

retailerRouter.use(requireRole('RETAILER'));

retailerRouter.get('/home', async (req, res) => {
  const retailerId = currentRetailerId(req);
  const retailer = await prisma.retailer.findUniqueOrThrow({ where: { id: retailerId } });
  const [catalogue, credit, last, usual] = await Promise.all([
    loadCatalogue(prisma, retailerId),
    creditSummary(prisma, retailer),
    prisma.order.findFirst({
      where: { retailerId, status: { not: 'REJECTED' } },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { lines: true } } },
    }),
    prisma.orderLine.groupBy({
      by: ['skuId'],
      where: { order: { retailerId, status: { not: 'REJECTED' } } },
      _count: { skuId: true },
      orderBy: { _count: { skuId: 'desc' } },
      take: USUAL_ITEMS,
    }),
  ]);
  const home: RetailerHome = {
    ...catalogue,
    credit,
    usualSkuIds: usual.map((row) => row.skuId),
    lastOrder: last && {
      id: last.id,
      label: orderLabel(last.number),
      lineCount: last._count.lines,
      totalPaise: last.totalPaise,
      createdAt: last.createdAt.toISOString(),
    },
  };
  res.json(home);
});

retailerRouter.get('/orders', async (req, res) => {
  res.json(await listRetailerOrders(currentRetailerId(req)));
});

retailerRouter.get('/orders/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await getRetailerOrder(currentRetailerId(req), id));
});

retailerRouter.post('/orders', async (req, res) => {
  const body = placeOrderBody.parse(req.body);
  const order = await placeOrder({
    retailerId: currentRetailerId(req),
    placedById: currentUser(req).id,
    items: body.items,
    source: 'APP',
    idempotencyKey: body.idempotencyKey,
    expectedTotalPaise: body.expectedTotalPaise,
  });
  res.status(201).json(order);
});

retailerRouter.post('/captures', captureLimiter, async (req, res) => {
  const { text } = z.object({ text: captureText }).parse(req.body);
  const capture = await createCapture({ retailerId: currentRetailerId(req), text, channel: 'APP' });
  res.status(201).json(capture);
});

retailerRouter.get('/captures/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await getCapture(id, currentRetailerId(req)));
});

retailerRouter.post('/captures/:id/confirm', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const body = confirmCaptureBody.parse(req.body);
  const result = await confirmCapture({
    captureId: id,
    actor: currentUser(req),
    retailerId: currentRetailerId(req),
    body,
  });
  res.json(result);
});

retailerRouter.post('/captures/:id/discard', async (req, res) => {
  const { id } = idParam.parse(req.params);
  await rejectCapture(id, currentUser(req).id, currentRetailerId(req));
  res.status(204).end();
});
