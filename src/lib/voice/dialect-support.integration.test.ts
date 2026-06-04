/**
 * Integration tests: dialect-support
 *
 * Covers the cross-module contracts added by dialect-support:
 *   getDialect / setDialect (lang.ts)
 *     → captureTranscript(lang) — lang forwarded to SpeechRecognition.start
 *       → parseVoiceInput(transcript) — Bisaya/Ilocano unit synonyms resolve correctly
 *
 * Proves the full golden path: dialect selected → transcript captured with that
 * dialect's engine code → Bisaya/Ilocano units parsed to canonical Unit values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Capacitor plugin before module import.
vi.mock('@capacitor-community/speech-recognition', () => ({
  SpeechRecognition: {
    available: vi.fn(),
    requestPermissions: vi.fn(),
    start: vi.fn(),
  },
}));

// Stub localStorage (node environment has none).
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  clear: () => { for (const k in store) delete store[k]; },
});

import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { captureTranscript } from './capture';
import { parseVoiceInput } from './parse';
import { getDialect, setDialect } from './lang';

const mockAvailable = vi.mocked(SpeechRecognition.available);
const mockRequestPermissions = vi.mocked(SpeechRecognition.requestPermissions);
const mockStart = vi.mocked(SpeechRecognition.start);

function readyMocks(transcript: string) {
  mockAvailable.mockResolvedValue({ available: true });
  mockRequestPermissions.mockResolvedValue({ speechRecognition: 'granted' });
  mockStart.mockResolvedValue({ matches: [transcript] });
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const k in store) delete store[k]; // clear localStorage stub
});

// ---------------------------------------------------------------------------
// 1. Lang preference: setDialect persists, getDialect reads back
// ---------------------------------------------------------------------------

describe('dialect preference round-trip', () => {
  it('getDialect returns fil-PH by default', () => {
    expect(getDialect()).toBe('fil-PH');
  });

  it('setDialect + getDialect round-trips en-PH', () => {
    setDialect('en-PH');
    expect(getDialect()).toBe('en-PH');
  });

  it('setDialect + getDialect round-trips back to fil-PH', () => {
    setDialect('fil-PH');
    expect(getDialect()).toBe('fil-PH');
  });
});

// ---------------------------------------------------------------------------
// 2. captureTranscript forwards the dialect code to the speech engine
// ---------------------------------------------------------------------------

describe('captureTranscript forwards dialect to SpeechRecognition.start', () => {
  it('default (no arg) uses fil-PH', async () => {
    readyMocks('test');
    await captureTranscript();
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ language: 'fil-PH' }));
  });

  it('explicit en-PH forwarded correctly', async () => {
    readyMocks('test');
    await captureTranscript('en-PH');
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ language: 'en-PH' }));
  });

  it('getDialect() result passed to captureTranscript flows through', async () => {
    setDialect('en-PH');
    readyMocks('1 kilo baboy 200 pesos');
    const lang = getDialect();
    await captureTranscript(lang);
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ language: 'en-PH' }));
  });
});

// ---------------------------------------------------------------------------
// 3. Bisaya unit synonyms parsed end-to-end
// ---------------------------------------------------------------------------

describe('Bisaya unit synonyms — full pipeline', () => {
  it('gatosan → g: "100 gatosan luya 35 piso" parses correctly', async () => {
    readyMocks('100 gatosan luya 35 piso');
    const transcript = await captureTranscript('fil-PH');
    expect(transcript).not.toBeNull();
    const result = parseVoiceInput(transcript!);
    expect(result.qty).toBe(100);
    expect(result.unit).toBe('g');
    expect(result.itemName).toBe('luya');
    expect(result.price).toBe(35);
  });

  it('usa → piraso: "1 usa isda 50 piso" parses correctly', async () => {
    readyMocks('1 usa isda 50 piso');
    const transcript = await captureTranscript('fil-PH');
    const result = parseVoiceInput(transcript!);
    expect(result.qty).toBe(1);
    expect(result.unit).toBe('piraso');
    expect(result.itemName).toBe('isda');
    expect(result.price).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// 4. Ilocano unit synonyms parsed end-to-end
// ---------------------------------------------------------------------------

describe('Ilocano unit synonyms — full pipeline', () => {
  it('kilon → kg: "2 kilon baboy 200 piso" parses correctly', async () => {
    readyMocks('2 kilon baboy 200 piso');
    const transcript = await captureTranscript('fil-PH');
    const result = parseVoiceInput(transcript!);
    expect(result.qty).toBe(2);
    expect(result.unit).toBe('kg');
    expect(result.itemName).toBe('baboy');
    expect(result.price).toBe(200);
  });

  it('maysa → piraso: "1 maysa kamatis 20 piso" parses correctly', async () => {
    readyMocks('1 maysa kamatis 20 piso');
    const transcript = await captureTranscript('fil-PH');
    const result = parseVoiceInput(transcript!);
    expect(result.qty).toBe(1);
    expect(result.unit).toBe('piraso');
    expect(result.itemName).toBe('kamatis');
    expect(result.price).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 5. Existing Tagalog path unaffected after dialect-support changes
// ---------------------------------------------------------------------------

describe('Tagalog path regression — unchanged after dialect-support', () => {
  it('"2 kilo repolyo 50 piso" still parses correctly', async () => {
    readyMocks('2 kilo repolyo 50 piso');
    const transcript = await captureTranscript();
    const result = parseVoiceInput(transcript!);
    expect(result.qty).toBe(2);
    expect(result.unit).toBe('kg');
    expect(result.itemName).toBe('repolyo');
    expect(result.price).toBe(50);
  });
});
