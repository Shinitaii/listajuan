const STORAGE_KEY = 'voice_dialect';
const DEFAULT_DIALECT = 'fil-PH';

export interface DialectOption {
  label: string;
  lang: string;
}

export const DIALECT_OPTIONS: DialectOption[] = [
  { label: 'Tagalog', lang: 'fil-PH' },
  { label: 'Bisaya',  lang: 'fil-PH' },
  { label: 'Ilocano', lang: 'fil-PH' },
  { label: 'Ingles',  lang: 'en-PH'  },
];

export function getDialect(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ?? DEFAULT_DIALECT;
  } catch {
    return DEFAULT_DIALECT;
  }
}

export function setDialect(lang: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // silently ignore storage errors
  }
}
