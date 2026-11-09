import { describe, expect, it } from 'vitest';
import { formatRupees, percentOf, rupeesToPaise } from './money.ts';
import {
  priceCart,
  type CartItem,
  type FreeGoodsScheme,
  type PricingSku,
  type Scheme,
  type SlabScheme,
} from './pricing.ts';

const NOW = new Date('2026-06-15T06:30:00.000Z');

/** The three SKUs from the client's sample data. */
const biscuit: PricingSku = {
  id: 'biscuit',
  unitsPerCase: 96,
  unitPricePaise: rupeesToPaise(8.1),
  gstBps: 500,
  stockPieces: 340 * 96,
};
const detergent: PricingSku = {
  id: 'detergent',
  unitsPerCase: 20,
  unitPricePaise: rupeesToPaise(101.5),
  gstBps: 1800,
  stockPieces: 85 * 20,
};
const tea: PricingSku = {
  id: 'tea',
  unitsPerCase: 40,
  unitPricePaise: rupeesToPaise(118),
  gstBps: 500,
  stockPieces: 0,
};

const buy10get1: FreeGoodsScheme = {
  id: 'scheme-biscuit',
  skuId: 'biscuit',
  kind: 'FREE_GOODS',
  label: 'Buy 10 cases get 1 free',
  labelHi: '10 पेटी पर 1 पेटी फ्री',
  buyCases: 10,
  freeCases: 1,
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: null,
};

const threePercentOn5: SlabScheme = {
  id: 'scheme-detergent',
  skuId: 'detergent',
  kind: 'SLAB_DISCOUNT',
  label: '3% off 5 or more cases',
  labelHi: '5 या ज़्यादा पेटी पर 3% छूट',
  slabs: [{ minCases: 5, discountBps: 300 }],
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: null,
};

const allSchemes: Scheme[] = [buy10get1, threePercentOn5];

function quote(items: CartItem[], skus: PricingSku[] = [biscuit, detergent, tea], schemes = allSchemes) {
  return priceCart(items, new Map(skus.map((s) => [s.id, s])), schemes, NOW);
}

function line(items: CartItem[], skus?: PricingSku[], schemes?: Scheme[]) {
  const [first] = quote(items, skus, schemes).lines;
  if (!first) throw new Error('expected a priced line');
  return first;
}

const cases = (skuId: string, count: number): CartItem => ({ skuId, cases: count, pieces: 0 });

describe('money', () => {
  it('rounds half up in integer space', () => {
    expect(percentOf(10_50, 500)).toBe(53); // 52.5 paise
    expect(percentOf(10_49, 500)).toBe(52);
  });

  it('formats with Indian digit grouping', () => {
    expect(formatRupees(12_450_000)).toBe('₹1,24,500');
    expect(formatRupees(77_760)).toBe('₹777.60');
  });
});

describe('free goods (buy 10 cases get 1 free)', () => {
  it.each([
    [1, 0],
    [9, 0],
    [10, 1],
    [11, 1],
    [19, 1],
    [20, 2],
    [100, 10],
  ])('%i paid cases earn %i free', (paid, free) => {
    expect(line([cases('biscuit', paid)]).freeCases).toBe(free);
  });

  it('charges only for the paid cases', () => {
    const l = line([cases('biscuit', 10)]);
    expect(l.grossPaise).toBe(10 * 96 * 810);
    expect(l.discountPaise).toBe(0);
    expect(l.applied?.id).toBe('scheme-biscuit');
  });

  it('adds no GST for the free cases', () => {
    const l = line([cases('biscuit', 10)]);
    expect(l.gstPaise).toBe(percentOf(10 * 96 * 810, 500));
  });

  it('grants fewer free cases when stock runs out, and reports the shortfall', () => {
    const scarce = { ...biscuit, stockPieces: 10 * 96 };
    const l = line([cases('biscuit', 10)], [scarce]);
    expect(l.stock).toBe('OK');
    expect(l.freeCases).toBe(0);
    expect(l.freeCasesShort).toBe(1);
    expect(l.applied?.id).toBe('scheme-biscuit');
  });

  it('never lets free goods take stock from paid goods', () => {
    const scarce = { ...biscuit, stockPieces: 21 * 96 };
    const l = line([cases('biscuit', 20)], [scarce]);
    expect(l.freeCases).toBe(1);
    expect(l.freeCasesShort).toBe(1);
  });
});

