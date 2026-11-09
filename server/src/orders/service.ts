import type { CreditSummary, OrderDetail, OrderSource, OrderStatus, OrderSummary } from '#shared/api';
import { priceCart, type CartItem, type Quote } from '#shared/pricing';
import { loadCatalogue } from '../catalogue/service.ts';
import { audit, prisma, type Db } from '../db.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { AppError, conflict, notFound } from '../http/errors.ts';
import { creditSummary } from './credit.ts';

export const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

export const orderLabel = (number: number) => `SO-${String(number).padStart(5, '0')}`;

export const orderInclude = { retailer: true, lines: true } satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function toOrderSummary(order: OrderRow): OrderSummary {
  return {
    id: order.id,
    label: orderLabel(order.number),
    status: order.status,
    source: order.source,
    totalPaise: order.totalPaise,
    lineCount: order.lines.length,
    freeCases: order.lines.reduce((sum, l) => sum + l.freeCases, 0),
    createdAt: order.createdAt.toISOString(),
    retailer: {
      id: order.retailer.id,
      shopName: order.retailer.shopName,
      area: order.retailer.area,
      beat: order.retailer.beat,
    },
  };
}

const EVENT_LABELS: Record<string, string> = {
  HOLD_RELEASED: 'Credit hold released',
  ORDER_REJECTED: 'Order rejected',
  ORDER_EXPORTED: 'Exported to Tally',
  CAPTURE_CONFIRMED: 'Confirmed from a message',
};

export async function toOrderDetail(db: Db, order: OrderRow, withCredit: boolean): Promise<OrderDetail> {
  const capture = await db.capture.findUnique({ where: { orderId: order.id }, select: { id: true } });
  const events = await db.auditEvent.findMany({
    where: { entityType: 'Order', entityId: order.id },
    orderBy: { createdAt: 'asc' },
  });
  const actors = await db.user.findMany({
    where: { id: { in: [...new Set(events.map((e) => e.actorId))] } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(actors.map((a) => [a.id, a.name]));

  let credit: CreditSummary | undefined;
  if (withCredit) credit = await creditSummary(db, order.retailer);

  return {
    ...toOrderSummary(order),
    lines: order.lines.map((l) => ({
      skuId: l.skuId,
      skuCode: l.skuCode,
      skuName: l.skuName,
      unitsPerCase: l.unitsPerCase,
      cases: l.cases,
      pieces: l.pieces,
      freeCases: l.freeCases,
      unitPricePaise: l.unitPricePaise,
      gstBps: l.gstBps,
      grossPaise: l.grossPaise,
      discountPaise: l.discountPaise,
      taxablePaise: l.taxablePaise,
      gstPaise: l.gstPaise,
      totalPaise: l.totalPaise,
      schemeLabel: l.schemeLabel,
    })),
    grossPaise: order.grossPaise,
    discountPaise: order.discountPaise,
    taxablePaise: order.taxablePaise,
    gstPaise: order.gstPaise,
    overLimitPaise: order.overLimitPaise,
    rejectedReason: order.rejectedReason,
    exportedAt: order.exportedAt?.toISOString() ?? null,
    captureId: capture?.id ?? null,
    events: events.map((e) => ({
      action: EVENT_LABELS[e.action] ?? e.action,
      actorName: nameOf.get(e.actorId) ?? 'Unknown',
      detail: typeof e.detail === 'string' ? e.detail : null,
      at: e.createdAt.toISOString(),
    })),
    ...(credit ? { credit } : {}),
  };
}

export interface PlaceOrderInput {
  retailerId: string;
  placedById: string;
  items: CartItem[];
  source: OrderSource;
  idempotencyKey?: string;
  expectedTotalPaise: number;
}

function stockChanged(quote: Quote) {
  return conflict('STOCK_CHANGED', 'Stock changed while you were ordering. Please check your items.', {
    lines: quote.lines
      .filter((l) => l.stock !== 'OK')
      .map((l) => ({ skuId: l.skuId, stock: l.stock, availablePieces: l.availablePieces })),
  });
}

/**
 * The single path every order takes, whether tapped in the app or confirmed from a message.
 * The client's total is only a claim to compare against: the price is decided here.
 */
export async function placeOrderInTransaction(
  tx: Prisma.TransactionClient,
  input: PlaceOrderInput,
): Promise<OrderRow> {
  const { retailerId } = input;

  // Serialises one shop's orders, so a double tap or two phones cannot both pass the credit check.
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Retailer" WHERE id = ${retailerId} FOR UPDATE`;
  if (locked.length === 0) throw notFound('Retailer not found.');

  const idempotencyKey = input.idempotencyKey ? `${retailerId}:${input.idempotencyKey}` : undefined;
  if (idempotencyKey) {
    const existing = await tx.order.findUnique({ where: { idempotencyKey }, include: orderInclude });
    if (existing) return existing;
  }

  const catalogue = await loadCatalogue(tx, retailerId);
  const skus = new Map(catalogue.skus.map((s) => [s.id, s]));
  if (input.items.some((item) => !skus.has(item.skuId))) {
    throw new AppError(400, 'UNKNOWN_SKU', 'An item in this order is no longer sold.');
  }

  const quote = priceCart(input.items, skus, catalogue.schemes, new Date());
  if (quote.lines.length === 0) throw new AppError(400, 'EMPTY_ORDER', 'This order has no items.');
  if (quote.blocked) throw stockChanged(quote);
  if (quote.totalPaise !== input.expectedTotalPaise) {
    throw conflict('PRICE_CHANGED', 'Prices or schemes changed. Please check the new total.', {
      totalPaise: quote.totalPaise,
    });
  }

  // Sorted so two orders touching the same SKUs always lock them in the same order.
  for (const line of [...quote.lines].sort((a, b) => a.skuId.localeCompare(b.skuId))) {
    const sku = skus.get(line.skuId)!;
    const pieces = line.totalPieces + line.freeCases * sku.unitsPerCase;
    const taken = await tx.sku.updateMany({
      where: { id: line.skuId, stockPieces: { gte: pieces } },
      data: { stockPieces: { decrement: pieces } },
    });
    if (taken.count === 0) throw stockChanged(quote);
  }

  const retailer = await tx.retailer.findUniqueOrThrow({ where: { id: retailerId } });
  const credit = await creditSummary(tx, retailer);
  const overLimitPaise =
    credit.outstandingPaise + credit.openOrdersPaise + quote.totalPaise - credit.limitPaise;
  const held = overLimitPaise > 0;

  return tx.order.create({
    data: {
      retailerId,
      placedById: input.placedById,
      source: input.source,
      status: held ? 'CREDIT_HOLD' : 'READY',
      idempotencyKey,
      overLimitPaise: held ? overLimitPaise : null,
      grossPaise: quote.grossPaise,
      discountPaise: quote.discountPaise,
      taxablePaise: quote.taxablePaise,
      gstPaise: quote.gstPaise,
      totalPaise: quote.totalPaise,
      lines: {
        create: quote.lines.map((line) => {
          const sku = skus.get(line.skuId)!;
          return {
            skuId: sku.id,
            skuCode: sku.code,
            skuName: sku.name,
            unitsPerCase: sku.unitsPerCase,
            cases: line.cases,
            pieces: line.pieces,
            totalPieces: line.totalPieces,
            freeCases: line.freeCases,
            unitPricePaise: sku.unitPricePaise,
            gstBps: sku.gstBps,
            grossPaise: line.grossPaise,
            discountPaise: line.discountPaise,
            taxablePaise: line.taxablePaise,
            gstPaise: line.gstPaise,
            totalPaise: line.totalPaise,
            schemeLabel: line.applied?.label ?? null,
            schemeKind: line.applied?.kind ?? null,
          };
        }),
      },
    },
    include: orderInclude,
  });
}

export function placeOrder(input: PlaceOrderInput): Promise<OrderDetail> {
  return prisma.$transaction(async (tx) => {
    const order = await placeOrderInTransaction(tx, input);
    return toOrderDetail(tx, order, false);
  }, TRANSACTION_OPTIONS);
}

export async function listRetailerOrders(retailerId: string): Promise<OrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: { retailerId },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return orders.map(toOrderSummary);
}

/** A retailer asking for another shop's order gets the same 404 as for one that does not exist. */
export async function getRetailerOrder(retailerId: string, orderId: string): Promise<OrderDetail> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, retailerId },
    include: orderInclude,
  });
  if (!order) throw notFound('Order not found.');
  return toOrderDetail(prisma, order, false);
}

