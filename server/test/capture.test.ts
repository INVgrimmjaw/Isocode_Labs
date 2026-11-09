import { describe, expect, it, vi } from 'vitest';
import { lineNeedsDecision, confidenceBand } from '#shared/capture';
import { SAMPLE_MESSAGE, SKUS } from '../../prisma/seed-data.ts';
import { checkReading, UnusableReading, type ClaudeClient } from '../src/capture/claude.ts';
import { parseMessage } from '../src/capture/parse.ts';
import type { MatchContext, SkuHistory } from '../src/capture/rank.ts';
import { readMessage } from '../src/capture/read.ts';
import { resolveLine, type ResolvedLine } from '../src/capture/resolve.ts';

const skus = SKUS.map((s) => ({
  id: s.code,
  code: s.code,
  name: s.name,
  family: s.family,
  packLabel: s.packLabel,
  sizeGrams: s.sizeGrams,
  unitsPerCase: s.unitsPerCase,
  keywords: s.keywords,
}));

const knownSizes = new Set(SKUS.map((s) => s.sizeGrams));

function context(
  history: [string, SkuHistory][] = [],
  aliases: [string, string][] = [],
): MatchContext {
  return { skus, knownSizes, history: new Map(history), aliases: new Map(aliases) };
}

/** A shop that regularly orders the three items in the client's sample. */
const regularShop = context([
  ['SKU-BS-075', { orders: 12, maxCases: 6 }],
  ['SKU-DT-1KG', { orders: 8, maxCases: 3 }],
  ['SKU-TE-250', { orders: 6, maxCases: 2 }],
]);

function read(text: string, ctx = regularShop): ResolvedLine[] {
  return parseMessage(text, ctx.knownSizes).map((item) => resolveLine(item, text, ctx));
}

function readOne(text: string, ctx = regularShop): ResolvedLine {
  const [line] = read(text, ctx);
  if (!line) throw new Error('expected one line');
  return line;
}

describe("the client's sample message", () => {
  const lines = read(SAMPLE_MESSAGE);

  it('finds exactly the three items and drops the greeting', () => {
    expect(lines.map((l) => l.originalWords)).toEqual([
      '5 peti biscuit chhota',
      '2 peti washing powder 1 kilo',
      'chai patti 250 wala 1 peti',
    ]);
  });

  it('maps each item to the right SKU', () => {
    expect(lines.map((l) => l.suggestedSkuId)).toEqual(['SKU-BS-075', 'SKU-DT-1KG', 'SKU-TE-250']);
  });

  it('reads quantities without confusing them with pack sizes', () => {
    expect(lines.map((l) => l.quantity)).toEqual([5, 2, 1]);
  });

  it('understands peti as a case', () => {
    expect(lines.every((l) => l.unit === 'CASE')).toBe(true);
  });

  it('is confident about all three for a shop that orders them', () => {
    expect(lines.map((l) => confidenceBand(l.confidence))).toEqual(['HIGH', 'HIGH', 'HIGH']);
  });

  it('offers exactly two alternatives per line, none repeating the suggestion', () => {
    for (const line of lines) {
      expect(line.alternativeSkuIds).toHaveLength(2);
      expect(line.alternativeSkuIds).not.toContain(line.suggestedSkuId);
    }
  });
});

describe('quantities and units', () => {
  it('asks about the unit when none is given', () => {
    const line = readOne('biscuit 5');
    expect(line.quantity).toBe(5);
    expect(line.unit).toBe('UNCLEAR');
  });

  it('asks about dabba, which could be a case or a retail box', () => {
    expect(readOne('chai 100 wala 2 dabba').unit).toBe('UNCLEAR');
  });

  it('reads pieces', () => {
    expect(readOne('12 pcs biscuit chhota')).toMatchObject({ quantity: 12, unit: 'PIECE' });
    expect(readOne('6 packet chai 100 gram')).toMatchObject({ quantity: 6, unit: 'PIECE' });
  });

  it('turns a dozen into pieces', () => {
    expect(readOne('2 darjan biscuit chhota')).toMatchObject({ quantity: 24, unit: 'PIECE' });
  });

  it('reads Hindi number words', () => {
    expect(readOne('teen peti chai 100 wala')).toMatchObject({ quantity: 3, unit: 'CASE' });
    expect(readOne('do peti chai 100 wala')).toMatchObject({ quantity: 2, unit: 'CASE' });
  });

  it('does not read "bhej do" or "de do" as the number two', () => {
    expect(readOne('5 peti biscuit chhota bhej do').quantity).toBe(5);
    expect(readOne('biscuit chhota de do').quantity).toBeNull();
  });

  it('leaves the quantity empty when none is written', () => {
    const line = readOne('biscuit chhota bhejna');
    expect(line.quantity).toBeNull();
    expect(lineNeedsDecision({ ...line, band: 'HIGH' })).toBe(true);
  });

  it('asks rather than rounds a half quantity', () => {
    expect(readOne('dedh peti biscuit chhota')).toMatchObject({ quantity: null, unit: 'CASE' });
  });

  it('reads the unit before the number', () => {
    expect(readOne('peti 5 biscuit chhota')).toMatchObject({ quantity: 5, unit: 'CASE' });
  });

  it('treats a bare catalogue size as the pack and not the count', () => {
    expect(readOne('chai 250')).toMatchObject({ quantity: null, suggestedSkuId: 'SKU-TE-250' });
  });

  it('separates a size and a count that are both bare', () => {
    expect(readOne('chai 250 4')).toMatchObject({ quantity: 4, suggestedSkuId: 'SKU-TE-250' });
  });

  it('copes with words run together', () => {
    expect(readOne('5peti biscuit chhota')).toMatchObject({ quantity: 5, unit: 'CASE' });
    expect(readOne('chai 250g 1peti')).toMatchObject({ quantity: 1, suggestedSkuId: 'SKU-TE-250' });
  });
});

