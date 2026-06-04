/**
 * Integration tests: voice-entry pipeline
 *
 * Covers the full flow:
 *   captureTranscript() → transcript: string | null
 *     → parseVoiceInput(transcript, { searchLibrary }) → VoiceParseResult
 *       → AddItem consumption contracts (matchedItem / newName / no-op)
 *
 * captureTranscript is mocked (native recording is on-device only).
 * parseVoiceInput is called with a real injectable searchLibrary stub.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Item } from '../domain/types';

// Mock the Capacitor plugin before module import.
vi.mock('@capacitor-community/speech-recognition', () => ({
  SpeechRecognition: {
    available: vi.fn(),
    requestPermissions: vi.fn(),
    start: vi.fn(),
  },
}));

import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { captureTranscript, isVoiceAvailable } from './capture';
import { parseVoiceInput } from './parse';

const mockAvailable = vi.mocked(SpeechRecognition.available);
const mockRequestPermissions = vi.mocked(SpeechRecognition.requestPermissions);
const mockStart = vi.mocked(SpeechRecognition.start);

// ---------------------------------------------------------------------------
// Test library stub
// ---------------------------------------------------------------------------
const stubItem = (name: string): Item => ({
  id: `item-${name}`,
  canonicalName: name,
  nameLower: name.toLowerCase(),
  aliases: [],
  barcodes: [],
  category: 'gulay',
  form: 'timbang',
  defaultUnit: 'kg',
  lastPricePerBaseUnit: null,
  lastUnit: null,
  lastBaseUnit: null,
  lastPriceDate: null,
  lastMarketId: null,
  lastMarketName: null,
  lastVariant: null,
  purchaseCount: 0,
});

function makeSearchLibrary(items: Item[]) {
  return (query: string) =>
    items.filter((it) => it.nameLower.startsWith(query.toLowerCase()));
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Full happy path: capture → parse → matched library item
// ---------------------------------------------------------------------------

describe('full happy path — transcript captured and library item matched', () => {
  it('returns a matched item with qty, unit, and price prefilled', async () => {
    mockAvailable.mockResolvedValue({ available: true });
    mockRequestPermissions.mockResolvedValue({ speechRecognition: 'granted' });
    mockStart.mockResolvedValue({ matches: ['2 kilo repolyo 50 piso'] });

    const transcript = await captureTranscript();
    expect(transcript).toBe('2 kilo repolyo 50 piso');

    const repolyo = stubItem('repolyo');
    const result = parseVoiceInput(transcript!, {
      searchLibrary: makeSearchLibrary([repolyo]),
    });

    expect(result.qty).toBe(2);
    expect(result.unit).toBe('kg');
    expect(result.price).toBe(50);
    expect(result.itemName).toBe('repolyo');
    expect(result.matchedItem?.id).toBe('item-repolyo');
  });
});

// ---------------------------------------------------------------------------
// 2. Transcript null → parseVoiceInput not called (AddItem no-ops)
// ---------------------------------------------------------------------------

describe('capture returns null → no-op in AddItem', () => {
  it('captureTranscript returns null when unavailable', async () => {
    mockAvailable.mockResolvedValue({ available: false });
    const transcript = await captureTranscript();
    expect(transcript).toBeNull();
    // AddItem checks: if (!transcript) return — no parse call needed.
  });

  it('captureTranscript returns null when permission denied', async () => {
    mockAvailable.mockResolvedValue({ available: true });
    mockRequestPermissions.mockResolvedValue({ speechRecognition: 'denied' });
    const transcript = await captureTranscript();
    expect(transcript).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Transcript captured but no library match → newName path
// ---------------------------------------------------------------------------

describe('transcript captured, no library match → itemName set, matchedItem null', () => {
  it('returns non-null itemName and null matchedItem for unknown item', async () => {
    mockAvailable.mockResolvedValue({ available: true });
    mockRequestPermissions.mockResolvedValue({ speechRecognition: 'granted' });
    mockStart.mockResolvedValue({ matches: ['3 piraso sibuyas 30 pesos'] });

    const transcript = await captureTranscript();
    expect(transcript).not.toBeNull();

    // Library has no sibuyas.
    const result = parseVoiceInput(transcript!, {
      searchLibrary: makeSearchLibrary([]),
    });

    expect(result.itemName).toBe('sibuyas');
    expect(result.matchedItem).toBeNull();
    // AddItem branches: matchedItem null + itemName non-empty → newName = itemName
    expect(result.itemName.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Total parse failure (empty itemName) → no-op in AddItem
// ---------------------------------------------------------------------------

describe('empty transcript → total parse failure', () => {
  it('parseVoiceInput on empty string → all-null result', () => {
    const result = parseVoiceInput('', {
      searchLibrary: makeSearchLibrary([]),
    });
    expect(result.itemName).toBe('');
    expect(result.qty).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.price).toBeNull();
    expect(result.matchedItem).toBeNull();
    // AddItem: itemName empty → no-op, stay on picker, manual entry.
  });
});

// ---------------------------------------------------------------------------
// 5. Boundary contract: VoiceParseResult shape
// ---------------------------------------------------------------------------

describe('VoiceParseResult contract — all fields present', () => {
  it('result always has all required keys regardless of parse outcome', () => {
    const result = parseVoiceInput('kamatis', {
      searchLibrary: makeSearchLibrary([]),
    });
    expect(result).toHaveProperty('itemName');
    expect(result).toHaveProperty('qty');
    expect(result).toHaveProperty('unit');
    expect(result).toHaveProperty('price');
    expect(result).toHaveProperty('matchedItem');
  });
});

// ---------------------------------------------------------------------------
// 6. Cross-module failure: captureTranscript throws internally → null
// ---------------------------------------------------------------------------

describe('captureTranscript internal error → null, no crash', () => {
  it('returns null when start() rejects', async () => {
    mockAvailable.mockResolvedValue({ available: true });
    mockRequestPermissions.mockResolvedValue({ speechRecognition: 'granted' });
    mockStart.mockRejectedValue(new Error('microphone busy'));

    const transcript = await captureTranscript();
    expect(transcript).toBeNull();
    // AddItem receives null → no parse call, no error displayed.
  });
});
