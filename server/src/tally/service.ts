import type { OrderSummary, TallyBatchView, TallyPreview } from '#shared/api';
import { audit, prisma } from '../db.ts';
import { AppError, conflict, notFound } from '../http/errors.ts';
import {
  orderInclude,
  orderLabel,
  toOrderSummary,
  TRANSACTION_OPTIONS,
  type OrderRow,
} from '../orders/service.ts';
import { istCompactDate } from '../time.ts';
import { buildTallyXml, type Voucher } from './voucher.ts';

const batchLabel = (number: number) => `TE-${String(number).padStart(4, '0')}`;

function toBatchView(batch: {
  id: string;
  number: number;
  orderCount: number;
  totalPaise: number;
  createdAt: Date;
}): TallyBatchView {
  return {
    id: batch.id,
    label: batchLabel(batch.number),
    orderCount: batch.orderCount,
    totalPaise: batch.totalPaise,
    createdAt: batch.createdAt.toISOString(),
  };
}

function toVoucher(order: OrderRow): Voucher {
  return {
    number: orderLabel(order.number),
    date: istCompactDate(order.createdAt),
    partyLedger: order.retailer.tallyLedgerName,
    totalPaise: order.totalPaise,
    lines: order.lines,
  };
}

export async function tallyPreview(): Promise<TallyPreview> {
  const [ready, held, batches] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'READY' },
      include: orderInclude,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.order.count({ where: { status: 'CREDIT_HOLD' } }),
    prisma.tallyBatch.findMany({ orderBy: { number: 'desc' }, take: 20 }),
  ]);
  return {
    orders: ready.map((o): OrderSummary => toOrderSummary(o)),
    held,
    batches: batches.map(toBatchView),
  };
}

/**
 * Moving orders to EXPORTED in the same transaction as writing the file is what makes
 * double billing impossible: an order can only ever be in one batch.
 */
export async function createTallyBatch(orderIds: string[], actorId: string): Promise<TallyBatchView> {
  return prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      where: { id: { in: orderIds }, status: 'READY' },
      include: orderInclude,
      orderBy: { number: 'asc' },
    });
    if (orders.length === 0) throw new AppError(400, 'NOTHING_TO_EXPORT', 'No orders are ready to export.');
    if (orders.length !== orderIds.length) {
      throw conflict('ORDERS_CHANGED', 'Some of these orders changed. Please refresh and try again.');
    }

    const batch = await tx.tallyBatch.create({
      data: {
        createdById: actorId,
        orderCount: orders.length,
        totalPaise: orders.reduce((sum, o) => sum + o.totalPaise, 0),
        xml: buildTallyXml(orders.map(toVoucher)),
      },
    });

    const exported = await tx.order.updateMany({
      where: { id: { in: orderIds }, status: 'READY' },
      data: { status: 'EXPORTED', exportedAt: new Date(), tallyBatchId: batch.id },
    });
    if (exported.count !== orders.length) {
      throw conflict('ORDERS_CHANGED', 'Some of these orders changed. Please refresh and try again.');
    }

    // Once in Tally the order is a bill, so its value moves from open orders to outstanding.
    for (const order of orders) {
      await tx.retailer.update({
        where: { id: order.retailerId },
        data: { outstandingPaise: { increment: order.totalPaise } },
      });
      await audit(tx, actorId, 'ORDER_EXPORTED', 'Order', order.id, batchLabel(batch.number));
    }
    return toBatchView(batch);
  }, TRANSACTION_OPTIONS);
}

export async function tallyBatchFile(batchId: string): Promise<{ fileName: string; xml: string }> {
  const batch = await prisma.tallyBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound('Export not found.');
  return { fileName: `tally-${batchLabel(batch.number)}.xml`, xml: batch.xml };
}