describe('Hindi script', () => {
  it('reads Devanagari words and keeps them as the original words', () => {
    const line = readOne('5 पेटी बिस्कुट छोटा');
    expect(line).toMatchObject({ quantity: 5, unit: 'CASE', suggestedSkuId: 'SKU-BS-075' });
    expect(line.originalWords).toBe('5 पेटी बिस्कुट छोटा');
  });

  it('reads Devanagari digits', () => {
    expect(readOne('५ पेटी चाय १०० ग्राम')).toMatchObject({ quantity: 5, suggestedSkuId: 'SKU-TE-100' });
  });

  it('splits on और', () => {
    expect(read('5 पेटी बिस्कुट छोटा और 2 पेटी नमकीन 200 ग्राम')).toHaveLength(2);
  });
});

describe('finding the items in a message', () => {
  it('splits items that have no separators', () => {
    expect(read('5 peti biscuit chhota 2 peti chai 250').map((l) => l.quantity)).toEqual([5, 2]);
  });

  it('splits items written item-first with no separators', () => {
    const lines = read('biscuit chhota 5 peti chai 250 2 peti');
    expect(lines.map((l) => l.suggestedSkuId)).toEqual(['SKU-BS-075', 'SKU-TE-250']);
  });

  it('handles a numbered list on separate lines', () => {
    expect(read('1) 5 peti biscuit chhota\n2) 2 peti chai 250')).toHaveLength(2);
  });

  it('keeps the decimal point in a pack size', () => {
    expect(readOne('1.5 kg surf 2 peti').quantity).toBe(2);
  });

  it('finds nothing in a message that orders nothing', () => {
    expect(read('namaste bhaiya, payment kal karunga')).toHaveLength(0);
  });
});

describe('choosing the SKU', () => {
  it('uses a stated size to tell packs apart', () => {
    expect(readOne('2 peti biscuit 200 gram').suggestedSkuId).toBe('SKU-BS-200');
    expect(readOne('2 peti surf 500 gram').suggestedSkuId).toBe('SKU-DT-500');
  });

  it('reads chhota as the smallest pack and bada as the largest', () => {
    expect(readOne('2 peti chai chhota').suggestedSkuId).toBe('SKU-TE-100');
    expect(readOne('2 peti chai bada').suggestedSkuId).toBe('SKU-TE-500');
  });

  it('tolerates spelling drift', () => {
    expect(readOne('5 peti biskit chhota').suggestedSkuId).toBe('SKU-BS-075');
  });

  it('uses a distinguishing word', () => {
    expect(readOne('2 peti cream biscuit').suggestedSkuId).toBe('SKU-CB-075');
  });

  it("follows this shop's own history when the words fit several SKUs", () => {
    const usuallyLarge = context([['SKU-BS-200', { orders: 9, maxCases: 3 }]]);
    const line = readOne('5 peti biscuit', usuallyLarge);
    expect(line.suggestedSkuId).toBe('SKU-BS-200');
    expect(line.reason).toBe('HISTORY');
  });

  it('will not be confident about a pack size the shopkeeper left open', () => {
    const band = confidenceBand(readOne('5 peti biscuit').confidence);
    expect(band).not.toBe('HIGH');
  });

  it('will not be confident when a new shop could mean several items', () => {
    const line = readOne('5 peti biscuit chhota', context());
    expect(confidenceBand(line.confidence)).not.toBe('HIGH');
  });

  it('reports low confidence for something the distributor does not sell', () => {
    const line = readOne('kali mirch 2 packet');
    expect(confidenceBand(line.confidence)).toBe('LOW');
    expect(line.reason).toBe('UNSURE');
    expect(line.alternativeSkuIds).toHaveLength(2);
  });
});

