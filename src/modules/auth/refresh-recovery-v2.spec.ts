import { describe, expect, it } from 'vitest';
import { decryptRecoveryResult, encryptRecoveryResult, resolveRecoveryKeys, validateOriginAndFetchMetadata } from './refresh-recovery-v2.js';

describe('refresh V2 cryptographic recovery and exact Origin', () => {
  const oldKey = 'a'.repeat(64), newKey = 'b'.repeat(64);
  const aad = { sessionId: '00000000-0000-4000-8000-000000000001', operationHash: 'c'.repeat(64), inputGeneration: 0, outputGeneration: 1, authVersion: 2 };
  const payload = { accessToken: 'synthetic.access', refreshToken: 'synthetic.refresh', tokenType: 'Bearer', sessionId: aad.sessionId, inputGeneration: 0, outputGeneration: 1, authVersion: 2, accessExpiresAtMs: 10000, refreshExpiresAtMs: 20000, resultExpiresAtMs: 9000 };
  it('recovers the same authenticated payload across an explicit key rotation', () => {
    const first = resolveRecoveryKeys(oldKey, undefined)!;
    const encrypted = encryptRecoveryResult(payload, aad.operationHash, first);
    const rotated = resolveRecoveryKeys(newKey, undefined, oldKey)!;
    expect(rotated.currentKeyId).not.toBe(first.currentKeyId);
    expect(rotated.currentKeyId.length).toBeLessThanOrEqual(32);
    expect(decryptRecoveryResult(encrypted, aad, rotated)).toEqual(payload);
    expect(() => decryptRecoveryResult(encrypted, aad, resolveRecoveryKeys(newKey, undefined)!)).toThrow();
    expect(() => decryptRecoveryResult(encrypted, { ...aad, operationHash: 'd'.repeat(64) }, rotated)).toThrow();
  });
  it('also reads legacy explicit-key envelopes when a previous key is configured', () => {
    const legacy = { currentKeyId: 'v2-explicit-1', keys: new Map([['v2-explicit-1', Buffer.from(oldKey, 'hex')]]) };
    const encrypted = encryptRecoveryResult(payload, aad.operationHash, legacy);
    expect(decryptRecoveryResult(encrypted, aad, resolveRecoveryKeys(newKey, undefined, oldKey)!)).toEqual(payload);
  });
  it.each(['https://site.example/path', 'https://user@site.example', 'https://site.example/', 'https://evil.example', 'null'])('rejects an unserialized or foreign Origin: %s', origin => {
    expect(validateOriginAndFetchMetadata(origin, 'same-origin', 'cors', undefined, ['https://site.example']).ok).toBe(false);
  });
});
