import { describe, it, expect } from 'vitest';

// Pure unit tests for the token-parsing logic used in JoinList.svelte.
// These do not import the Svelte component (no DOM needed).

function parseToken(hash: string): string | null {
  const qs = hash.split('?')[1] ?? '';
  return new URLSearchParams(qs).get('token');
}

describe('JoinList token parsing', () => {
  it('extracts token from a well-formed hash route', () => {
    expect(parseToken('#/join?token=abc123')).toBe('abc123');
  });

  it('returns null when token param is absent', () => {
    expect(parseToken('#/join')).toBeNull();
  });

  it('returns null for an empty hash', () => {
    expect(parseToken('')).toBeNull();
  });

  it('handles token with special URL-safe characters', () => {
    expect(parseToken('#/join?token=V1StGXR8_Z5jdHi6B-myT')).toBe('V1StGXR8_Z5jdHi6B-myT');
  });
});

describe('JoinList error message mapping', () => {
  function mapError(code: string): string {
    if (code === 'ALREADY_IN_LIST') return 'May sarili ka nang listahan. Umalis muna bago sumali sa isa pa.';
    if (code === 'INVITE_EXPIRED')  return 'Expired na ang link. Humingi ng bagong link sa may-ari.';
    if (code === 'INVITE_NOT_FOUND') return 'Hindi mahanap ang invite. Maaaring nagamit na.';
    return 'May problema sa pagsali. Subukan ulit.';
  }

  it('ALREADY_IN_LIST → Filipino warning', () => {
    expect(mapError('ALREADY_IN_LIST')).toContain('sarili ka nang listahan');
  });

  it('INVITE_EXPIRED → expired message', () => {
    expect(mapError('INVITE_EXPIRED')).toContain('Expired na ang link');
  });

  it('INVITE_NOT_FOUND → not found message', () => {
    expect(mapError('INVITE_NOT_FOUND')).toContain('Hindi mahanap');
  });

  it('unknown error → generic fallback', () => {
    expect(mapError('SOMETHING_ELSE')).toContain('May problema');
  });
});
