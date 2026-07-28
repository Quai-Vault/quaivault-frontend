import type { InfiniteData } from '@tanstack/react-query';
import type { PendingTransaction } from '../types';
import type { PaginatedResult } from '../services/indexer/IndexerTransactionService';

/** Shape of an infinite transaction-history query's cache. */
export type HistoryCache = InfiniteData<PaginatedResult<PendingTransaction>>;

/** Maximum rows to retain on the first page of a history cache. */
export const MAX_CACHE_TRANSACTIONS = 500;

/** Rows per request for paginated history queries. */
export const HISTORY_PAGE_SIZE = 50;

/**
 * `getNextPageParam` for any `PaginatedResult` infinite query.
 *
 * Offsets by rows actually loaded rather than by page index, so an optimistic
 * prepend into page 0 shifts subsequent offsets correctly.
 */
export function nextHistoryOffset<T>(
  lastPage: PaginatedResult<T>,
  allPages: PaginatedResult<T>[]
): number | undefined {
  if (!lastPage.hasMore) return undefined;
  // Guard against a page that reports hasMore but returns nothing — without this
  // the offset would stop advancing and `fetchNextPage` would loop on itself.
  if (lastPage.data.length === 0) return undefined;
  return allPages.reduce((sum, page) => sum + page.data.length, 0);
}

/**
 * Optimistically prepend a just-settled transaction to the first page of an
 * infinite history cache.
 *
 * No-ops when nothing is cached yet — the scheduled invalidation will fetch it —
 * and when the row is already present, so a refetch that lands first doesn't
 * produce a duplicate.
 *
 * The extra row shifts every subsequent page's offset by one, which is correct
 * once the indexer has the row: it entered the ordering at position 0, so
 * everything below it really did move down. Until then the next page can skip a
 * row; the 10s invalidation that follows every caller refetches all pages and
 * settles it.
 */
export function prependToHistoryCache(
  old: HistoryCache | undefined,
  tx: PendingTransaction
): HistoryCache | undefined {
  if (!old || old.pages.length === 0) return old;
  if (old.pages.some((page) => page.data.some((t) => t.hash === tx.hash))) return old;
  const [first, ...rest] = old.pages;
  return {
    ...old,
    pages: [
      {
        ...first,
        total: first.total + 1,
        data: [tx, ...first.data].slice(0, MAX_CACHE_TRANSACTIONS),
      },
      ...rest,
    ],
  };
}
