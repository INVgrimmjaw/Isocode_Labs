import type { Prisma } from '../generated/prisma/client.ts';
import type { Database, Db } from '../lib/prisma.ts';
import type { Catalogue, CatalogueSku } from '../types/api.ts';
import { isSchemeActive, type Scheme } from './scheme-engine.ts';

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

export class CatalogueService {
  constructor(private readonly db: Database) {}

  /** The catalogue as one retailer sees it: their own prices and only the schemes running now. */
  async load(retailerId: string, db: Db = this.db): Promise<Catalogue> {
    const skus = await db.sku.findMany({ orderBy: { code: 'asc' } });
    const overrides = await db.retailerPrice.findMany({ where: { retailerId } });
    const schemes = await db.scheme.findMany({ include: { slabs: true }, orderBy: { id: 'asc' } });
    const priceBySku = new Map(overrides.map((o) => [o.skuId, o.unitPricePaise]));
    const now = new Date();

    return {
      skus: skus.map(
        (sku): CatalogueSku => ({
          id: sku.id,
          code: sku.code,
          name: sku.name,
          nameHi: sku.nameHi,
          brand: sku.brand,
          packKind: sku.packKind,
          keywords: sku.keywords,
          unitsPerCase: sku.unitsPerCase,
          unitPricePaise: priceBySku.get(sku.id) ?? sku.dealerPricePaise,
          gstBps: sku.gstBps,
          stockPieces: sku.stockPieces,
        }),
      ),
      schemes: schemes.map(toEngineScheme).filter((s) => isSchemeActive(s, now)),
    };
  }
}
