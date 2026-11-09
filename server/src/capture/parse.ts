import type { CaptureUnit } from '#shared/api';
import {
  AMBIGUOUS_UNIT_WORDS,
  CASE_WORDS,
  DEVANAGARI_WORDS,
  DO_VERB_STEMS,
  DOZEN_WORDS,
  FILLER_WORDS,
  LARGE_WORDS,
  NUMBER_WORDS,
  PIECE_WORDS,
  SIZE_UNITS,
  SMALL_WORDS,
  WALA_WORDS,
} from './lexicon.ts';

/**
 * Reads the shape of a free-text order: what is quantity, what is unit, what is pack size,
 * and what is left to describe the item. It does not know the catalogue beyond its pack sizes.
 */

export type SizeHint = 'SMALL' | 'LARGE' | null;

export interface ParsedItem {
  /** The shopkeeper's own words, unchanged, for the reviewer to read. */
  originalWords: string;
  itemTokens: string[];
  sizeGrams: number | null;
  sizeHint: SizeHint;
  quantity: number | null;
  unit: CaptureUnit;
  /** Item words without quantity or unit, in a fixed order. Aliases are stored under this. */
  phrase: string;
}

interface Token {
  norm: string;
  /** Which word of the raw segment this came from, since "5peti" becomes two tokens. */
  rawIndex: number;
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

function normaliseWord(word: string): string[] {
  const cleaned = word
    .normalize('NFC')
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .toLowerCase()
    .replace(/[ऀ-ॿ]+/g, (w) => DEVANAGARI_WORDS[w] ?? w)
    // Keep a decimal point inside a number, drop every other kind of punctuation.
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/[^\p{L}\p{M}\d.\s]/gu, ' ')
    .replace(/(\d)(\p{L})/gu, '$1 $2')
    .replace(/(\p{L})(\d)/gu, '$1 $2');
  return cleaned.split(/\s+/).filter(Boolean);
}

/** Item names go through this too, so a catalogue keyword and a message word compare equal. */
export function normaliseText(text: string): string[] {
  return text.split(/\s+/).flatMap(normaliseWord);
}

function splitIntoSegments(text: string): string[] {
  return text
    .split(/[\n\r,;।|]+|\.(?=\s|$)|\s\+\s|\s&\s|\sand\s|\saur\s|\sऔर\s/i)
    .map((s) => s.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '').trim())
    .filter(Boolean);
}

function tokenise(segment: string): { rawWords: string[]; tokens: Token[] } {
  const rawWords = segment.split(/\s+/).filter(Boolean);
  const tokens = rawWords.flatMap((word, rawIndex) =>
    normaliseWord(word).map((norm) => ({ norm, rawIndex })),
  );
  return { rawWords, tokens };
}

function isUnitWord(word: string | undefined): boolean {
  return (
    word !== undefined &&
    (CASE_WORDS.has(word) ||
      PIECE_WORDS.has(word) ||
      AMBIGUOUS_UNIT_WORDS.has(word) ||
      DOZEN_WORDS.has(word))
  );
}

function unitOf(word: string): CaptureUnit {
  if (CASE_WORDS.has(word)) return 'CASE';
  if (PIECE_WORDS.has(word) || DOZEN_WORDS.has(word)) return 'PIECE';
  return 'UNCLEAR';
}

function numberAt(tokens: Token[], i: number): number | null {
  const word = tokens[i]?.norm;
  if (word === undefined) return null;
  if (/^\d+(\.\d+)?$/.test(word)) return Number(word);
  if (word === 'do') {
    // "de do" and "bhej do" mean "give", and a trailing "do" with nothing after it is never a count.
    const previous = tokens[i - 1]?.norm;
    if ((previous && DO_VERB_STEMS.has(previous)) || i === tokens.length - 1) return null;
    return 2;
  }
  return NUMBER_WORDS[word] ?? null;
}

const isPackSizePair = (next: string | undefined) =>
  next !== undefined && (SIZE_UNITS[next] !== undefined || WALA_WORDS.has(next));

/** "5 peti biscuit 2 peti chai" has no separators, so the quantity-unit pairs mark the items. */
function splitMultipleItems(tokens: Token[]): Token[][] {
  const pairStarts: number[] = [];
  tokens.forEach((_, i) => {
    if (numberAt(tokens, i) !== null && isUnitWord(tokens[i + 1]?.norm)) pairStarts.push(i);
  });
  const first = pairStarts[0];
  if (first === undefined || pairStarts.length < 2) return [tokens];

  const hasItemBeforeFirstPair = tokens
    .slice(0, first)
    .some((t) => !FILLER_WORDS.has(t.norm) && numberAt(tokens, tokens.indexOf(t)) === null);

  // "biscuit 5 peti chai 2 peti" has each pair closing its item, not opening it.
  const cuts = hasItemBeforeFirstPair ? pairStarts.map((i) => i + 2) : pairStarts;
  const parts: Token[][] = [];
  let start = 0;
  for (const cut of cuts) {
    if (cut > start) parts.push(tokens.slice(start, cut));
    start = cut;
  }
  if (start < tokens.length) parts.push(tokens.slice(start));
  return parts;
}

