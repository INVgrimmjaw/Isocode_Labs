import { AppError, conflict, notFound } from '../lib/errors.ts';
import { TRANSACTION_OPTIONS, type Database } from '../lib/prisma.ts';
import type { TallyBatchView, TallyPreview } from '../types/api.ts';
import { istCompactDate } from '../utils/time.ts';
import { buildTallyXml, type Voucher } from '../utils/tally-xml.ts';
import { orderInclude, orderLabel, toOrderSummary, type OrderRow } from './order.service.ts';

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

export function toVoucher(order: OrderRow): Voucher {
  return {
    number: orderLabel(order.number),
    date: istCompactDate(order.createdAt),
    partyLedger: order.retailer.tallyLedgerName,
    totalPaise: order.totalPaise,
    lines: order.lines,
  };
}

export class TallyService {
  constructor(private readonly db: Database) {}

  async preview(): Promise<TallyPreview> {
    const [ready, held, batches] = await Promise.all([
      this.db.order.findMany({
        where: { status: 'READY' },
        include: orderInclude,
        orderBy: { createdAt: 'asc' },
      }),
      this.db.order.count({ where: { status: 'CREDIT_HOLD' } }),
      this.db.tallyBatch.findMany({ orderBy: { number: 'desc' }, take: 20 }),
    ]);
    return { orders: ready.map(toOrderSummary), held, batches: batches.map(toBatchView) };
  }

  /**
   * Moving orders to EXPORTED in the same transaction as writing the file is what makes
   * double billing impossible: an order can only ever be in one batch.
   */
  async exportReady(): Promise<TallyBatchView> {
    return this.db.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: { status: 'READY' },
        include: orderInclude,
        orderBy: { number: 'asc' },
      });
      if (orders.length === 0) throw new AppError(400, 'NOTHING_TO_EXPORT', 'No orders are ready to export.');

      const batch = await tx.tallyBatch.create({
        data: {
          orderCount: orders.length,
          totalPaise: orders.reduce((sum, o) => sum + o.totalPaise, 0),
          xml: buildTallyXml(orders.map(toVoucher)),
        },
      });

      const exported = await tx.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) }, status: 'READY' },
        data: { status: 'EXPORTED', tallyBatchId: batch.id },
      });
      if (exported.count !== orders.length) {
        throw conflict('ORDERS_CHANGED', 'Some of these orders changed. Please try again.');
      }

      // Once in Tally the order is a bill, so its value moves from open orders to outstanding.
      for (const order of orders) {
        await tx.retailer.update({
          where: { id: order.retailerId },
          data: { outstandingPaise: { increment: order.totalPaise } },
        });
      }
      return toBatchView(batch);
    }, TRANSACTION_OPTIONS);
  }

  async file(batchId: string): Promise<{ fileName: string; xml: string }> {
    const batch = await this.db.tallyBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw notFound('Export not found.');
    return { fileName: `tally-${batchLabel(batch.number)}.xml`, xml: batch.xml };
  }
}
