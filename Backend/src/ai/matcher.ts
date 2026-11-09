import { normaliseText, type ParsedItem } from './parser.ts';

export interface CaptureSku {
  id: string;
  code: string;
  name: string;
  family: string;
  sizeGrams: number | null;
  keywords: string[];
}

export interface SkuHistory {
  /** How many of this shop's past orders included the SKU. */
  orders: number;
}

export interface MatchContext {
  skus: CaptureSku[];
  aliases: ReadonlyMap<string, string>;
  history: ReadonlyMap<string, SkuHistory>;
  knownSizes: ReadonlySet<number>;
}

export interface RankedSku {
  skuId: string;
  score: number;
}

const WEIGHT_NAME = 0.62;
const WEIGHT_SIZE = 0.26;
const WEIGHT_HISTORY = 0.12;

// How well the pack size fits, on a 0 to 1 scale.
const SIZE_EXACT = 1;
const SIZE_HINT_FITS = 0.8;
const SIZE_UNKNOWN = 0.55;
const SIZE_HINT_MISSES = 0.3;
const SIZE_MISMATCH = 0;

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** Tolerates spelling drift ("biskit") but not short words, where one letter changes the meaning. */
function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 4) return 0;
  const similarity = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return similarity >= 0.7 ? similarity : 0;
}

function skuVocabulary(sku: CaptureSku): string[] {
  return [...sku.keywords.flatMap(normaliseText), ...normaliseText(sku.name)];
}

function nameScore(itemTokens: string[], vocabulary: string[]): number {
  if (itemTokens.length === 0) return 0;
  const total = itemTokens.reduce(
    (sum, token) => sum + Math.max(0, ...vocabulary.map((word) => wordSimilarity(token, word))),
    0,
  );
  return total / itemTokens.length;
}

function sizesByFamily(skus: CaptureSku[]): Map<string, number[]> {
  const families = new Map<string, Set<number>>();
  for (const sku of skus) {
    if (sku.sizeGrams === null) continue;
    if (!families.has(sku.family)) families.set(sku.family, new Set());
    families.get(sku.family)!.add(sku.sizeGrams);
  }
  return new Map([...families].map(([family, sizes]) => [family, [...sizes].sort((a, b) => a - b)]));
}

function sizeFit(sku: CaptureSku, item: ParsedItem, family: number[]): number {
  if (item.sizeGrams !== null) return sku.sizeGrams === item.sizeGrams ? SIZE_EXACT : SIZE_MISMATCH;
  if (item.sizeHint === null || family.length < 2) return SIZE_UNKNOWN;
  const target = item.sizeHint === 'SMALL' ? family[0] : family.at(-1);
  return sku.sizeGrams === target ? SIZE_HINT_FITS : SIZE_HINT_MISSES;
}

/** Every SKU scored from 0 to 1, best first. */
export function rankSkus(item: ParsedItem, ctx: MatchContext): RankedSku[] {
  const families = sizesByFamily(ctx.skus);
  const mostOrdered = Math.max(1, ...[...ctx.history.values()].map((h) => h.orders));

  return ctx.skus
    .map((sku) => {
      const name = nameScore(item.itemTokens, skuVocabulary(sku));
      const size = sizeFit(sku, item, families.get(sku.family) ?? []);
      const history = (ctx.history.get(sku.id)?.orders ?? 0) / mostOrdered;
      const score = WEIGHT_NAME * name + WEIGHT_SIZE * size + WEIGHT_HISTORY * history;
      // A matching size or a popular SKU must not rescue words that do not describe it.
      return { skuId: sku.id, score: name < 0.5 ? score * 0.5 : score };
    })
    .sort((a, b) => b.score - a.score || a.skuId.localeCompare(b.skuId));
}

/** Whether the shopkeeper left the pack size open on a product sold in more than one size. */
export function sizeLeftOpen(item: ParsedItem, sku: CaptureSku, ctx: MatchContext): boolean {
  if (item.sizeGrams !== null || item.sizeHint !== null) return false;
  return (sizesByFamily(ctx.skus).get(sku.family)?.length ?? 0) > 1;
}
