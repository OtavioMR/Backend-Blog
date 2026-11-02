import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor.js';

describe('cursor', () => {
  it('preserves timestamp microseconds', () => {
    const position = { timestamp: '2026-10-01T12:34:56.123456Z', id: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' };
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it.each(['!', 'eyJpZCI6MX0', 'e30', 'a'.repeat(257)])('rejects malformed cursor %s', (value) => {
    expect(() => decodeCursor(value)).toThrow('Cursor inválido.');
  });

  it('rejects impossible dates rather than passing them to PostgreSQL', () => {
    expect(() => decodeCursor(encodeCursor({ timestamp: '2026-02-30T12:34:56.123456Z', id: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' }))).toThrow('Cursor inválido.');
  });
});