describe('slab discount (3% off 5 or more cases)', () => {
  it('does not apply below the threshold', () => {
    const l = line([cases('detergent', 4)]);
    expect(l.discountPaise).toBe(0);
    expect(l.applied).toBeNull();
  });

  it('applies to the whole line at exactly the threshold', () => {
    const l = line([cases('detergent', 5)]);
    expect(l.grossPaise).toBe(10_15_000); // 5 x 20 x 101.50
    expect(l.discountPaise).toBe(30_450); // 3% of 10,150.00
    expect(l.taxablePaise).toBe(9_84_550);
  });

  it('charges GST on the value after discount', () => {
    const l = line([cases('detergent', 5)]);
    expect(l.gstPaise).toBe(percentOf(9_84_550, 1800));
    expect(l.totalPaise).toBe(l.taxablePaise + l.gstPaise);
  });

  it('uses the highest slab reached', () => {
    const tiered: SlabScheme = {
      ...threePercentOn5,
      slabs: [
        { minCases: 10, discountBps: 500 },
        { minCases: 5, discountBps: 300 },
        { minCases: 20, discountBps: 700 },
      ],
    };
    const gross = (n: number) => n * 20 * 10150;
    expect(line([cases('detergent', 9)], undefined, [tiered]).discountPaise).toBe(percentOf(gross(9), 300));
    expect(line([cases('detergent', 10)], undefined, [tiered]).discountPaise).toBe(percentOf(gross(10), 500));
    expect(line([cases('detergent', 25)], undefined, [tiered]).discountPaise).toBe(percentOf(gross(25), 700));
  });
});

describe('cases and loose pieces', () => {
  it('prices loose pieces but does not count them towards a scheme', () => {
    const l = line([{ skuId: 'detergent', cases: 4, pieces: 19 }]);
    expect(l.totalPieces).toBe(99);
    expect(l.fullCases).toBe(4);
    expect(l.discountPaise).toBe(0);
  });

  it('counts pieces once they make a full case', () => {
    const l = line([{ skuId: 'detergent', cases: 4, pieces: 20 }]);
    expect(l.fullCases).toBe(5);
    expect(l.discountPaise).toBeGreaterThan(0);
  });

  it('accepts an order placed purely in pieces', () => {
    const l = line([{ skuId: 'biscuit', cases: 0, pieces: 12 }]);
    expect(l.grossPaise).toBe(12 * 810);
    expect(l.freeCases).toBe(0);
  });
});

describe('scheme selection', () => {
  const early: SlabScheme = { ...threePercentOn5, id: 'old', validTo: '2026-06-15T06:30:00.000Z' };
  const late: SlabScheme = { ...threePercentOn5, id: 'new', validFrom: '2026-06-15T06:30:00.001Z' };

  it('ignores a scheme that has ended, treating validTo as exclusive', () => {
    expect(line([cases('detergent', 5)], undefined, [early]).applied).toBeNull();
  });

  it('ignores a scheme that has not started', () => {
    expect(line([cases('detergent', 5)], undefined, [late]).applied).toBeNull();
  });

  it('applies a scheme from the instant it starts', () => {
    const startsNow: SlabScheme = { ...threePercentOn5, validFrom: NOW.toISOString() };
    expect(line([cases('detergent', 5)], undefined, [startsNow]).applied).not.toBeNull();
  });

  it('never stacks two schemes, and applies the one worth more', () => {
    const freeOnDetergent: FreeGoodsScheme = {
      ...buy10get1,
      id: 'free-detergent',
      skuId: 'detergent',
      buyCases: 5,
    };
    const l = line([cases('detergent', 5)], undefined, [threePercentOn5, freeOnDetergent]);
    expect(l.applied?.id).toBe('free-detergent'); // one free case beats 3%
    expect(l.discountPaise).toBe(0);
    expect(l.freeCases).toBe(1);
  });

  it('breaks a tie the same way every time', () => {
    const twin: SlabScheme = { ...threePercentOn5, id: 'a-twin' };
    expect(line([cases('detergent', 5)], undefined, [threePercentOn5, twin]).applied?.id).toBe('a-twin');
    expect(line([cases('detergent', 5)], undefined, [twin, threePercentOn5]).applied?.id).toBe('a-twin');
  });
});

