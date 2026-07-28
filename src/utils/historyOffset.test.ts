import { describe, it, expect } from 'vitest';
import { nextHistoryOffset, HISTORY_PAGE_SIZE } from './historyCache';
import type { PaginatedResult } from '../services/indexer/IndexerTransactionService';

function page(count: number, total: number, hasMore: boolean): PaginatedResult<number> {
  return { data: Array.from({ length: count }, (_, i) => i), total, hasMore };
}

describe('nextHistoryOffset', () => {
  it('stops when the last page reports no more rows', () => {
    const last = page(HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE, false);
    expect(nextHistoryOffset(last, [last])).toBeUndefined();
  });

  it('offsets by the number of rows loaded so far', () => {
    const first = page(HISTORY_PAGE_SIZE, 130, true);
    expect(nextHistoryOffset(first, [first])).toBe(HISTORY_PAGE_SIZE);
  });

  it('accumulates across pages', () => {
    const first = page(HISTORY_PAGE_SIZE, 130, true);
    const second = page(HISTORY_PAGE_SIZE, 130, true);
    expect(nextHistoryOffset(second, [first, second])).toBe(HISTORY_PAGE_SIZE * 2);
  });

  // An optimistic prepend grows page 0 by one; the next offset must account for
  // it, since that row shifted everything below it down by one position.
  it('accounts for a row prepended into the first page', () => {
    const first = page(HISTORY_PAGE_SIZE + 1, 131, true);
    expect(nextHistoryOffset(first, [first])).toBe(HISTORY_PAGE_SIZE + 1);
  });

  it('handles a short final page', () => {
    const first = page(HISTORY_PAGE_SIZE, 60, true);
    const second = page(10, 60, false);
    expect(nextHistoryOffset(second, [first, second])).toBeUndefined();
  });

  // Without the guard the offset would stop advancing and fetchNextPage would
  // request the same empty page forever.
  it('stops when a page claims hasMore but returns nothing', () => {
    const first = page(HISTORY_PAGE_SIZE, 130, true);
    const empty = page(0, 130, true);
    expect(nextHistoryOffset(empty, [first, empty])).toBeUndefined();
  });
});
