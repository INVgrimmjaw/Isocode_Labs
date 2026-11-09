import type { CreditSummary } from '#shared/api';
import type { Db } from '../db.ts';

/**
 * Credit used is what Tally says is unpaid plus orders released but not yet billed.
 * Held orders are excluded: they have not been approved, so they should not consume credit.
 */
export async function creditSummary(
  db: Db,
  retailer: { id: string; creditLimitPaise: number; outstandingPaise: number },
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