export async function listDeskOrders(filter: {
  status?: OrderStatus;
  search?: string;
}): Promise<OrderSummary[]> {
  const search = filter.search?.trim();
  const number = search ? Number(search.replace(/^so-?/i, '')) : NaN;
  const orders = await prisma.order.findMany({
    where: {
      status: filter.status,
      ...(search
        ? {
            OR: [
              { retailer: { shopName: { contains: search, mode: 'insensitive' as const } } },
              ...(Number.isInteger(number) ? [{ number }] : []),
            ],
          }
        : {}),
    },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return orders.map(toOrderSummary);
}

export async function getDeskOrder(orderId: string): Promise<OrderDetail> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw notFound('Order not found.');
  return toOrderDetail(prisma, order, true);
}

export async function releaseHold(orderId: string, actorId: string): Promise<OrderDetail> {
  await prisma.$transaction(async (tx) => {
    const released = await tx.order.updateMany({
      where: { id: orderId, status: 'CREDIT_HOLD' },
      data: { status: 'READY', decidedById: actorId, decidedAt: new Date() },
    });
    if (released.count === 0) throw conflict('NOT_ON_HOLD', 'This order is no longer on hold.');
    await audit(tx, actorId, 'HOLD_RELEASED', 'Order', orderId);
  }, TRANSACTION_OPTIONS);
  return getDeskOrder(orderId);
}

/** Puts back everything the order took from stock, free cases included. */
export async function rejectOrder(orderId: string, actorId: string, reason: string): Promise<OrderDetail> {
  await prisma.$transaction(async (tx) => {
    const rejected = await tx.order.updateMany({
      where: { id: orderId, status: { in: ['CREDIT_HOLD', 'READY'] } },
      data: { status: 'REJECTED', rejectedReason: reason, decidedById: actorId, decidedAt: new Date() },
    });
    if (rejected.count === 0) throw conflict('NOT_REJECTABLE', 'This order can no longer be rejected.');

    const lines = await tx.orderLine.findMany({ where: { orderId }, orderBy: { skuId: 'asc' } });
    for (const line of lines) {
      await tx.sku.update({
        where: { id: line.skuId },
        data: { stockPieces: { increment: line.totalPieces + line.freeCases * line.unitsPerCase } },
      });
    }
    await audit(tx, actorId, 'ORDER_REJECTED', 'Order', orderId, reason);
  }, TRANSACTION_OPTIONS);
  return getDeskOrder(orderId);
}
