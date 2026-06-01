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
