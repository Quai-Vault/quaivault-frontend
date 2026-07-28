import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { multisigService } from '../services/MultisigService';
import { usePageVisibility } from './usePageVisibility';
import type { PendingTransaction } from '../types';
import type { SocialRecovery } from '../types/database';
import { HISTORY_PAGE_SIZE, nextHistoryOffset } from '../utils/historyCache';

const POLLING_INTERVAL = 30000; // 30s for history (not time-sensitive)

/**
 * Poll only while a single page is loaded.
 *
 * Refetching an infinite query re-requests every loaded page, and each carries an
 * exact count. Polling a deep list would multiply that by the page count every
 * interval; mutations and the realtime subscriptions already invalidate history.
 */
function pollWhileShallow(pageCount: number | undefined, isPageVisible: boolean) {
  return isPageVisible && pageCount === 1 ? POLLING_INTERVAL : (false as const);
}

/**
 * Hook for fetching paginated transaction history (executed, cancelled, recovery).
 *
 * Pages are fetched, filtered and counted server-side — `total` is the true row
 * count for the status, not the number of rows currently loaded.
 */
export function useTransactionHistory(walletAddress?: string) {
  const isPageVisible = usePageVisibility();

  const executed = useInfiniteQuery({
    queryKey: ['executedTransactions', walletAddress],
    queryFn: ({ pageParam }) =>
      multisigService.getExecutedTransactions(walletAddress!, {
        limit: HISTORY_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: nextHistoryOffset,
    enabled: !!walletAddress && isPageVisible,
    staleTime: POLLING_INTERVAL,
    refetchInterval: (query) => pollWhileShallow(query.state.data?.pages.length, isPageVisible),
  });

  const cancelled = useInfiniteQuery({
    queryKey: ['cancelledTransactions', walletAddress],
    queryFn: ({ pageParam }) =>
      multisigService.getCancelledTransactions(walletAddress!, {
        limit: HISTORY_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: nextHistoryOffset,
    enabled: !!walletAddress && isPageVisible,
    staleTime: POLLING_INTERVAL,
    refetchInterval: (query) => pollWhileShallow(query.state.data?.pages.length, isPageVisible),
  });

  const recovery = useInfiniteQuery({
    queryKey: ['recoveryHistory', walletAddress],
    queryFn: ({ pageParam }) =>
      multisigService.getRecoveryHistory(walletAddress!, {
        limit: HISTORY_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: nextHistoryOffset,
    enabled: !!walletAddress && isPageVisible,
    staleTime: POLLING_INTERVAL,
    refetchInterval: (query) => pollWhileShallow(query.state.data?.pages.length, isPageVisible),
  });

  const executedTransactions = useMemo<PendingTransaction[] | undefined>(
    () => executed.data?.pages.flatMap((page) => page.data),
    [executed.data]
  );
  const cancelledTransactions = useMemo<PendingTransaction[] | undefined>(
    () => cancelled.data?.pages.flatMap((page) => page.data),
    [cancelled.data]
  );
  const recoveryHistory = useMemo<SocialRecovery[] | undefined>(
    () => recovery.data?.pages.flatMap((page) => page.data),
    [recovery.data]
  );

  return {
    executedTransactions,
    cancelledTransactions,
    recoveryHistory,

    // True server-side totals, independent of how many pages are loaded.
    executedTotal: executed.data?.pages[0]?.total ?? 0,
    cancelledTotal: cancelled.data?.pages[0]?.total ?? 0,
    recoveryTotal: recovery.data?.pages[0]?.total ?? 0,

    isLoadingHistory: executed.isLoading,
    isLoadingCancelled: cancelled.isLoading,
    isLoadingRecoveryHistory: recovery.isLoading,

    refetchHistory: executed.refetch,
    refetchCancelled: cancelled.refetch,
    refetchRecoveryHistory: recovery.refetch,

    isRefetchingHistory: executed.isRefetching,
    isRefetchingCancelled: cancelled.isRefetching,
    isRefetchingRecoveryHistory: recovery.isRefetching,

    fetchMoreHistory: executed.fetchNextPage,
    fetchMoreCancelled: cancelled.fetchNextPage,
    fetchMoreRecoveryHistory: recovery.fetchNextPage,

    hasMoreHistory: executed.hasNextPage,
    hasMoreCancelled: cancelled.hasNextPage,
    hasMoreRecoveryHistory: recovery.hasNextPage,

    isFetchingMoreHistory: executed.isFetchingNextPage,
    isFetchingMoreCancelled: cancelled.isFetchingNextPage,
    isFetchingMoreRecoveryHistory: recovery.isFetchingNextPage,
  };
}
