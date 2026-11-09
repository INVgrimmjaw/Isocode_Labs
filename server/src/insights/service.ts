import type { DeskCounts, InactiveRetailer, VanList, VanListResponse } from '#shared/api';
import { prisma } from '../db.ts';
import { orderLabel } from '../orders/service.ts';
import { istDayRange } from '../time.ts';

const DAY_MS = 86_400_000;
export const INACTIVE_AFTER_DAYS = 14;

/** Shops that have gone quiet, longest silence first. A shop that has never ordered comes before them all. */
export async function inactiveRetailers(days = INACTIVE_AFTER_DAYS): Promise<InactiveRetailer[]> {
  const now = Date.now();
  const [retailers, lastOrders] = await Promise.all([
    prisma.retailer.findMany({ orderBy: { shopName: 'asc' } }),
    prisma.order.findMany({
      where: { status: { not: 'REJECTED' } },
      distinct: ['retailerId'],
      orderBy: [{ retailerId: 'asc' }, { createdAt: 'desc' }],
      select: { retailerId: true, createdAt: true, totalPaise: true },
    }),
  ]);
  const lastByRetailer = new Map(lastOrders.map((o) => [o.retailerId, o]));

  return retailers
    .map((r): InactiveRetailer => {
      const last = lastByRetailer.get(r.id);
      return {
        id: r.id,
        shopName: r.shopName,
        ownerName: r.ownerName,
        phone: r.phone,
        area: r.area,
        beat: r.beat,
        lastOrderAt: last?.createdAt.toISOString() ?? null,
        daysSince: last ? Math.floor((now - last.createdAt.getTime()) / DAY_MS) : null,
        lastOrderPaise: last?.totalPaise ?? null,
      };
    })
    .filter((r) => r.daysSince === null || r.daysSince >= days)
    .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity));
}

export async function deskCounts(): Promise<DeskCounts> {
  const [creditHold, ready, captures, inactive] = await Promise.all([
    prisma.order.count({ where: { status: 'CREDIT_HOLD' } }),
    prisma.order.count({ where: { status: 'READY' } }),
    prisma.capture.count({ where: { status: 'NEEDS_REVIEW' } }),
    inactiveRetailers(),
  ]);
  return { creditHold, ready, captures, inactive: inactive.length };
}

/** What each van must carry for one day's orders. Free cases are listed apart so loading can check them. */
export async function vanLists(date: string): Promise<VanListResponse> {
  const { start, end } = istDayRange(date);
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end }, status: { in: ['READY', 'EXPORTED'] } },
    include: { retailer: true, lines: true },
    orderBy: { number: 'asc' },
  });

  const vans = new Map<string, VanList>();
  for (const order of orders) {
    const beat = order.retailer.beat;
    if (!vans.has(beat)) vans.set(beat, { beat, orderCount: 0, lines: [], drops: [] });
    const van = vans.get(beat)!;

    van.orderCount++;
    van.drops.push({
      orderLabel: orderLabel(order.number),
      shopName: order.retailer.shopName,
      area: order.retailer.area,
      items: order.lines.length,
      totalPaise: order.totalPaise,
    });

    for (const line of order.lines) {
      let row = van.lines.find((l) => l.skuCode === line.skuCode);
      if (!row) {
        row = {
          skuCode: line.skuCode,
          skuName: line.skuName,
          cases: 0,
          freeCases: 0,
          pieces: 0,
          unitsPerCase: line.unitsPerCase,
        };
        van.lines.push(row);
      }
      row.cases += line.cases;
      row.pieces += line.pieces;
      row.freeCases += line.freeCases;
    }
  }

  for (const van of vans.values()) {
    for (const row of van.lines) {
      row.cases += Math.floor(row.pieces / row.unitsPerCase);
      row.pieces %= row.unitsPerCase;
    }
    van.lines.sort((a, b) => a.skuCode.localeCompare(b.skuCode));
  }

  return { date, vans: [...vans.values()].sort((a, b) => a.beat.localeCompare(b.beat)) };
}
