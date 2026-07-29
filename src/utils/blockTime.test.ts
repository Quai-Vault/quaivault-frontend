import { describe, it, expect } from 'vitest';
import {
  blocksToMilliseconds,
  formatTimePeriod,
  getBlockRangeTimePeriod,
  getBlockRangeLimit,
} from './blockTime';

describe('blocksToMilliseconds', () => {
  it('converts using Quai’s ~5 second block time by default', () => {
    expect(blocksToMilliseconds(100)).toBe(500_000);
  });

  it('accepts a different block time', () => {
    expect(blocksToMilliseconds(100, 12)).toBe(1_200_000);
  });

  it('returns zero for no blocks', () => {
    expect(blocksToMilliseconds(0)).toBe(0);
  });
});

describe('formatTimePeriod', () => {
  it.each([
    ['seconds', 45_000, '45 seconds'],
    ['a single second', 1_000, '1 second'],
    ['minutes', 5 * 60_000, '5 minutes'],
    ['a single minute', 60_000, '1 minute'],
    ['hours', 3 * 3_600_000, '3 hours'],
    ['a single hour', 3_600_000, '1 hour'],
    ['days', 3 * 86_400_000, '3 days'],
    ['a single day', 86_400_000, '1 day'],
  ])('describes %s', (_label, ms, expected) => {
    expect(formatTimePeriod(ms)).toBe(expected);
  });

  it('singularises correctly rather than always adding an s', () => {
    expect(formatTimePeriod(60_000)).not.toContain('minutes');
  });

  // Hours round rather than truncate, so 90 minutes reads as 2 hours instead
  // of the more surprising 1.
  it('rounds to the nearest hour', () => {
    expect(formatTimePeriod(90 * 60_000)).toBe('2 hours');
    expect(formatTimePeriod(80 * 60_000)).toBe('1 hour');
  });

  it('reports zero as seconds', () => {
    expect(formatTimePeriod(0)).toBe('0 seconds');
  });
});

describe('block range', () => {
  it('exposes the limit used for event queries', () => {
    expect(getBlockRangeLimit()).toBe(5000);
  });

  it('describes the period that limit covers', () => {
    // 5000 blocks x 5s = 25000s ≈ 7 hours.
    expect(getBlockRangeTimePeriod()).toBe('7 hours');
  });
});
