/** Integer paise. Rupee values exist only at the edges: seed input and display. */
export type Paise = number;

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

/** Half-up in integer space, because float percentages drift by a paisa on real invoices. */
export function percentOf(amount: Paise, basisPoints: number): Paise {
  return Math.floor((amount * basisPoints + 5000) / 10000);
}
