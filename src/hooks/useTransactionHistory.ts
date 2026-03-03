import { useQuery } from '@tanstack/react-query';
import { multisigService } from '../services/MultisigService';
import { usePageVisibility } from './usePageVisibility';

const POLLING_INTERVAL = 30000; // 30s for history (not time-sensitive)

/**
 * Hook for fetching transaction history (executed, cancelled, recovery).
 * Extracted from useMultisig for modularity.
 *
 * Does NOT include notification tracking for newly executed/cancelled txs —
 * those remain in the main useMultisig hook.
 */
export function useTransactionHistory(walletAddress?: string) {
  const isPageVisible = usePageVisibility();

  const {
    data: executedTransactions,
    isLoading: isLoadingHistory,
    refetch: refetchHistory,
    isRefetching: isRefetchingHistory,
  } = useQuery({
    queryKey: ['executedTransactions', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      return multisigService.getExecutedTransactions(walletAddress);
    },
    enabled: !!walletAddress && isPageVisible,
    staleTime: POLLING_INTERVAL,
    refetchInterval: isPageVisible ? POLLING_INTERVAL : false,
  });

  const {
    data: cancelledTransactions,
    isLoading: isLoadingCancelled,
    refetch: refetchCancelled,
    isRefetching: isRefetchingCancelled,
  } = useQuery({
    queryKey: ['cancelledTransactions', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      return multisigService.getCancelledTransactions(walletAddress);
    },
    enabled: !!walletAddress && isPageVisible,
    staleTime: POLLING_INTERVAL,
    refetchInterval: isPageVisible ? POLLING_INTERVAL : false,
  });

  const {
    data: recoveryHistory,
    isLoading: isLoadingRecoveryHistory,
    refetch: refetchRecoveryHistory,
    isRefetching: isRefetchingRecoveryHistory,
  } = useQuery({
    queryKey: ['recoveryHistory', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      return multisigService.getRecoveryHistory(walletAddress);
    },
    enabled: !!walletAddress && isPageVisible,
    staleTime: POLLING_INTERVAL,
    refetchInterval: isPageVisible ? POLLING_INTERVAL : false,
  });

  return {
    executedTransactions,
    cancelledTransactions,
    recoveryHistory,
    isLoadingHistory,
    isLoadingCancelled,
    isLoadingRecoveryHistory,
    refetchHistory,
    refetchCancelled,
    refetchRecoveryHistory,
    isRefetchingHistory,
    isRefetchingCancelled,
    isRefetchingRecoveryHistory,
  };
}
