import { describe, it, expect } from 'vitest';
import { toPersianDigits, formatBytes, formatDaysLeft, formatPrice } from '../format';

describe('toPersianDigits', () => {
  it('should convert ASCII digits to Persian', () => {
    expect(toPersianDigits('123')).toBe('۱۲۳');
  });

  it('should leave non-digit characters unchanged', () => {
    expect(toPersianDigits('abc 123 def')).toBe('abc ۱۲۳ def');
  });

  it('should handle empty string', () => {
    expect(toPersianDigits('')).toBe('');
  });
});

describe('formatBytes', () => {
  it('should format gigabytes', () => {
    expect(formatBytes(20 * 1073741824)).toBe('۲۰ GB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(100 * 1048576)).toBe('۱۰۰ MB');
  });

  it('should format fractional gigabytes', () => {
    expect(formatBytes(1.5 * 1073741824)).toBe('۱.۵ GB');
  });
});

describe('formatDaysLeft', () => {
  it('should return 0 days for past dates', () => {
    const past = new Date(Date.now() - 86400000);
    expect(formatDaysLeft(past)).toBe('۰ روز');
  });

  it('should return correct days for future dates', () => {
    const future = new Date(Date.now() + 15 * 86400000);
    expect(formatDaysLeft(future)).toBe('۱۵ روز');
  });
});

describe('formatPrice', () => {
  it('should format with Persian digits and تومان', () => {
    expect(formatPrice(50000)).toBe('۵۰,۰۰۰ تومان');
  });

  it('should handle zero', () => {
    expect(formatPrice(0)).toBe('۰ تومان');
  });
});
