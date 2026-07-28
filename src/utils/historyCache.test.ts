import { describe, it, expect } from 'vitest';
import { prependToHistoryCache, type HistoryCache } from './historyCache';
import type { PendingTransaction } from '../types';

function tx(hash: string): PendingTransaction {
  return {
    hash,
    to: '0xabcdef0123456789abcdef0123456789abcdef01',
    value: '0',
    data: '0x',
    numApprovals: 2,
    threshold: 2,
    executed: true,
    cancelled: false,
    timestamp: 0,
    proposer: '0xabcdef0123456789abcdef0123456789abcdef01',
    approvals: {},
    transactionType: 'transfer',
    decodedParams: null,
    status: 'executed',
    expiration: 0,
    executionDelay: 0,
    approvedAt: 0,
    executableAfter: 0,
    isExpired: false,
    failedReturnData: null,
  };
}

function cache(pages: Array<{ hashes: string[]; total: number; hasMore: boolean }>): HistoryCache {
  return {
    pages: pages.map((p) => ({
      data: p.hashes.map(tx),
      total: p.total,
      hasMore: p.hasMore,
    })),
    pageParams: pages.map((_, i) => i * 50),
  };
}

describe('prependToHistoryCache', () => {
  it('returns undefined when nothing is cached', () => {
    expect(prependToHistoryCache(undefined, tx('0xnew'))).toBeUndefined();
  });

  it('leaves an empty page list alone', () => {
    const empty: HistoryCache = { pages: [], pageParams: [] };
    expect(prependToHistoryCache(empty, tx('0xnew'))).toBe(empty);
  });

  it('prepends to the first page and bumps the total', () => {
    const result = prependToHistoryCache(cache([{ hashes: ['0xa'], total: 1, hasMore: false }]), tx('0xnew'));

    expect(result!.pages[0].data.map((t) => t.hash)).toEqual(['0xnew', '0xa']);
    expect(result!.pages[0].total).toBe(2);
  });

  it('leaves later pages untouched', () => {
    const result = prependToHistoryCache(
      cache([
        { hashes: ['0xa'], total: 2, hasMore: true },
        { hashes: ['0xb'], total: 2, hasMore: false },
      ]),
      tx('0xnew')
    );

    expect(result!.pages).toHaveLength(2);
    expect(result!.pages[1].data.map((t) => t.hash)).toEqual(['0xb']);
    expect(result!.pages[1].total).toBe(2);
  });

  // A refetch landing before the optimistic write must not yield two rows.
  it('is a no-op when the transaction is already on the first page', () => {
    const existing = cache([{ hashes: ['0xnew', '0xa'], total: 2, hasMore: false }]);
    expect(prependToHistoryCache(existing, tx('0xnew'))).toBe(existing);
  });

  it('is a no-op when the transaction is already on a later page', () => {
    const existing = cache([
      { hashes: ['0xa'], total: 2, hasMore: true },
      { hashes: ['0xnew'], total: 2, hasMore: false },
    ]);
    expect(prependToHistoryCache(existing, tx('0xnew'))).toBe(existing);
  });

  it('does not mutate the input cache', () => {
    const original = cache([{ hashes: ['0xa'], total: 1, hasMore: false }]);
    prependToHistoryCache(original, tx('0xnew'));

    expect(original.pages[0].data.map((t) => t.hash)).toEqual(['0xa']);
    expect(original.pages[0].total).toBe(1);
  });
});
