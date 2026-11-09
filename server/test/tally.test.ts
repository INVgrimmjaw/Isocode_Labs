import { describe, expect, it } from 'vitest';
import { buildTallyXml, type Voucher, type VoucherLine } from '../src/tally/voucher.ts';

function line(over: Partial<VoucherLine> = {}): VoucherLine {
  return {
    skuName: 'Glucose biscuit 75 g, case of 96',
    totalPieces: 960,
    freeCases: 0,
    unitsPerCase: 96,
    unitPricePaise: 810,
    grossPaise: 777_600,
    discountPaise: 0,
    taxablePaise: 777_600,
    gstBps: 500,
    gstPaise: 38_880,
    ...over,
  };
}

function voucher(lines: VoucherLine[], over: Partial<Voucher> = {}): Voucher {
  return {
    number: 'SO-00042',
    date: '20260615',
    partyLedger: 'Gupta Kirana Store, Napier Town',
    totalPaise: lines.reduce((sum, l) => sum + l.taxablePaise + l.gstPaise, 0),
    lines,
    ...over,
  };
}

const amounts = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g'))].map((m) =>
    Number(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/.exec(m[0])![1]),
  );

/** Tally refuses a voucher whose debits and credits do not cancel out. */
function voucherBalance(xml: string): number {
  const stock = amounts(xml, 'ALLINVENTORYENTRIES.LIST');
  const ledgers = amounts(xml, 'LEDGERENTRIES.LIST');
  return [...stock, ...ledgers].reduce((sum, a) => sum + Math.round(a * 100), 0);
}

describe('Tally voucher', () => {
  it('balances to zero', () => {
    expect(voucherBalance(buildTallyXml([voucher([line()])]))).toBe(0);
  });

  it('balances when GST is an odd number of paise', () => {
    const odd = line({ taxablePaise: 10_101, grossPaise: 10_101, gstPaise: 505 });
    expect(voucherBalance(buildTallyXml([voucher([odd])]))).toBe(0);
    expect(buildTallyXml([voucher([odd])])).toContain('<AMOUNT>2.52</AMOUNT>');
    expect(buildTallyXml([voucher([odd])])).toContain('<AMOUNT>2.53</AMOUNT>');
  });

  it('balances across lines at different GST rates', () => {
    const mixed = [line(), line({ gstBps: 1800, taxablePaise: 406_000, grossPaise: 406_000, gstPaise: 73_080 })];
    const xml = buildTallyXml([voucher(mixed)]);
    expect(voucherBalance(xml)).toBe(0);
    expect(xml).toContain('CGST @ 2.5%');
    expect(xml).toContain('CGST @ 9%');
  });

  it('shows free goods as actual quantity above billed quantity', () => {
    const xml = buildTallyXml([voucher([line({ freeCases: 1 })])]);
    expect(xml).toContain('<BILLEDQTY>960 pcs</BILLEDQTY>');
    expect(xml).toContain('<ACTUALQTY>1056 pcs</ACTUALQTY>');
  });

  it('does not change the value for free goods', () => {
    const withFree = buildTallyXml([voucher([line({ freeCases: 1 })])]);
    expect(voucherBalance(withFree)).toBe(0);
    expect(withFree).toContain('<AMOUNT>7776.00</AMOUNT>');
  });

  it('records a slab discount and the value after it', () => {
    const discounted = line({
      grossPaise: 1_015_000,
      discountPaise: 30_450,
      taxablePaise: 984_550,
      gstBps: 1800,
      gstPaise: 177_219,
    });
    const xml = buildTallyXml([voucher([discounted])]);
    expect(xml).toContain('<DISCOUNT>3</DISCOUNT>');
    expect(xml).toContain('<AMOUNT>9845.50</AMOUNT>');
    expect(voucherBalance(xml)).toBe(0);
  });

  it('debits the party for the full total', () => {
    const xml = buildTallyXml([voucher([line()])]);
    expect(xml).toContain('<LEDGERNAME>Gupta Kirana Store, Napier Town</LEDGERNAME>');
    expect(xml).toContain('<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>');
    expect(xml).toContain('<AMOUNT>-8164.80</AMOUNT>');
  });

  it('escapes characters that would break the XML', () => {
    const xml = buildTallyXml([voucher([line({ skuName: 'Salt <1 kg> "A"' })], { partyLedger: 'Verma & Sons' })]);
    expect(xml).toContain('Verma &amp; Sons');
    expect(xml).toContain('Salt &lt;1 kg&gt; &quot;A&quot;');
    expect(xml).not.toContain('Verma & Sons');
  });

  it('writes one voucher per order', () => {
    const xml = buildTallyXml([voucher([line()]), voucher([line()], { number: 'SO-00043' })]);
    expect(xml.match(/<VOUCHER /g)).toHaveLength(2);
  });
});