function canonicalPhrase(itemTokens: string[], sizeGrams: number | null, hint: SizeHint): string {
  const hintWord = hint === 'SMALL' ? ['chhota'] : hint === 'LARGE' ? ['bada'] : [];
  const parts = [...new Set([...itemTokens, ...hintWord])].sort();
  if (sizeGrams !== null) parts.push(`${sizeGrams}g`);
  return parts.join(' ');
}

function parseTokens(tokens: Token[], rawWords: string[], knownSizes: ReadonlySet<number>): ParsedItem | null {
  const itemTokens: string[] = [];
  const bareNumbers: number[] = [];
  const kept: Token[] = [];
  let sizeGrams: number | null = null;
  let sizeHint: SizeHint = null;
  let quantity: number | null = null;
  let unit: CaptureUnit = 'UNCLEAR';
  let multiplier = 1;

  const setQuantity = (value: number, unitWord: string) => {
    quantity = value;
    unit = unitOf(unitWord);
    if (DOZEN_WORDS.has(unitWord)) multiplier = 12;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const word = token.norm;
    const next = tokens[i + 1]?.norm;
    const value = numberAt(tokens, i);

    if (value !== null) {
      if (next !== undefined && SIZE_UNITS[next] !== undefined) {
        sizeGrams = Math.round(value * SIZE_UNITS[next]);
        kept.push(token, tokens[i + 1]!);
        i++;
      } else if (next !== undefined && WALA_WORDS.has(next)) {
        // "250 wala" names the pack. Kilos are not written this way, so the number is already grams.
        sizeGrams = value;
        kept.push(token, tokens[i + 1]!);
        i++;
      } else if (isUnitWord(next) && quantity === null) {
        setQuantity(value, next!);
        kept.push(token, tokens[i + 1]!);
        i++;
      } else {
        bareNumbers.push(value);
        kept.push(token);
      }
      continue;
    }

    if (isUnitWord(word)) {
      // "peti 5" puts the unit first.
      const after = numberAt(tokens, i + 1);
      if (after !== null && !isPackSizePair(tokens[i + 2]?.norm) && quantity === null) {
        setQuantity(after, word);
        kept.push(token, tokens[i + 1]!);
        i++;
      } else {
        if (unit === 'UNCLEAR') unit = unitOf(word);
        kept.push(token);
      }
      continue;
    }

    if (SMALL_WORDS.has(word)) {
      sizeHint = 'SMALL';
      kept.push(token);
    } else if (LARGE_WORDS.has(word)) {
      sizeHint = 'LARGE';
      kept.push(token);
    } else if (!FILLER_WORDS.has(word) && word !== 'do') {
      itemTokens.push(word);
      kept.push(token);
    }
  }

  // A number left over is a pack size if the catalogue sells that size, otherwise the quantity.
  for (const value of bareNumbers) {
    if (sizeGrams === null && knownSizes.has(value)) sizeGrams = value;
    else if (quantity === null) quantity = value;
  }

  if (itemTokens.length === 0 && quantity === null) return null;

  const validQuantity = quantity !== null && Number.isInteger(quantity) && quantity > 0;
  const first = kept[0]?.rawIndex ?? 0;
  const last = kept.at(-1)?.rawIndex ?? rawWords.length - 1;

  return {
    originalWords: rawWords.slice(first, last + 1).join(' '),
    itemTokens,
    sizeGrams,
    sizeHint,
    quantity: validQuantity ? quantity! * multiplier : null,
    unit,
    phrase: canonicalPhrase(itemTokens, sizeGrams, sizeHint),
  };
}

export function parseMessage(text: string, knownSizes: ReadonlySet<number>): ParsedItem[] {
  return splitIntoSegments(text).flatMap((segment) => {
    const { rawWords, tokens } = tokenise(segment);
    return splitMultipleItems(tokens)
      .map((part) => parseTokens(part, rawWords, knownSizes))
      .filter((item): item is ParsedItem => item !== null);
  });
}

/** Reads one line as written by the model, so both readers go through the same unit and phrase rules. */
export function parseOriginalWords(words: string, knownSizes: ReadonlySet<number>): ParsedItem {
  const { rawWords, tokens } = tokenise(words);
  return (
    parseTokens(tokens, rawWords, knownSizes) ?? {
      originalWords: words,
      itemTokens: [],
      sizeGrams: null,
      sizeHint: null,
      quantity: null,
      unit: 'UNCLEAR',
      phrase: normaliseText(words).sort().join(' '),
    }
  );
}

/** Whether the message states this unit anywhere, for orders like "sab peti mein: 5 biscuit, 2 chai". */
export function messageStatesUnit(text: string, unit: 'CASE' | 'PIECE'): boolean {
  const words = unit === 'CASE' ? CASE_WORDS : PIECE_WORDS;
  return normaliseText(text).some((w) => words.has(w));
}
