import type { Database, Db } from '../lib/prisma.ts';
import type { CreditSummary } from '../types/api.ts';

export class CreditService {
  constructor(private readonly db: Database) {}

  /**
   * Credit used is what Tally says is unpaid plus orders released but not yet billed.
   * Held orders are excluded: they have not been approved, so they should not consume credit.
   */
  async summary(
    retailer: { id: string; creditLimitPaise: number; outstandingPaise: number },
    db: Db = this.db,
  ): Promise<CreditSummary> {
    const open = await db.order.aggregate({
      where: { retailerId: retailer.id, status: 'READY' },
      _sum: { totalPaise: true },
    });
    const openOrdersPaise = open._sum.totalPaise ?? 0;
    return {
      limitPaise: retailer.creditLimitPaise,
      outstandingPaise: retailer.outstandingPaise,
      openOrdersPaise,
      availablePaise: Math.max(
        0,
        retailer.creditLimitPaise - retailer.outstandingPaise - openOrdersPaise,
      ),
    };
  }
}
