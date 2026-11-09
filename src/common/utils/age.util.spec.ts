import { describe, it, expect } from 'vitest';
import { calculateAge, isUserAdult, parseBirthDateParts } from './age.util.js';

describe('age.util', () => {
  it('rejects invalid calendar dates like 2000-02-30', () => {
    expect(parseBirthDateParts('2000-02-30')).toBeNull();
    expect(parseBirthDateParts('2023-04-31')).toBeNull();
    expect(parseBirthDateParts('invalid-date')).toBeNull();
    expect(parseBirthDateParts(null)).toBeNull();
    expect(parseBirthDateParts(undefined)).toBeNull();
  });

  it('accepts leap year date 2000-02-29 and rejects non-leap 2001-02-29', () => {
    expect(parseBirthDateParts('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
    expect(parseBirthDateParts('2001-02-29')).toBeNull();
  });

  it('calculates age exactly on the 18th birthday in America/Sao_Paulo', () => {
    // Reference: 2026-11-09 at 23:00 UTC (which is 20:00 in America/Sao_Paulo on Nov 9)
    const refNov9 = new Date('2026-11-09T23:00:00Z');
    
    // Born on Nov 9, 2008 -> turns 18 on Nov 9, 2026
    expect(calculateAge('2008-11-09', refNov9)).toBe(18);
    expect(isUserAdult('2008-11-09', refNov9)).toBe(true);

    // Born on Nov 10, 2008 -> is 17 on Nov 9, 2026
    expect(calculateAge('2008-11-10', refNov9)).toBe(17);
    expect(isUserAdult('2008-11-10', refNov9)).toBe(false);

    // Born on Nov 8, 2008 -> is 18 on Nov 9, 2026
    expect(calculateAge('2008-11-08', refNov9)).toBe(18);
    expect(isUserAdult('2008-11-08', refNov9)).toBe(true);
  });

  it('handles Date instances without local timezone shift bugs', () => {
    const dobDate = new Date('2008-11-09T00:00:00Z');
    const refNov9 = new Date('2026-11-09T12:00:00Z');
    expect(calculateAge(dobDate, refNov9)).toBe(18);
    expect(isUserAdult(dobDate, refNov9)).toBe(true);
  });
});
