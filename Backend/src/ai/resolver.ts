import type { CaptureReason, CaptureUnit } from '../types/api.ts';
import { MEDIUM_CONFIDENCE } from './confidence.ts';
import { AMBIGUOUS_UNIT_WORDS } from './lexicon.ts';
import { rankSkus, sizeLeftOpen, type MatchContext, type RankedSku } from './matcher.ts';
import { messageStatesUnit, normaliseText, type ParsedItem } from './parser.ts';

/** One line as Claude read it, after its SKU codes have been checked against the catalogue. */
export interface ModelLine {
  originalWords: string;
  quantity: number | null;
  unit: CaptureUnit;
  candidates: { skuId: string; confidence: number }[];
}

export interface ResolvedLine {
  originalWords: string;
  phrase: string;
  quantity: number | null;
  unit: CaptureUnit;
  suggestedSkuId: string | null;
  confidence: number;
  reason: CaptureReason;
  alternativeSkuIds: string[];
}

const ALIAS_CONFIDENCE = 0.98;
/** Below HIGH, so the line always reaches a person. */
const CAP_NEEDS_A_LOOK = 0.75;
const CAP_NEAR_TIE = 0.7;
const NEAR_TIE_MARGIN = 0.06;
const MODEL_WEIGHT = 0.55;
const MATCHER_WEIGHT = 0.45;

/**
 * The unit is decided from the words, never from what is usual. The model's opinion counts only
 * when the message really states that unit somewhere, as in "sab peti mein: 5 biscuit, 2 chai".
 */
function decideUnit(item: ParsedItem, rawText: string, model: ModelLine | undefined): CaptureUnit {
  if (item.unit !== 'UNCLEAR') return item.unit;
  const saysContainer = normaliseText(item.originalWords).some((w) => AMBIGUOUS_UNIT_WORDS.has(w));
  if (model && model.unit !== 'UNCLEAR' && !saysContainer && messageStatesUnit(rawText, model.unit)) {
    return model.unit;
  }
  return 'UNCLEAR';
}

interface Choice {
  skuId: string | null;
  confidence: number;
  isAlias: boolean;
}

/**
 * Claude alone cannot make a line HIGH. It needs the matcher, which reads the same words a
 * different way, to agree. Model self-reported confidence is not calibrated enough to trust solo.
 */
function chooseSku(item: ParsedItem, ranked: RankedSku[], ctx: MatchContext, model?: ModelLine): Choice {
  const alias = ctx.aliases.get(item.phrase);
  if (alias && ctx.skus.some((s) => s.id === alias)) {
    return { skuId: alias, confidence: ALIAS_CONFIDENCE, isAlias: true };
  }

  const best = ranked[0];
  if (!best) return { skuId: null, confidence: 0, isAlias: false };

  const modelBest = model?.candidates[0];
  let skuId = best.skuId;
  let confidence = best.score;

  if (modelBest) {
    const matcherScore = ranked.find((r) => r.skuId === modelBest.skuId)?.score ?? 0;
    skuId = modelBest.skuId;
    confidence = MODEL_WEIGHT * modelBest.confidence + MATCHER_WEIGHT * matcherScore;
    if (modelBest.skuId !== best.skuId) confidence = Math.min(confidence, CAP_NEEDS_A_LOOK);
  }

  const runnerUp = ranked[1];
  if (runnerUp && best.score - runnerUp.score < NEAR_TIE_MARGIN) {
    confidence = Math.min(confidence, CAP_NEAR_TIE);
  }
  const sku = ctx.skus.find((s) => s.id === skuId);
  if (sku && sizeLeftOpen(item, sku, ctx)) confidence = Math.min(confidence, CAP_NEEDS_A_LOOK);

  return { skuId, confidence, isAlias: false };
}

export function resolveLine(
  item: ParsedItem,
  rawText: string,
  ctx: MatchContext,
  model?: ModelLine,
): ResolvedLine {
  const ranked = rankSkus(item, ctx);
  const { skuId, confidence, isAlias } = chooseSku(item, ranked, ctx, model);

  const reason: CaptureReason = isAlias
    ? 'ALIAS'
    : confidence < MEDIUM_CONFIDENCE
      ? 'UNSURE'
      : skuId && ctx.history.has(skuId)
        ? 'HISTORY'
        : 'MATCH';

  const alternativeSkuIds = [
    ...new Set([...(model?.candidates.slice(1).map((c) => c.skuId) ?? []), ...ranked.map((r) => r.skuId)]),
  ]
    .filter((id) => id !== skuId)
    .slice(0, 2);

  return {
    originalWords: item.originalWords,
    phrase: item.phrase,
    quantity: model?.quantity ?? item.quantity,
    unit: decideUnit(item, rawText, model),
    suggestedSkuId: skuId,
    confidence,
    reason,
    alternativeSkuIds,
  };
}
