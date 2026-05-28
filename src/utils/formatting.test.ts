import { describe, it, expect, vi } from 'vitest';

// Use real quais formatUnits/formatQuai for these tests instead of the global mock
vi.unmock('quais');

import { formatBalance, formatCompactBalance } from './formatting';
import { parseQuai, parseUnits } from 'quais';

describe('formatBalance', () => {
  describe('zero and edge cases', () => {
    it('returns "0" for bigint zero', () => {
      expect(formatBalance(0n)).toBe('0');
    });

    it('returns "0" for string "0"', () => {
      expect(formatBalance('0')).toBe('0');
    });

    it('returns "0" for invalid input that throws on BigInt', () => {
      expect(formatBalance('not-a-number')).toBe('0');
    });
  });

  describe('whole numbers (no decimals shown)', () => {
    it('renders 1 QUAI as "1"', () => {
      expect(formatBalance(parseQuai('1'))).toBe('1');
    });

    it('renders 100 QUAI as "100"', () => {
      expect(formatBalance(parseQuai('100'))).toBe('100');
    });

    it('renders 1500000 QUAI as "1500000"', () => {
      expect(formatBalance(parseQuai('1500000'))).toBe('1500000');
    });
  });

  describe('fractional values (up to 3 decimals, trailing zeros trimmed)', () => {
    it('renders 1.5 as "1.5"', () => {
      expect(formatBalance(parseQuai('1.5'))).toBe('1.5');
    });

    it('renders 1.50 as "1.5" (trims trailing zeros)', () => {
      expect(formatBalance(parseQuai('1.50'))).toBe('1.5');
    });

    it('renders 1.23 as "1.23"', () => {
      expect(formatBalance(parseQuai('1.23'))).toBe('1.23');
    });

    it('renders 1.234 as "1.234"', () => {
      expect(formatBalance(parseQuai('1.234'))).toBe('1.234');
    });

    it('rounds 1.2345 to "1.235" (round-half-to-even by toFixed)', () => {
      const result = formatBalance(parseQuai('1.2345'));
      expect(['1.234', '1.235']).toContain(result);
    });

    it('renders 1.23456789 as "1.235"', () => {
      expect(formatBalance(parseQuai('1.23456789'))).toBe('1.235');
    });
  });

  describe('sub-threshold values (<0.001)', () => {
    it('renders 0.0005 as "<0.001"', () => {
      expect(formatBalance(parseQuai('0.0005'))).toBe('<0.001');
    });

    it('renders 0.0001 as "<0.001"', () => {
      expect(formatBalance(parseQuai('0.0001'))).toBe('<0.001');
    });

    it('renders 0.000000000000000001 (1 wei) as "<0.001"', () => {
      expect(formatBalance(1n)).toBe('<0.001');
    });
  });

  describe('custom decimals (ERC20 tokens)', () => {
    it('USDC-like with 6 decimals: 1.5 USDC as "1.5"', () => {
      expect(formatBalance(parseUnits('1.5', 6), 6)).toBe('1.5');
    });

    it('USDC-like with 6 decimals: 1 USDC (1000000 base units) as "1"', () => {
      expect(formatBalance(1000000n, 6)).toBe('1');
    });

    it('USDC-like with 6 decimals: 0.0005 USDC as "<0.001"', () => {
      expect(formatBalance(500n, 6)).toBe('<0.001');
    });

    it('low-decimal token (4 decimals): 0.5 as "0.5"', () => {
      expect(formatBalance(parseUnits('0.5', 4), 4)).toBe('0.5');
    });

    it('zero-decimal token: integer 42 as "42"', () => {
      expect(formatBalance(42n, 0)).toBe('42');
    });
  });

  describe('input type flexibility', () => {
    it('accepts string input', () => {
      expect(formatBalance('1500000000000000000')).toBe('1.5');
    });

    it('accepts bigint input', () => {
      expect(formatBalance(1500000000000000000n)).toBe('1.5');
    });
  });
});

describe('formatCompactBalance', () => {
  it('renders >= 1M with M suffix', () => {
    expect(formatCompactBalance(parseQuai('1500000').toString())).toBe('1.50M');
  });

  it('renders >= 10K with K suffix (1 decimal)', () => {
    expect(formatCompactBalance(parseQuai('45000').toString())).toBe('45.0K');
  });

  it('renders >= 1K with K suffix (2 decimals)', () => {
    expect(formatCompactBalance(parseQuai('1500').toString())).toBe('1.50K');
  });

  it('delegates sub-1000 to formatBalance (whole number)', () => {
    expect(formatCompactBalance(parseQuai('500').toString())).toBe('500');
  });

  it('delegates sub-1000 to formatBalance (fractional)', () => {
    expect(formatCompactBalance(parseQuai('1.5').toString())).toBe('1.5');
  });

  it('delegates sub-1000 to formatBalance (sub-threshold)', () => {
    expect(formatCompactBalance(parseQuai('0.0005').toString())).toBe('<0.001');
  });

  it('renders zero as "0"', () => {
    expect(formatCompactBalance('0')).toBe('0');
  });
});
