export function lineTotal(item: { pricePaid: number | null }): number {
  return item.pricePaid ?? 0;
}

export function pricePerUnit(price: number | null, quantity: number | null): number | null {
  if (price == null || quantity == null || quantity === 0) return null;
  return price / quantity;
}

export function tripTotal(items: Array<{ pricePaid: number | null }>): number {
  return items.reduce((sum, i) => sum + lineTotal(i), 0);
}

export function monthDelta(thisMonth: number, lastMonth: number): number {
  return thisMonth - lastMonth;
}

/** Inclusive start / exclusive end ISO dates for a 1-based month. */
export function monthRange(year: number, month: number): { startISO: string; endISO: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const startISO = `${year}-${pad(month)}-01`;
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  const endISO = `${ny}-${pad(nm)}-01`;
  return { startISO, endISO };
}
