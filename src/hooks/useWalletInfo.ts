import { useQuery } from '@tanstack/react-query';
import { useWalletStore } from '../store/walletStore';
import { multisigService } from '../services/MultisigService';
import { usePageVisibility } from './usePageVisibility';
import { detectClockSkew } from '../utils/clockSkew';
import { getActiveProvider } from '../config/provider';

// Polling intervals (in milliseconds)
const POLLING_INTERVALS = {
  WALLET_INFO: 15000,   // 15 seconds - balance and owner info
  USER_WALLETS: 30000,  // 30 seconds - wallet list
} as const;

/**
 * Hook for fetching wallet info, user wallets, and guardian wallets.
 * Extracted from useMultisig to allow independent usage without
 * pulling in the full multisig hook (transactions, mutations, etc.).
 *
 * NOTE: This hook does NOT include the change-detection effects
 * (balance/owner/threshold notifications). Those remain in useMultisig.
 */
export function useWalletInfo(walletAddress?: string) {
  const { address: connectedAddress } = useWalletStore();
  const isPageVisible = usePageVisibility();

  // Get wallet info (owners, threshold, balance, etc.)
  const {
    data: walletInfo,
    isLoading: isLoadingInfo,
    refetch: refetchWalletInfo,
    isRefetching: isRefetchingWalletInfo,
  } = useQuery({
    queryKey: ['walletInfo', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      const info = await multisigService.getWalletInfo(walletAddress);
      // Fire-and-forget clock skew detection — must not block the query
      getActiveProvider().getBlock('latest').then(block => {
        if (block?.timestamp) {
          detectClockSkew(Number(block.timestamp));
        }
      }).catch(() => {});
      return info;
    },
    enabled: !!walletAddress && isPageVisible,
    staleTime: POLLING_INTERVALS.WALLET_INFO,
    refetchInterval: isPageVisible ? POLLING_INTERVALS.WALLET_INFO : false,
  });

  // Get wallets for connected address (as owner)
  const {
    data: userWallets,
    isLoading: isLoadingWallets,
    refetch: refetchUserWallets,
    isRefetching: isRefetchingWallets,
  } = useQuery({
    queryKey: ['userWallets', connectedAddress],
    queryFn: async () => {
      if (!connectedAddress) return [];
      return await multisigService.getWalletsForOwner(connectedAddress);
    },
    enabled: !!connectedAddress && isPageVisible,
    refetchInterval: isPageVisible ? POLLING_INTERVALS.USER_WALLETS : false,
  });

  // Get wallets for connected address (as guardian)
  const {
    data: guardianWallets,
    isLoading: isLoadingGuardianWallets,
    refetch: refetchGuardianWallets,
    isRefetching: isRefetchingGuardianWallets,
  } = useQuery({
    queryKey: ['guardianWallets', connectedAddress],
    queryFn: async () => {
      if (!connectedAddress) return [];
      return await multisigService.getWalletsForGuardian(connectedAddress);
    },
    enabled: !!connectedAddress && isPageVisible,
    refetchInterval: isPageVisible ? POLLING_INTERVALS.USER_WALLETS : false,
  });

  return {
    walletInfo,
    isLoadingInfo,
    refetchWalletInfo,
    isRefetchingWalletInfo,
    userWallets,
    isLoadingWallets,
    refetchUserWallets,
    isRefetchingWallets,
    guardianWallets,
    isLoadingGuardianWallets,
    refetchGuardianWallets,
    isRefetchingGuardianWallets,
  };
}
