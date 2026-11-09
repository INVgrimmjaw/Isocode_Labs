import { percentOf, type Paise } from './money.ts';

/**
 * The scheme engine. A pure function of its inputs, so the browser can price a cart
 * instantly on a slow connection while the server re-runs the same code as the authority.
 *
 * The rules, each covered in pricing.test.ts:
 * - Schemes are measured in whole cases. Loose pieces count only once they add up to a case.
 * - Free goods repeat: buy 10 get 1 means 20 earns 2 and 19 earns 1.
 * - Stock goes to paid goods first. Free cases are granted from what is left.
 * - A slab discount applies to the whole line once its threshold is reached. The highest slab wins.
 * - Schemes never stack. If two are active on a SKU, the one worth more to the retailer applies.
 * - GST is charged on the value after discount. Free goods carry no charge in this estimate.
 * - A line that stock cannot fulfil is priced at nothing and blocks the order until fixed.
 */

export type SchemeKind = 'FREE_GOODS' | 'SLAB_DISCOUNT';

interface SchemeBase {
  id: string;
  skuId: string;
  label: string;
  labelHi: string;
  /** ISO timestamps. validTo is exclusive and null when open-ended. */
  validFrom: string;
  validTo: string | null;
}

export interface FreeGoodsScheme extends SchemeBase {
  kind: 'FREE_GOODS';
  buyCases: number;
  freeCases: number;
}

export interface SlabScheme extends SchemeBase {
  kind: 'SLAB_DISCOUNT';
  slabs: { minCases: number; discountBps: number }[];
}

export type Scheme = FreeGoodsScheme | SlabScheme;

export interface PricingSku {
  id: string;
  unitsPerCase: number;
  /** This retailer's price per piece, excluding GST. */
  unitPricePaise: Paise;
  gstBps: number;
  stockPieces: number;
}

export interface CartItem {
  skuId: string;
  cases: number;
  pieces: number;
}

export type LineStock = 'OK' | 'SHORT' | 'OUT';

export interface AppliedScheme {
  id: string;
  kind: SchemeKind;
  label: string;
  labelHi: string;
}

/** The nearest reward the retailer could reach by adding cases to this line. */
export interface Nudge {
  kind: SchemeKind;
  casesToAdd: number;
  freeCases: number;
  discountBps: number;
}

export interface PricedLine {
  skuId: string;
  cases: number;
  pieces: number;
  totalPieces: number;
  fullCases: number;
  grossPaise: Paise;
  discountPaise: Paise;
  taxablePaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
  freeCases: number;
  /** Free cases earned that stock could not cover. */
  freeCasesShort: number;
  applied: AppliedScheme | null;
  nudge: Nudge | null;
  stock: LineStock;
  availablePieces: number;
}

export interface Quote {
  lines: PricedLine[];
  grossPaise: Paise;
  discountPaise: Paise;
  taxablePaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
  freeCases: number;
  /** True when at least one line cannot be fulfilled as entered. */
  blocked: boolean;
}

export function isSchemeActive(scheme: Scheme, now: Date): boolean {
  const at = now.getTime();
  if (at < Date.parse(scheme.validFrom)) return false;
  return scheme.validTo === null || at < Date.parse(scheme.validTo);
}

interface SchemeOutcome {
  scheme: Scheme;
  valuePaise: Paise;
  discountPaise: Paise;
  freeCases: number;
  freeCasesShort: number;
}

function evaluate(
  scheme: Scheme,
  sku: PricingSku,
  fullCases: number,
  totalPieces: number,
  grossPaise: Paise,
): SchemeOutcome {
  if (scheme.kind === 'FREE_GOODS') {
    const earned = Math.floor(fullCases / scheme.buyCases) * scheme.freeCases;
    const spareCases = Math.floor(Math.max(0, sku.stockPieces - totalPieces) / sku.unitsPerCase);
    const granted = Math.min(earned, spareCases);
    return {
      scheme,
      valuePaise: granted * sku.unitsPerCase * sku.unitPricePaise,
      discountPaise: 0,
      freeCases: granted,
      freeCasesShort: earned - granted,
    };
  }
  const slab = highestSlabReached(scheme, fullCases);
  const discountPaise = slab ? percentOf(grossPaise, slab.discountBps) : 0;
  return { scheme, valuePaise: discountPaise, discountPaise, freeCases: 0, freeCasesShort: 0 };
}

function highestSlabReached(scheme: SlabScheme, fullCases: number) {
  return scheme.slabs
    .filter((slab) => slab.minCases <= fullCases)
    .sort((a, b) => b.minCases - a.minCases)[0];
}

function pickBest(outcomes: SchemeOutcome[]): SchemeOutcome | undefined {
  return outcomes
    .filter((o) => o.valuePaise > 0 || o.freeCasesShort > 0)
    .sort((a, b) => b.valuePaise - a.valuePaise || a.scheme.id.localeCompare(b.scheme.id))[0];
}