describe('prices are per retailer', () => {
  it('calculates schemes on the retailer price, not the list price', () => {
    const special = { ...detergent, unitPricePaise: rupeesToPaise(99) };
    const l = line([cases('detergent', 5)], [special]);
    expect(l.grossPaise).toBe(5 * 20 * 9900);
    expect(l.discountPaise).toBe(percentOf(5 * 20 * 9900, 300));
  });
});

describe('stock', () => {
  it('blocks an out of stock line and prices it at nothing', () => {
    const q = quote([cases('tea', 1)]);
    expect(q.blocked).toBe(true);
    expect(q.lines[0]?.stock).toBe('OUT');
    expect(q.totalPaise).toBe(0);
  });

  it('blocks a line that asks for more than is available', () => {
    const q = quote([cases('detergent', 86)]);
    expect(q.blocked).toBe(true);
    expect(q.lines[0]?.stock).toBe('SHORT');
    expect(q.lines[0]?.availablePieces).toBe(85 * 20);
  });

  it('allows an order for exactly what is in stock', () => {
    expect(quote([cases('detergent', 85)]).blocked).toBe(false);
  });
});

describe('nudges', () => {
  it('prompts when the next free case is close', () => {
    expect(line([cases('biscuit', 5)]).nudge).toMatchObject({ kind: 'FREE_GOODS', casesToAdd: 5, freeCases: 1 });
    expect(line([cases('biscuit', 9)]).nudge).toMatchObject({ casesToAdd: 1 });
  });

  it('stays quiet when the reward is far away', () => {
    expect(line([cases('biscuit', 2)]).nudge).toBeNull();
  });

  it('prompts again for the next multiple', () => {
    expect(line([cases('biscuit', 15)]).nudge).toMatchObject({ casesToAdd: 5 });
  });

  it('prompts for the next slab', () => {
    expect(line([cases('detergent', 2)]).nudge).toMatchObject({
      kind: 'SLAB_DISCOUNT',
      casesToAdd: 3,
      discountBps: 300,
    });
  });

  it('does not promise a reward that stock cannot honour', () => {
    const scarce = { ...biscuit, stockPieces: 10 * 96 };
    expect(line([cases('biscuit', 8)], [scarce]).nudge).toBeNull();
  });

  it('does not prompt on a piece-only line', () => {
    expect(line([{ skuId: 'biscuit', cases: 0, pieces: 12 }]).nudge).toBeNull();
  });
});

describe('merging', () => {
  it('evaluates schemes on the SKU total when it appears twice', () => {
    const q = quote([cases('biscuit', 6), cases('biscuit', 6)]);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]?.cases).toBe(12);
    expect(q.lines[0]?.freeCases).toBe(1);
  });

  it('drops empty lines', () => {
    expect(quote([cases('biscuit', 0)]).lines).toHaveLength(0);
  });
});

describe("the client's sample order", () => {
  // "5 peti biscuit chhota, 2 peti washing powder 1 kilo, chai patti 250 wala 1 peti"
  const q = quote([cases('biscuit', 5), cases('detergent', 2), cases('tea', 1)]);
  const [b, d, t] = q.lines;

  it('earns no scheme: 5 is short of 10, and 2 is short of 5', () => {
    expect(b?.freeCases).toBe(0);
    expect(d?.discountPaise).toBe(0);
  });

  it('nudges both lines towards their scheme', () => {
    expect(b?.nudge?.casesToAdd).toBe(5);
    expect(d?.nudge?.casesToAdd).toBe(3);
  });

  it('prices the lines from the per-piece dealer price', () => {
    expect(b?.grossPaise).toBe(3_88_800); // 5 x 96 x 8.10 = 3,888.00
    expect(d?.grossPaise).toBe(4_06_000); // 2 x 20 x 101.50 = 4,060.00
  });

  it('flags the tea as out of stock and leaves it out of the total', () => {
    expect(t?.stock).toBe('OUT');
    expect(q.blocked).toBe(true);
    expect(q.taxablePaise).toBe(7_94_800);
  });
});
