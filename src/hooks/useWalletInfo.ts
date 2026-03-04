import { useQuery } from '@tanstack/react-query';
import { Shard } from 'quais';
import { useWalletStore } from '../store/walletStore';
import { multisigService } from '../services/MultisigService';
import { usePageVisibility } from './usePageVisibility';
import { detectClockSkew } from '../utils/clockSkew';
import { getActiveProvider, hasWalletProvider } from '../config/provider';

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
    error: walletInfoError,
    refetch: refetchWalletInfo,
    isRefetching: isRefetchingWalletInfo,
  } = useQuery({
    // Include connectedAddress so the query re-runs once the wallet's signer
    // bridge completes — this switches the provider from the (possibly dead)
    // public RPC to the wallet extension's own RPC.
    queryKey: ['walletInfo', walletAddress, connectedAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      // Timeout to prevent hanging queries from blocking the UI forever
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Wallet info fetch timed out after 15s')), 15000)
      );
      const info = await Promise.race([
        multisigService.getWalletInfo(walletAddress),
        timeout,
      ]);
      // Fire-and-forget clock skew detection — must not block the query
      if (hasWalletProvider()) {
        getActiveProvider().getBlock(Shard.Cyprus1, 'latest').then(block => {
          if (block?.timestamp) {
            detectClockSkew(Number(block.timestamp));
          }
        }).catch(() => {});
      }
      return info;
    },
    enabled: !!walletAddress && isPageVisible,
    staleTime: POLLING_INTERVALS.WALLET_INFO,
    retry: 1, // Fail fast — the wallet provider retry (via key change) handles recovery
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
    walletInfoError,
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
