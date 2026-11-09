/** Integer paise. Rupee values exist only at the edges: seed input and display. */
export type Paise = number;

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

/** Half-up in integer space, because float percentages drift by a paisa on real invoices. */
export function percentOf(amount: Paise, basisPoints: number): Paise {
  return Math.floor((amount * basisPoints + 5000) / 10000);
}

const wholeRupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const exactRupees = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,24,500 when whole, ₹777.60 otherwise. */
export function formatRupees(paise: Paise): string {
  const rupees = paise / 100;
  return `₹${(paise % 100 === 0 ? wholeRupees : exactRupees).format(rupees)}`;
}

/** Always two decimals, for totals that a person will compare with an invoice. */
export function formatRupeesExact(paise: Paise): string {
  return `₹${exactRupees.format(paise / 100)}`;
}

/** 1800 becomes "18%", 250 becomes "2.5%". */
export function formatPercent(basisPoints: number): string {
  return `${basisPoints / 100}%`;
}
