import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { indexerService } from '../services/indexer';
import { getERC20Balances, type OnChainTokenBalance } from '../services/utils/TokenBalanceService';
import { useIndexerConnection } from './useIndexerConnection';
import { usePageVisibility } from './usePageVisibility';
import type { Token, TokenTransfer } from '../types/database';
import type { PaginatedResult } from '../services/indexer';

// Single polling interval used for all token queries.
// Only active when the page is visible AND the indexer subscription is offline —
// real-time subscriptions handle updates when the indexer is connected.
const TOKEN_POLLING_INTERVAL_MS = 30_000;

export function useTokenBalances(walletAddress?: string) {
  const queryClient = useQueryClient();
  const { isConnected: isIndexerConnected, isEnabled: isIndexerEnabled } = useIndexerConnection();
  const isPageVisible = usePageVisibility();

  // Poll only when the page is visible and subscriptions are not active.
  // When the indexer is connected, real-time invalidation handles updates.
  const pollingInterval = !isPageVisible || isIndexerConnected ? false : TOKEN_POLLING_INTERVAL_MS;

  // Step 1: Get tokens this wallet has interacted with (from indexer)
  const {
    data: tokens,
    isLoading: isLoadingTokens,
    isRefetching: isRefetchingTokens,
    error: tokensError,
    refetch: refetchTokens,
  } = useQuery<Token[]>({
    queryKey: ['walletTokens', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      return indexerService.token.getTokensForWallet(walletAddress);
    },
    enabled: !!walletAddress && isIndexerConnected,
    staleTime: TOKEN_POLLING_INTERVAL_MS,
    refetchInterval: pollingInterval,
  });

  // Step 2: Fetch on-chain balances for discovered ERC20 tokens
  const {
    data: erc20Balances,
    isLoading: isLoadingBalances,
    isRefetching: isRefetchingBalances,
    error: balancesError,
    refetch: refetchBalances,
  } = useQuery<OnChainTokenBalance[]>({
    queryKey: ['erc20Balances', walletAddress, tokens?.map(t => t.address).join(',')],
    queryFn: async () => {
      if (!walletAddress || !tokens || tokens.length === 0) return [];
      return getERC20Balances(walletAddress, tokens);
    },
    enabled: !!walletAddress && !!tokens && tokens.length > 0,
    staleTime: TOKEN_POLLING_INTERVAL_MS,
    refetchInterval: pollingInterval,
  });

  // Step 3: Get recent token transfers for history display
  const {
    data: tokenTransfersResult,
    isLoading: isLoadingTransfers,
    refetch: refetchTransfers,
  } = useQuery<PaginatedResult<TokenTransfer>>({
    queryKey: ['tokenTransfers', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return { data: [], total: 0, hasMore: false };
      return indexerService.token.getTokenTransfers(walletAddress, { limit: 50 });
    },
    enabled: !!walletAddress && isIndexerConnected,
    staleTime: TOKEN_POLLING_INTERVAL_MS,
    refetchInterval: pollingInterval,
  });

  // Step 4: Real-time subscription for new token transfers
  useEffect(() => {
    if (!walletAddress || !isIndexerConnected) return;

    const unsubscribe = indexerService.subscription.subscribeToTokenTransfers(walletAddress, {
      onInsert: (_transfer: TokenTransfer) => {
        queryClient.invalidateQueries({ queryKey: ['walletTokens', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['erc20Balances', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['tokenTransfers', walletAddress] });
      },
      onReconnect: () => {
        queryClient.invalidateQueries({ queryKey: ['walletTokens', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['erc20Balances', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['tokenTransfers', walletAddress] });
      },
    });

    return unsubscribe;
  }, [walletAddress, isIndexerConnected, queryClient]);

  const error = tokensError || balancesError;

  const isRefetching = isRefetchingTokens || isRefetchingBalances;

  const refetchAll = () => {
    refetchTokens();
    refetchBalances();
    refetchTransfers();
  };

  return {
    tokens: tokens ?? [],
    erc20Balances: erc20Balances ?? [],
    tokenTransfers: tokenTransfersResult?.data ?? [],
    tokenTransfersTotal: tokenTransfersResult?.total ?? 0,
    isLoadingTokens,
    isLoadingBalances,
    isLoadingTransfers,
    isRefetching,
    isIndexerEnabled,
    isIndexerConnected,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refetchAll,
    refetchBalances,
    refetchTransfers,
  };
}
