import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { multisigService } from '../services/MultisigService';
import { usePageVisibility } from './usePageVisibility';
import { useIndexerConnection } from './useIndexerConnection';
import { useWalletStore } from '../store/walletStore';

const POLLING_INTERVALS = {
  PENDING_TXS: 8000,
  PENDING_TXS_FALLBACK: 30000,
};

/**
 * Hook for fetching pending transactions.
 * Extracted from useMultisig for modularity.
 *
 * Does NOT include subscription setup or notification tracking —
 * those remain in the main useMultisig hook.
 *
 * Query cancellation: TanStack Query handles observer cleanup on unmount.
 * The underlying quais/Supabase clients don't support AbortSignal,
 * so orphan responses are discarded via gcTime.
 */
export function usePendingTransactions(walletAddress?: string) {
  const isPageVisible = usePageVisibility();
  const { isConnected: isIndexerConnected } = useIndexerConnection();
  const { setPendingTransactions } = useWalletStore();

  const {
    data: pendingTransactions,
    isLoading: isLoadingTransactions,
    refetch: refetchTransactions,
    isRefetching: isRefetchingPending,
  } = useQuery({
    queryKey: ['pendingTransactions', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      return multisigService.getPendingTransactions(walletAddress);
    },
    enabled: !!walletAddress && isPageVisible,
    staleTime: POLLING_INTERVALS.PENDING_TXS_FALLBACK,
    refetchInterval: isPageVisible
      ? (isIndexerConnected
          ? POLLING_INTERVALS.PENDING_TXS_FALLBACK
          : POLLING_INTERVALS.PENDING_TXS)
      : false,
  });

  // Sync query data to Zustand store as a side effect (M11: don't write to store inside queryFn)
  useEffect(() => {
    if (walletAddress && pendingTransactions) {
      setPendingTransactions(walletAddress, pendingTransactions);
    }
  }, [walletAddress, pendingTransactions, setPendingTransactions]);

  return {
    pendingTransactions,
    isLoadingTransactions,
    refetchTransactions,
    isRefetchingPending,
  };
}
