import { rupeesToPaise } from '../shared/money.ts';
import { priceCart, type CartItem } from '../shared/pricing.ts';
import { createCapture } from '../server/src/capture/service.ts';
import { loadCatalogue } from '../server/src/catalogue/service.ts';
import { config } from '../server/src/config.ts';
import { prisma } from '../server/src/db.ts';
import { orderLabel, placeOrder } from '../server/src/orders/service.ts';
import { buildTallyXml } from '../server/src/tally/voucher.ts';
import { istCompactDate } from '../server/src/time.ts';
import {
  BRANDS,
  DESK_USER,
  RETAILERS,
  SEED_ALIAS,
  SEED_MESSAGES,
  SKUS,
  type SeedRetailer,
} from './seed-data.ts';

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 60;
/** Enough stock that history cannot run out. Real counts are written once all orders exist. */
const AMPLE_STOCK_CASES = 100_000;

const TABLES = [
  'AuditEvent',
  'CaptureLine',
  'Capture',
  'OrderLine',
  'Order',
  'TallyBatch',
  'RetailerAlias',
  'SchemeSlab',
  'Scheme',
  'RetailerPrice',
  'Sku',
  'Brand',
  'Session',
  'OtpChallenge',
  'User',
  'Retailer',
];

/** Small and seeded, so a reviewer sees the same demo every time it is reset. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function wipe() {
  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function createCatalogue(now: Date) {
  const brands = new Map<string, string>();
  for (const name of BRANDS) {
    const brand = await prisma.brand.create({ data: { name } });
    brands.set(name, brand.id);
  }

  const skuIds = new Map<string, string>();
  for (const seed of SKUS) {
    const sku = await prisma.sku.create({
      data: {
        code: seed.code,
        name: seed.name,
        nameHi: seed.nameHi,
        brandId: brands.get(seed.brand)!,
        category: seed.category,
        family: seed.family,
        packLabel: seed.packLabel,
        sizeGrams: seed.sizeGrams,
        unitsPerCase: seed.unitsPerCase,
        dealerPricePaise: rupeesToPaise(seed.dealerPrice),
        gstBps: seed.gstPercent * 100,
        stockPieces: AMPLE_STOCK_CASES * seed.unitsPerCase,
        keywords: seed.keywords,
        packKind: seed.packKind,
      },
    });
    skuIds.set(seed.code, sku.id);

    if (seed.scheme) {
      await prisma.scheme.create({
        data: {
          skuId: sku.id,
          kind: seed.scheme.kind,
          label: seed.scheme.label,
          labelHi: seed.scheme.labelHi,
          buyCases: seed.scheme.buyCases,
          freeCases: seed.scheme.freeCases,
          validFrom: new Date(now.getTime() - HISTORY_DAYS * DAY_MS),
          slabs: {
            create: seed.scheme.slabs?.map((s) => ({
              minCases: s.minCases,
              discountBps: s.discountPercent * 100,
            })),
          },
        },
      });
    }
  }
  return skuIds;
}

async function createRetailers(skuIds: Map<string, string>) {
  const ids = new Map<string, string>();
  for (const seed of RETAILERS) {
    const retailer = await prisma.retailer.create({
      data: {
        code: seed.code,
        shopName: seed.shopName,
        ownerName: seed.ownerName,
        phone: seed.phone,
        area: seed.area,
        beat: seed.beat,
        tallyLedgerName: `${seed.shopName}, ${seed.area}`,
        creditLimitPaise: rupeesToPaise(seed.creditLimit),
        outstandingPaise: rupeesToPaise(seed.outstanding),
        users: { create: { phone: seed.phone, name: seed.ownerName, role: 'RETAILER' } },
        prices: {
          create: Object.entries(seed.specialPrices ?? {}).map(([code, price]) => ({
            skuId: skuIds.get(code)!,
            unitPricePaise: rupeesToPaise(price),
          })),
        },
      },
    });
    ids.set(seed.code, retailer.id);
  }
  return ids;
}

interface PlannedOrder {
  retailer: SeedRetailer;
  at: Date;
  items: { code: string; cases: number }[];
}

function planHistory(now: Date): PlannedOrder[] {
  const random = seededRandom(1800);
  const plans: PlannedOrder[] = [];

  for (const retailer of RETAILERS) {
    if (retailer.lastOrderDaysAgo === null) continue;
    for (let daysAgo = retailer.lastOrderDaysAgo; daysAgo <= HISTORY_DAYS; daysAgo += retailer.cadence) {
      const items = retailer.habits
        .filter(() => random() > 0.25)
        .map(([code, typical]) => ({ code, cases: Math.max(1, typical + Math.round(random() * 2) - 1) }));
      if (items.length === 0) continue;
      // Between 10:00 and 19:00, so history reads like a working day.
      const hour = 10 + Math.floor(random() * 9);
      const at = new Date(now.getTime() - daysAgo * DAY_MS);
      at.setUTCHours(hour - 5, 30, 0, 0);
      plans.push({ retailer, at, items });
    }
  }
  return plans.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** History is billed already, so it is written directly as EXPORTED and takes no stock. */
