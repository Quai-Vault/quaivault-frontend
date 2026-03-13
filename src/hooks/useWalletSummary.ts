import { useWalletInfo } from './useWalletInfo';
import { usePendingTransactions } from './usePendingTransactions';

/**
 * Lightweight hook for dashboard wallet cards.
 * Combines useWalletInfo + usePendingTransactions without
 * subscriptions, notifications, or mutations.
 * Use useMultisig for the full-featured wallet detail page.
 */
export function useWalletSummary(walletAddress?: string) {
  const {
    walletInfo,
    isLoadingInfo,
    isRefetchingWalletInfo,
  } = useWalletInfo(walletAddress);

  const {
    pendingTransactions,
  } = usePendingTransactions(walletAddress);

  return {
    walletInfo,
    pendingTransactions,
    isLoadingInfo,
    isRefetchingWalletInfo,
  };
}