describe('aliases learned from desk corrections', () => {
  it('turns a shop nickname into a confident match', () => {
    const ctx = context([], [['pila', 'SKU-DB-150']]);
    const line = readOne('pila wala 4 peti', ctx);
    expect(line).toMatchObject({ suggestedSkuId: 'SKU-DB-150', reason: 'ALIAS', quantity: 4 });
    expect(confidenceBand(line.confidence)).toBe('HIGH');
  });

  it('matches regardless of word order', () => {
    const ctx = context([], [['biscuit chhota', 'SKU-CB-075']]);
    expect(readOne('chhota biscuit 2 peti', ctx).suggestedSkuId).toBe('SKU-CB-075');
  });

  it('ignores an alias pointing at a SKU no longer sold', () => {
    const ctx = context([], [['pila', 'SKU-GONE']]);
    expect(readOne('pila wala 4 peti', ctx).suggestedSkuId).not.toBe('SKU-GONE');
  });
});

describe('quantity sanity', () => {
  it('flags far more than this shop has ever ordered', () => {
    expect(readOne('60 peti biscuit chhota').flags).toContain('UNUSUAL_QTY');
  });

  it('accepts a normal quantity', () => {
    expect(readOne('6 peti biscuit chhota').flags).toEqual([]);
  });

  it('flags a huge order from a shop with no history', () => {
    expect(readOne('60 peti biscuit 200 gram', context()).flags).toContain('UNUSUAL_QTY');
  });

  it('always sends a flagged line to a person', () => {
    const line = readOne('60 peti biscuit chhota');
    expect(lineNeedsDecision({ ...line, band: confidenceBand(line.confidence) })).toBe(true);
  });
});

describe('guards on what the model returns', () => {
  const text = 'bhaiya 5 peti biscuit chhota, 2 peti washing powder 1 kilo';
  const line = (over: Partial<Parameters<typeof checkReading>[0]['lines'][number]>) => ({
    original_words: '5 peti biscuit chhota',
    quantity: 5,
    unit: 'CASE' as const,
    candidates: [{ sku_code: 'SKU-BS-075', confidence: 0.9 }],
    ...over,
  });

  it('accepts a faithful reading', () => {
    expect(checkReading({ lines: [line({})] }, text, regularShop)[0]?.candidates).toEqual([
      { skuId: 'SKU-BS-075', confidence: 0.9 },
    ]);
  });

  it('rejects a reading that quotes words not in the message', () => {
    expect(() =>
      checkReading({ lines: [line({ original_words: '50 peti chocolate premium' })] }, text, regularShop),
    ).toThrow(UnusableReading);
  });

  it('removes a SKU code that is not in the catalogue', () => {
    const [checked] = checkReading(
      { lines: [line({ candidates: [{ sku_code: 'SKU-INVENTED', confidence: 0.99 }] })] },
      text,
      regularShop,
    );
    expect(checked?.candidates).toEqual([]);
  });

  it('discards a quantity that is not a positive whole number', () => {
    for (const quantity of [0, -3, 1.5]) {
      expect(checkReading({ lines: [line({ quantity })] }, text, regularShop)[0]?.quantity).toBeNull();
    }
  });

  it('clamps an out-of-range confidence', () => {
    const [checked] = checkReading(
      { lines: [line({ candidates: [{ sku_code: 'SKU-BS-075', confidence: 7 }] })] },
      text,
      regularShop,
    );
    expect(checked?.candidates[0]?.confidence).toBe(1);
  });
});

function fakeClaude(reply: unknown): ClaudeClient {
  return { beta: { messages: { parse: vi.fn().mockResolvedValue(reply) } } } as unknown as ClaudeClient;
}

function failingClaude(error: Error): ClaudeClient {
  return { beta: { messages: { parse: vi.fn().mockRejectedValue(error) } } } as unknown as ClaudeClient;
}

