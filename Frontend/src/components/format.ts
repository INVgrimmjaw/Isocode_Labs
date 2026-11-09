const wholeRupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const exactRupees = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,24,500 when whole, ₹777.60 otherwise. */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${(paise % 100 === 0 ? wholeRupees : exactRupees).format(rupees)}`;
}

/** Always two decimals, for totals that a person will compare with an invoice. */
export function formatRupeesExact(paise: number): string {
  return `₹${exactRupees.format(paise / 100)}`;
}

/** 1800 becomes "18%", 250 becomes "2.5%". */
export function formatPercent(basisPoints: number): string {
  return `${basisPoints / 100}%`;
}

export function formatDate(iso: string, locale = 'en-IN'): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string, locale = 'en-IN'): string {
  const time = new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  return `${formatDate(iso, locale)}, ${time}`;
}

/** A SKU name without the "case of 96" the seed data carries, which a shopkeeper reads elsewhere. */
export function shortName(name: string): string {
  return name.split(',')[0] ?? name;
}
