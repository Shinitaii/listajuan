import type { Item, Unit } from '../domain/types';

export interface VoiceParseResult {
  itemName: string;         // the text left after extracting qty/unit/price
  qty: number | null;       // numeric quantity extracted, or null
  unit: Unit | null;        // mapped Unit value, or null
  price: number | null;     // numeric price extracted, or null
  matchedItem: Item | null; // first searchLibrary hit on itemName, or null
}

export interface VoiceParseDeps {
  searchLibrary?: (query: string) => Item[];
}

// ---------------------------------------------------------------------------
// UNIT_MAP — maps every spoken/written unit alias to its canonical Unit value.
//
// Future extension — Tagalog number words (NOT implemented in v1):
//   dalawa=2  tatlo=3  apat=4  lima=5  anim=6  pito=7  walo=8  siyam=9  sampu=10
// When v2 adds spoken-number support, a pre-pass should replace these words
// with their digit equivalents before the quantity regex runs.
// ---------------------------------------------------------------------------
const UNIT_MAP: Record<string, Unit> = {
  kilo: 'kg',
  kilos: 'kg',
  kg: 'kg',
  gramo: 'g',
  grams: 'g',
  g: 'g',
  litro: 'L',
  liter: 'L',
  liters: 'L',
  L: 'L',
  ml: 'ml',
  milliliter: 'ml',
  piraso: 'piraso',
  piece: 'piraso',
  pieces: 'piraso',
  pcs: 'piraso',
  dosena: 'dosena',
  dozen: 'dosena',
  // Bisaya
  usa: 'piraso',
  duha: 'piraso',
  gatosan: 'g',
  // Ilocano
  maysa: 'piraso',
  kilon: 'kg',
  dua: 'piraso',
};

// Ordered longest-first so alternation matches greedily (e.g. "liters" before "liter").
const UNIT_PATTERN = Object.keys(UNIT_MAP)
  .sort((a, b) => b.length - a.length)
  .join('|');

// Matches an integer or decimal quantity followed by a unit word.
// Group 1: numeric string, Group 2: unit word.
const QTY_UNIT_RE = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})\\b`,
  'i'
);

// Price marker: "₱" prefix OR number followed by "piso"/"peso"/"pesos".
// Group 1: number after ₱ ; Group 2: number before piso/pesos?
const PRICE_MARKER_RE =
  /₱\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:piso|pesos?)/i;

// Standalone number (fallback price — last number in remaining text).
const STANDALONE_NUM_RE = /\d+(?:\.\d+)?/g;

export function parseVoiceInput(
  transcript: string,
  deps?: VoiceParseDeps
): VoiceParseResult {
  const trimmed = transcript.trim();

  if (!trimmed) {
    return { itemName: '', qty: null, unit: null, price: null, matchedItem: null };
  }

  let working = trimmed;

  // --- 1. Extract quantity + unit ---
  let qty: number | null = null;
  let unit: Unit | null = null;

  const qtyMatch = QTY_UNIT_RE.exec(working);
  if (qtyMatch) {
    qty = parseFloat(qtyMatch[1]);
    unit = UNIT_MAP[qtyMatch[2].toLowerCase()] ?? UNIT_MAP[qtyMatch[2]] ?? null;
    working = working.slice(0, qtyMatch.index) + working.slice(qtyMatch.index + qtyMatch[0].length);
  }

  // --- 2. Extract price ---
  let price: number | null = null;

  const priceMarkerMatch = PRICE_MARKER_RE.exec(working);
  if (priceMarkerMatch) {
    // Group 1: ₱ form; Group 2: suffix form
    price = parseFloat(priceMarkerMatch[1] ?? priceMarkerMatch[2]);
    working =
      working.slice(0, priceMarkerMatch.index) +
      working.slice(priceMarkerMatch.index + priceMarkerMatch[0].length);
  } else {
    // Fallback: use last standalone number in remaining text as price
    const allNums = [...working.matchAll(STANDALONE_NUM_RE)];
    if (allNums.length > 0) {
      const last = allNums[allNums.length - 1];
      price = parseFloat(last[0]);
      working =
        working.slice(0, last.index!) +
        working.slice(last.index! + last[0].length);
    }
  }

  // --- 3. itemName: collapse remaining whitespace ---
  const itemName = working.replace(/\s+/g, ' ').trim();

  // --- 4. matchedItem ---
  const matchedItem = deps?.searchLibrary?.(itemName)?.[0] ?? null;

  return { itemName, qty, unit, price, matchedItem };
}
