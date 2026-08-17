import { describe, expect, it } from 'vitest';
import { quoteUnsafeIntegers } from './jsonBigInt';

const parse = (json: string) => JSON.parse(quoteUnsafeIntegers(json));

describe('quoteUnsafeIntegers', () => {
  it('preserves exact DAO token totals above Number.MAX_SAFE_INTEGER', () => {
    expect(parse('{"total_shares":1234567890123456789012345}').total_shares)
      .toBe('1234567890123456789012345');
  });

  it('quotes unsafe integers even when JavaScript prints the same decimal token', () => {
    const value = parse('{"proposal_offering":100000000000000000000}');
    expect(value.proposal_offering).toBe('100000000000000000000');
  });

  it('leaves Number.MAX_SAFE_INTEGER as a number', () => {
    expect(parse('{"value":9007199254740991}').value).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('leaves safe governance durations and counts as numbers', () => {
    expect(parse('{"voting_period":604800,"proposal_count":12}'))
      .toEqual({ voting_period: 604800, proposal_count: 12 });
  });

  it('never rewrites digits inside untrusted profile strings', () => {
    expect(parse('{"name":"The 123456789012345678901 DAO"}').name)
      .toBe('The 123456789012345678901 DAO');
  });

  it('handles escaped quotes without leaving string mode', () => {
    const value = parse('{"name":"The \\"large\\" DAO","loot":1000000000000000000000}');
    expect(value).toEqual({ name: 'The "large" DAO', loot: '1000000000000000000000' });
  });
});