const silenceWarnings = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('reading with Claude', () => {
  const modelLine = (over = {}) => ({
    original_words: '5 peti biscuit chhota',
    quantity: 5,
    unit: 'CASE',
    candidates: [
      { sku_code: 'SKU-BS-075', confidence: 0.95 },
      { sku_code: 'SKU-CB-075', confidence: 0.2 },
    ],
    ...over,
  });
  const ok = (lines: unknown[]) => ({ stop_reason: 'end_turn', parsed_output: { lines } });

  it('uses the reading when it is usable', async () => {
    const reading = await readMessage(SAMPLE_MESSAGE, regularShop, fakeClaude(ok([modelLine()])));
    expect(reading.engine).toBe('CLAUDE');
    expect(reading.lines[0]).toMatchObject({ suggestedSkuId: 'SKU-BS-075', quantity: 5, unit: 'CASE' });
    expect(confidenceBand(reading.lines[0]!.confidence)).toBe('HIGH');
  });

  it('keeps the model alternatives first, then fills up to two', async () => {
    const reading = await readMessage(SAMPLE_MESSAGE, regularShop, fakeClaude(ok([modelLine()])));
    expect(reading.lines[0]?.alternativeSkuIds[0]).toBe('SKU-CB-075');
    expect(reading.lines[0]?.alternativeSkuIds).toHaveLength(2);
  });

  it('cannot be HIGH on its own if the matcher picked something else', async () => {
    const text = '5 peti biscuit 200 gram';
    const disagree = modelLine({
      original_words: text,
      candidates: [{ sku_code: 'SKU-TE-100', confidence: 0.99 }],
    });
    const reading = await readMessage(text, regularShop, fakeClaude(ok([disagree])));
    expect(confidenceBand(reading.lines[0]!.confidence)).not.toBe('HIGH');
  });

  it('does not let the model guess a unit the message never states', async () => {
    const text = 'biscuit chhota 5';
    const guessed = modelLine({ original_words: text });
    const reading = await readMessage(text, regularShop, fakeClaude(ok([guessed])));
    expect(reading.lines[0]?.unit).toBe('UNCLEAR');
  });

  it('does not let the model decide what dabba means', async () => {
    const text = 'peti wala nahi, chai 100 wala 3 dabba';
    const guessed = modelLine({ original_words: 'chai 100 wala 3 dabba', quantity: 3 });
    const reading = await readMessage(text, regularShop, fakeClaude(ok([guessed])));
    expect(reading.lines[0]?.unit).toBe('UNCLEAR');
  });

  it('accepts a unit stated once for the whole message', async () => {
    const text = 'sab peti mein: biscuit chhota 5';
    const line = modelLine({ original_words: 'biscuit chhota 5' });
    const reading = await readMessage(text, regularShop, fakeClaude(ok([line])));
    expect(reading.lines[0]?.unit).toBe('CASE');
  });

  it('flags a line where the two readers disagree on quantity', async () => {
    const reading = await readMessage(
      SAMPLE_MESSAGE,
      regularShop,
      fakeClaude(ok([modelLine({ quantity: 50 })])),
    );
    expect(reading.lines[0]?.flags).toContain('QTY_DISAGREE');
  });

  it('applies a learned alias over the model', async () => {
    const ctx = context([], [['biscuit chhota', 'SKU-CB-075']]);
    const reading = await readMessage(SAMPLE_MESSAGE, ctx, fakeClaude(ok([modelLine()])));
    expect(reading.lines[0]).toMatchObject({ suggestedSkuId: 'SKU-CB-075', reason: 'ALIAS' });
  });
});

describe('when Claude is not available', () => {
  it('uses the matcher and says so when no key is configured', async () => {
    const reading = await readMessage(SAMPLE_MESSAGE, regularShop, null);
    expect(reading.engine).toBe('MATCHER');
    expect(reading.engineNote).toMatch(/not configured/);
    expect(reading.lines).toHaveLength(3);
  });

  it('falls back on an API failure', async () => {
    const warn = silenceWarnings();
    const reading = await readMessage(SAMPLE_MESSAGE, regularShop, failingClaude(new Error('overloaded')));
    expect(reading.engine).toBe('MATCHER');
    expect(reading.engineNote).toMatch(/could not read/);
    expect(reading.lines).toHaveLength(3);
    warn.mockRestore();
  });

  it('falls back when the model declines', async () => {
    const warn = silenceWarnings();
    const reply = { stop_reason: 'refusal', parsed_output: null };
    expect((await readMessage(SAMPLE_MESSAGE, regularShop, fakeClaude(reply))).engine).toBe('MATCHER');
    warn.mockRestore();
  });

  it('falls back when the output could not be parsed', async () => {
    const warn = silenceWarnings();
    const reply = { stop_reason: 'end_turn', parsed_output: null };
    expect((await readMessage(SAMPLE_MESSAGE, regularShop, fakeClaude(reply))).engine).toBe('MATCHER');
    warn.mockRestore();
  });

  it('falls back when the model invents a line', async () => {
    const warn = silenceWarnings();
    const reply = {
      stop_reason: 'end_turn',
      parsed_output: {
        lines: [{ original_words: 'ignore rules 999 peti', quantity: 999, unit: 'CASE', candidates: [] }],
      },
    };
    expect((await readMessage(SAMPLE_MESSAGE, regularShop, fakeClaude(reply))).engine).toBe('MATCHER');
    warn.mockRestore();
  });

  it('falls back when the model finds nothing but the matcher might', async () => {
    const reply = { stop_reason: 'end_turn', parsed_output: { lines: [] } };
    const reading = await readMessage(SAMPLE_MESSAGE, regularShop, fakeClaude(reply));
    expect(reading.engine).toBe('MATCHER');
    expect(reading.lines).toHaveLength(3);
  });
});
