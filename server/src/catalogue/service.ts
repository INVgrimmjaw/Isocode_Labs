import type { Catalogue, CatalogueSku } from '#shared/api';
import { isSchemeActive, type Scheme } from '#shared/pricing';
import type { Db } from '../db.ts';
import type { Prisma } from '../generated/prisma/client.ts';

type SchemeRow = Prisma.SchemeGetPayload<{ include: { slabs: true } }>;

function toEngineScheme(row: SchemeRow): Scheme {
  const base = {
    id: row.id,
    skuId: row.skuId,
    label: row.label,
    labelHi: row.labelHi,
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo?.toISOString() ?? null,
  };
  if (row.kind === 'FREE_GOODS') {
    return { ...base, kind: 'FREE_GOODS', buyCases: row.buyCases ?? 0, freeCases: row.freeCases ?? 0 };
  }
  return {
    ...base,
    kind: 'SLAB_DISCOUNT',
    slabs: row.slabs.map((s) => ({ minCases: s.minCases, discountBps: s.discountBps })),
  };
}

/** The catalogue as one retailer sees it: their own prices and only the schemes running now. */
export async function loadCatalogue(db: Db, retailerId: string, now = new Date()): Promise<Catalogue> {
  const skus = await db.sku.findMany({
    where: { active: true },
    include: { brand: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  const overrides = await db.retailerPrice.findMany({ where: { retailerId } });
  const schemes = await db.scheme.findMany({
    where: { sku: { active: true } },
    include: { slabs: true },
    orderBy: { id: 'asc' },
  });

  const priceBySku = new Map(overrides.map((o) => [o.skuId, o.unitPricePaise]));

  return {
    skus: skus.map(
      (sku): CatalogueSku => ({
        id: sku.id,
        code: sku.code,
        name: sku.name,
        nameHi: sku.nameHi,
        brand: sku.brand.name,
        category: sku.category,
        family: sku.family,
        packLabel: sku.packLabel,
        packKind: sku.packKind,
        imageUrl: sku.imageUrl,
        unitsPerCase: sku.unitsPerCase,
        unitPricePaise: priceBySku.get(sku.id) ?? sku.dealerPricePaise,
        gstBps: sku.gstBps,
        stockPieces: sku.stockPieces,
      }),
    ),
    schemes: schemes.map(toEngineScheme).filter((s) => isSchemeActive(s, now)),
    asOf: now.toISOString(),
  };
}
