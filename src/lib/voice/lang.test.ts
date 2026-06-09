import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DIALECT_OPTIONS, getDialect, setDialect } from './lang';

// localStorage is not available in the node test environment.
// Stub a minimal in-memory implementation for these tests.
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  clear: vi.fn(() => { for (const k in store) delete store[k]; }),
};
vi.stubGlobal('localStorage', localStorageMock);

describe('DIALECT_OPTIONS', () => {
  it('has exactly 4 entries', () => {
    expect(DIALECT_OPTIONS).toHaveLength(4);
  });

  it('index 0 is Tagalog/fil-PH', () => {
    expect(DIALECT_OPTIONS[0]).toEqual({ label: 'Tagalog', lang: 'fil-PH' });
  });

  it('index 1 is Bisaya/fil-PH', () => {
    expect(DIALECT_OPTIONS[1]).toEqual({ label: 'Bisaya', lang: 'fil-PH' });
  });

  it('index 2 is Ilocano/fil-PH', () => {
    expect(DIALECT_OPTIONS[2]).toEqual({ label: 'Ilocano', lang: 'fil-PH' });
  });

  it('index 3 is Ingles/en-PH', () => {
    expect(DIALECT_OPTIONS[3]).toEqual({ label: 'Ingles', lang: 'en-PH' });
  });
});

describe('getDialect', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.mocked(localStorageMock.getItem).mockImplementation((key: string) => store[key] ?? null);
    vi.mocked(localStorageMock.setItem).mockImplementation((key: string, value: string) => { store[key] = value; });
  });

  it('returns fil-PH when localStorage is empty', () => {
    expect(getDialect()).toBe('fil-PH');
  });

  it('returns the stored value after setDialect is called', () => {
    setDialect('en-PH');
    expect(getDialect()).toBe('en-PH');
  });

  it('returns fil-PH if localStorage.getItem throws', () => {
    vi.mocked(localStorageMock.getItem).mockImplementation(() => { throw new Error('storage error'); });
    expect(getDialect()).toBe('fil-PH');
  });
});

describe('setDialect', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.mocked(localStorageMock.getItem).mockImplementation((key: string) => store[key] ?? null);
    vi.mocked(localStorageMock.setItem).mockImplementation((key: string, value: string) => { store[key] = value; });
  });

  it('persists the value so getDialect reads it back', () => {
    setDialect('fil-PH');
    expect(getDialect()).toBe('fil-PH');
  });

  it('does not throw when localStorage.setItem throws', () => {
    vi.mocked(localStorageMock.setItem).mockImplementation(() => { throw new Error('quota exceeded'); });
    expect(() => setDialect('en-PH')).not.toThrow();
  });
});
