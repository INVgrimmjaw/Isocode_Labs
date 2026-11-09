/** Builds a Tally import file. Pure, so a bad voucher fails a test before it reaches the accounts team. */

export interface VoucherLine {
  skuName: string;
  totalPieces: number;
  freeCases: number;
  unitsPerCase: number;
  unitPricePaise: number;
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  gstBps: number;
  gstPaise: number;
}

export interface Voucher {
  number: string;
  date: string;
  partyLedger: string;
  totalPaise: number;
  lines: VoucherLine[];
}

const SALES_LEDGER = 'Sales';
const VOUCHER_TYPE = 'Sales Order';
const STOCK_UNIT = 'pcs';

const amount = (paise: number) => (paise / 100).toFixed(2);

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[c] ?? c;
  });
}

function discountPercent(line: VoucherLine): string {
  if (line.discountPaise === 0) return '0';
  return ((line.discountPaise / line.grossPaise) * 100).toFixed(2).replace(/\.?0+$/, '');
}

/** Tally shows free goods as actual quantity above billed quantity, at no extra value. */
function inventoryEntry(line: VoucherLine): string {
  const billed = line.totalPieces;
  const actual = billed + line.freeCases * line.unitsPerCase;
  return `
          <ALLINVENTORYENTRIES.LIST>
            <STOCKITEMNAME>${escapeXml(line.skuName)}</STOCKITEMNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <RATE>${amount(line.unitPricePaise)}/${STOCK_UNIT}</RATE>
            <DISCOUNT>${discountPercent(line)}</DISCOUNT>
            <AMOUNT>${amount(line.taxablePaise)}</AMOUNT>
            <ACTUALQTY>${actual} ${STOCK_UNIT}</ACTUALQTY>
            <BILLEDQTY>${billed} ${STOCK_UNIT}</BILLEDQTY>
            <ACCOUNTINGALLOCATIONS.LIST>
              <LEDGERNAME>${SALES_LEDGER}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount(line.taxablePaise)}</AMOUNT>
            </ACCOUNTINGALLOCATIONS.LIST>
          </ALLINVENTORYENTRIES.LIST>`;
}

function ledgerEntry(name: string, paise: number, isDebit: boolean): string {
  return `
          <LEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(name)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
            <AMOUNT>${isDebit ? '-' : ''}${amount(paise)}</AMOUNT>
          </LEDGERENTRIES.LIST>`;
}

/** Local sales, so tax splits evenly into CGST and SGST. An odd paisa goes to SGST to keep the voucher balanced. */
function taxEntries(lines: VoucherLine[]): string {
  const gstByRate = new Map<number, number>();
  for (const line of lines) {
    gstByRate.set(line.gstBps, (gstByRate.get(line.gstBps) ?? 0) + line.gstPaise);
  }
  return [...gstByRate]
    .sort(([a], [b]) => a - b)
    .filter(([, paise]) => paise > 0)
    .map(([bps, paise]) => {
      const cgst = Math.floor(paise / 2);
      const rate = bps / 200;
      return ledgerEntry(`CGST @ ${rate}%`, cgst, false) + ledgerEntry(`SGST @ ${rate}%`, paise - cgst, false);
    })
    .join('');
}

function voucherXml(voucher: Voucher): string {
  return `
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${VOUCHER_TYPE}" ACTION="Create" OBJVIEW="Invoice Voucher View">
          <DATE>${voucher.date}</DATE>
          <VOUCHERTYPENAME>${VOUCHER_TYPE}</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${escapeXml(voucher.number)}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${escapeXml(voucher.partyLedger)}</PARTYLEDGERNAME>
          <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>${voucher.lines.map(inventoryEntry).join('')}${ledgerEntry(voucher.partyLedger, voucher.totalPaise, true)}${taxEntries(voucher.lines)}
        </VOUCHER>
      </TALLYMESSAGE>`;
}

export function buildTallyXml(vouchers: Voucher[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>${vouchers.map(voucherXml).join('')}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;
}