/** Worth showing only when the next reward is within half of its threshold and stock can honour it. */
function nearestNudge(schemes: Scheme[], sku: PricingSku, fullCases: number): Nudge | null {
  if (fullCases === 0) return null;
  const candidates: Nudge[] = [];

  for (const scheme of schemes) {
    if (scheme.kind === 'FREE_GOODS') {
      const casesToAdd = scheme.buyCases - (fullCases % scheme.buyCases);
      const target = fullCases + casesToAdd;
      const earned = Math.floor(target / scheme.buyCases) * scheme.freeCases;
      const reachable = (target + earned) * sku.unitsPerCase <= sku.stockPieces;
      if (reachable && casesToAdd <= Math.ceil(scheme.buyCases / 2)) {
        candidates.push({
          kind: 'FREE_GOODS',
          casesToAdd,
          freeCases: scheme.freeCases,
          discountBps: 0,
        });
      }
    } else {
      const next = scheme.slabs
        .filter((slab) => slab.minCases > fullCases)
        .sort((a, b) => a.minCases - b.minCases)[0];
      if (!next) continue;
      const casesToAdd = next.minCases - fullCases;
      const reachable = next.minCases * sku.unitsPerCase <= sku.stockPieces;
      if (reachable && casesToAdd <= Math.ceil(next.minCases / 2)) {
        candidates.push({
          kind: 'SLAB_DISCOUNT',
          casesToAdd,
          freeCases: 0,
          discountBps: next.discountBps,
        });
      }
    }
  }
  return candidates.sort((a, b) => a.casesToAdd - b.casesToAdd)[0] ?? null;
}

/** Scheme thresholds apply to the SKU's total, so split entries must be combined first. */
function mergeBySku(items: CartItem[]): CartItem[] {
  const merged = new Map<string, CartItem>();
  for (const item of items) {
    const existing = merged.get(item.skuId);
    if (existing) {
      existing.cases += item.cases;
      existing.pieces += item.pieces;
    } else {
      merged.set(item.skuId, { ...item });
    }
  }
  return [...merged.values()];
}

function priceLine(item: CartItem, sku: PricingSku, schemes: Scheme[], now: Date): PricedLine {
  const totalPieces = item.cases * sku.unitsPerCase + item.pieces;
  const fullCases = Math.floor(totalPieces / sku.unitsPerCase);
  const stock: LineStock =
    sku.stockPieces === 0 ? 'OUT' : totalPieces > sku.stockPieces ? 'SHORT' : 'OK';

  const base = {
    skuId: item.skuId,
    cases: item.cases,
    pieces: item.pieces,
    totalPieces,
    fullCases,
    stock,
    availablePieces: sku.stockPieces,
  };

  if (stock !== 'OK') {
    return {
      ...base,
      grossPaise: 0,
      discountPaise: 0,
      taxablePaise: 0,
      gstPaise: 0,
      totalPaise: 0,
      freeCases: 0,
      freeCasesShort: 0,
      applied: null,
      nudge: null,
    };
  }

  const active = schemes.filter((s) => s.skuId === sku.id && isSchemeActive(s, now));
  const grossPaise = totalPieces * sku.unitPricePaise;
  const best = pickBest(
    active.map((s) => evaluate(s, sku, fullCases, totalPieces, grossPaise)),
  );

  const discountPaise = best?.discountPaise ?? 0;
  const taxablePaise = grossPaise - discountPaise;
  const gstPaise = percentOf(taxablePaise, sku.gstBps);

  return {
    ...base,
    grossPaise,
    discountPaise,
    taxablePaise,
    gstPaise,
    totalPaise: taxablePaise + gstPaise,
    freeCases: best?.freeCases ?? 0,
    freeCasesShort: best?.freeCasesShort ?? 0,
    applied: best
      ? {
          id: best.scheme.id,
          kind: best.scheme.kind,
          label: best.scheme.label,
          labelHi: best.scheme.labelHi,
        }
      : null,
    nudge: nearestNudge(active, sku, fullCases),
  };
}

export function priceCart(
  items: CartItem[],
  skus: ReadonlyMap<string, PricingSku>,
  schemes: Scheme[],
  now: Date,
): Quote {
  const lines = mergeBySku(items)
    .filter((item) => item.cases > 0 || item.pieces > 0)
    .map((item) => {
      const sku = skus.get(item.skuId);
      if (!sku) throw new Error(`Unknown SKU in cart: ${item.skuId}`);
      return priceLine(item, sku, schemes, now);
    });

  const sum = (pick: (line: PricedLine) => number) =>
    lines.reduce((total, line) => total + pick(line), 0);

  return {
    lines,
    grossPaise: sum((l) => l.grossPaise),
    discountPaise: sum((l) => l.discountPaise),
    taxablePaise: sum((l) => l.taxablePaise),
    gstPaise: sum((l) => l.gstPaise),
    totalPaise: sum((l) => l.totalPaise),
    freeCases: sum((l) => l.freeCases),
    blocked: lines.some((l) => l.stock !== 'OK'),
  };
}
