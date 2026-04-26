import { describe, it, expect } from 'vitest';
import { toEnglishDigits, formatBytes, formatDaysLeft, formatPrice } from '../format';

describe('toEnglishDigits', () => {
  it('should convert Persian digits to English', () => {
    expect(toEnglishDigits('۱۲۳')).toBe('123');
  });

  it('should convert Arabic digits to English', () => {
    expect(toEnglishDigits('٤٥٦')).toBe('456');
  });

  it('should leave English digits unchanged', () => {
    expect(toEnglishDigits('123')).toBe('123');
  });

  it('should handle mixed input', () => {
    expect(toEnglishDigits('abc ۱۲۳ def')).toBe('abc 123 def');
  });

  it('should handle empty string', () => {
    expect(toEnglishDigits('')).toBe('');
  });
});

describe('formatBytes', () => {
  it('should format gigabytes', () => {
    expect(formatBytes(20 * 1073741824)).toBe('20 GB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(100 * 1048576)).toBe('100 MB');
  });

  it('should format fractional gigabytes', () => {
    expect(formatBytes(1.5 * 1073741824)).toBe('1.5 GB');
  });
});

describe('formatDaysLeft', () => {
  it('should return 0 days for past dates', () => {
    const past = new Date(Date.now() - 86400000);
    expect(formatDaysLeft(past)).toBe('0 روز');
  });

  it('should return correct days for future dates', () => {
    const future = new Date(Date.now() + 15 * 86400000);
    expect(formatDaysLeft(future)).toBe('15 روز');
  });
});

describe('formatPrice', () => {
  it('should format with English digits and تومان', () => {
    expect(formatPrice(50000)).toBe('50,000 تومان');
  });

  it('should handle zero', () => {
    expect(formatPrice(0)).toBe('0 تومان');
  });
});
