import type { Prisma } from '../generated/prisma/client.ts';
import { AppError, conflict, notFound } from '../lib/errors.ts';
import { TRANSACTION_OPTIONS, type Database, type Db } from '../lib/prisma.ts';
import type {
  Catalogue,
  OrderDetail,
  OrderSource,
  OrderStatus,
  OrderSummary,
  RetailerHome,
} from '../types/api.ts';
import type { CatalogueService } from './catalogue.service.ts';
import type { CreditService } from './credit.service.ts';
import { priceCart, type CartItem, type Quote } from './scheme-engine.ts';

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

export function toOrderDetail(order: OrderRow): OrderDetail {
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
  };
}

export interface PlaceOrderInput {
  retailerId: string;
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

function priceAgainst(catalogue: Catalogue, items: CartItem[]): Quote {
  const skus = new Map(catalogue.skus.map((s) => [s.id, s]));
  if (items.some((item) => !skus.has(item.skuId))) {
    throw new AppError(400, 'UNKNOWN_SKU', 'An item in this order is no longer sold.');
  }
  return priceCart(items, skus, catalogue.schemes, new Date());
}

export class OrderService {
  constructor(
    private readonly db: Database,
    private readonly catalogue: CatalogueService,
    private readonly credit: CreditService,
  ) {}

  async home(retailerId: string): Promise<RetailerHome> {
    const retailer = await this.db.retailer.findUniqueOrThrow({ where: { id: retailerId } });
    const [catalogue, credit, last] = await Promise.all([
      this.catalogue.load(retailerId),
      this.credit.summary(retailer),
      this.db.order.findFirst({
        where: { retailerId, status: { not: 'REJECTED' } },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { lines: true } } },
      }),
    ]);
    return {
      ...catalogue,
      credit,
      lastOrder: last && { id: last.id, lineCount: last._count.lines, totalPaise: last.totalPaise },
    };
  }

  async quote(retailerId: string, items: CartItem[]): Promise<Quote> {
    return priceAgainst(await this.catalogue.load(retailerId), items);
  }

  /**
   * The single path every order takes, whether tapped in the app or confirmed from a message.
   * The client's total is only a claim to compare against: the price is decided here.
   */
  async placeInTransaction(tx: Prisma.TransactionClient, input: PlaceOrderInput): Promise<OrderRow> {
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

    const catalogue = await this.catalogue.load(retailerId, tx);
    const skus = new Map(catalogue.skus.map((s) => [s.id, s]));
    const quote = priceAgainst(catalogue, input.items);

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
    const credit = await this.credit.summary(retailer, tx);
    const overLimitPaise =
      credit.outstandingPaise + credit.openOrdersPaise + quote.totalPaise - credit.limitPaise;
    const held = overLimitPaise > 0;

    return tx.order.create({
      data: {
        retailerId,
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
            };
          }),
        },
      },
      include: orderInclude,
    });
  }

  place(input: PlaceOrderInput): Promise<OrderDetail> {
    return this.db.$transaction(
      async (tx) => toOrderDetail(await this.placeInTransaction(tx, input)),
      TRANSACTION_OPTIONS,
    );
  }

  async listForRetailer(retailerId: string): Promise<OrderSummary[]> {
    const orders = await this.db.order.findMany({
      where: { retailerId },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return orders.map(toOrderSummary);
  }

  /** A retailer asking for another shop's order gets the same 404 as for one that does not exist. */
  async getForRetailer(retailerId: string, orderId: string): Promise<OrderDetail> {
    const order = await this.db.order.findFirst({
      where: { id: orderId, retailerId },
      include: orderInclude,
    });
    if (!order) throw notFound('Order not found.');
    return toOrderDetail(order);
  }

  async listForDesk(status?: OrderStatus): Promise<OrderSummary[]> {
    const orders = await this.db.order.findMany({
      where: { status },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return orders.map(toOrderSummary);
  }

  async getForDesk(orderId: string, db: Db = this.db): Promise<OrderDetail> {
    const order = await db.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) throw notFound('Order not found.');
    return { ...toOrderDetail(order), credit: await this.credit.summary(order.retailer, db) };
  }

  async releaseHold(orderId: string): Promise<OrderDetail> {
    const released = await this.db.order.updateMany({
      where: { id: orderId, status: 'CREDIT_HOLD' },
      data: { status: 'READY' },
    });
    if (released.count === 0) throw conflict('NOT_ON_HOLD', 'This order is no longer on hold.');
    return this.getForDesk(orderId);
  }

  /** Puts back everything the order took from stock, free cases included. */
  async reject(orderId: string, reason: string): Promise<OrderDetail> {
    await this.db.$transaction(async (tx) => {
      const rejected = await tx.order.updateMany({
        where: { id: orderId, status: { in: ['CREDIT_HOLD', 'READY'] } },
        data: { status: 'REJECTED', rejectedReason: reason },
      });
      if (rejected.count === 0) throw conflict('NOT_REJECTABLE', 'This order can no longer be rejected.');

      const lines = await tx.orderLine.findMany({ where: { orderId }, orderBy: { skuId: 'asc' } });
      for (const line of lines) {
        await tx.sku.update({
          where: { id: line.skuId },
          data: { stockPieces: { increment: line.totalPieces + line.freeCases * line.unitsPerCase } },
        });
      }
    }, TRANSACTION_OPTIONS);
    return this.getForDesk(orderId);
  }
}
