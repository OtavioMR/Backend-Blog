import { describe, expect, it } from 'vitest';
import { likePattern } from './like-pattern.js';

describe('likePattern', () => {
  it('escapes SQL wildcards and backslashes after trimming', () => {
    expect(likePattern('  a%_\\b  ')).toBe('%a\\%\\_\\\\b%');
  });
});