async function createHistory(
  now: Date,
  retailerIds: Map<string, string>,
  skuIds: Map<string, string>,
  placedById: string,
) {
  const orderIds: { id: string; at: Date }[] = [];
  for (const plan of planHistory(now)) {
    const retailerId = retailerIds.get(plan.retailer.code)!;
    const catalogue = await loadCatalogue(prisma, retailerId);
    const skus = new Map(catalogue.skus.map((s) => [s.id, s]));
    const items: CartItem[] = plan.items.map((i) => ({
      skuId: skuIds.get(i.code)!,
      cases: i.cases,
      pieces: 0,
    }));
    const quote = priceCart(items, skus, catalogue.schemes, now);

    const order = await prisma.order.create({
      data: {
        retailerId,
        placedById,
        status: 'EXPORTED',
        source: 'APP',
        createdAt: plan.at,
        exportedAt: new Date(plan.at.getTime() + DAY_MS / 2),
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
    });
    orderIds.push({ id: order.id, at: plan.at });
  }
  return orderIds;
}

async function createPastBatch(orderIds: { id: string; at: Date }[], now: Date, createdById: string) {
  const ids = orderIds.filter((o) => now.getTime() - o.at.getTime() > 2 * DAY_MS).slice(-6).map((o) => o.id);
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    include: { retailer: true, lines: true },
    orderBy: { number: 'asc' },
  });
  const batch = await prisma.tallyBatch.create({
    data: {
      createdById,
      orderCount: orders.length,
      totalPaise: orders.reduce((sum, o) => sum + o.totalPaise, 0),
      xml: buildTallyXml(
        orders.map((o) => ({
          number: orderLabel(o.number),
          date: istCompactDate(o.createdAt),
          partyLedger: o.retailer.tallyLedgerName,
          totalPaise: o.totalPaise,
          lines: o.lines,
        })),
      ),
    },
  });
  await prisma.order.updateMany({ where: { id: { in: ids } }, data: { tallyBatchId: batch.id } });
}

/** Today's orders go through the real placement path, so credit holds are computed, not invented. */
async function placeTodaysOrders(
  retailerIds: Map<string, string>,
  skuIds: Map<string, string>,
  userIds: Map<string, string>,
) {
  const planned: [string, [string, number][]][] = [
    ['R-1001', [['SKU-BS-075', 10], ['SKU-NM-040', 2]]],
    ['R-1003', [['SKU-BS-200', 3], ['SKU-DT-1KG', 5]]],
    ['R-1005', [['SKU-CB-075', 5], ['SKU-DW-500', 2], ['SKU-ND-070', 3]]],
    ['R-1004', [['SKU-DB-150', 2], ['SKU-SP-100', 1]]],
    ['R-1002', [['SKU-TE-100', 2], ['SKU-BS-075', 3]]],
    ['R-1006', [['SKU-BS-075', 4], ['SKU-NM-040', 3]]],
  ];

  for (const [code, lines] of planned) {
    const retailerId = retailerIds.get(code)!;
    const catalogue = await loadCatalogue(prisma, retailerId);
    const items: CartItem[] = lines.map(([sku, cases]) => ({ skuId: skuIds.get(sku)!, cases, pieces: 0 }));
    const quote = priceCart(
      items,
      new Map(catalogue.skus.map((s) => [s.id, s])),
      catalogue.schemes,
      new Date(),
    );
    await placeOrder({
      retailerId,
      placedById: userIds.get(code)!,
      items,
      source: 'APP',
      expectedTotalPaise: quote.totalPaise,
    });
  }
}

async function applyRealStock() {
  for (const seed of SKUS) {
    await prisma.sku.update({
      where: { code: seed.code },
      data: { stockPieces: seed.stockCases * seed.unitsPerCase },
    });
  }
}

async function main() {
  if (config.isProduction && !config.demoMode) {
    throw new Error('Refusing to seed: this wipes every table and DEMO_MODE is not on.');
  }

  const now = new Date();
  await wipe();

  const skuIds = await createCatalogue(now);
  const retailerIds = await createRetailers(skuIds);
  const desk = await prisma.user.create({ data: { ...DESK_USER, role: 'DESK' } });

  const users = await prisma.user.findMany({ where: { role: 'RETAILER' }, include: { retailer: true } });
  const userIds = new Map(users.map((u) => [u.retailer!.code, u.id]));

  const history = await createHistory(now, retailerIds, skuIds, desk.id);
  await createPastBatch(history, now, desk.id);
  await placeTodaysOrders(retailerIds, skuIds, userIds);
  await applyRealStock();

  await prisma.retailerAlias.create({
    data: {
      retailerId: retailerIds.get(SEED_ALIAS.retailerCode)!,
      phrase: SEED_ALIAS.phrase,
      skuId: skuIds.get(SEED_ALIAS.skuCode)!,
      createdById: desk.id,
    },
  });

  for (const message of SEED_MESSAGES) {
    await createCapture({
      retailerId: retailerIds.get(message.retailerCode)!,
      text: message.text,
      channel: 'WHATSAPP',
    });
  }

  const orders = await prisma.order.groupBy({ by: ['status'], _count: true });
  console.log(`Seeded ${SKUS.length} SKUs and ${RETAILERS.length} shops.`);
  console.log('Orders:', Object.fromEntries(orders.map((o) => [o.status, o._count])));
}

await main().finally(() => prisma.$disconnect());
