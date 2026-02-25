import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { formatUnits } from 'quais';
import { indexerService } from '../services/indexer';
import { getERC20Balances, type OnChainTokenBalance } from '../services/utils/TokenBalanceService';
import { useIndexerConnection } from './useIndexerConnection';
import type { Token, TokenTransfer } from '../types/database';
import type { PaginatedResult } from '../services/indexer';
import { notificationManager } from '../components/NotificationContainer';
import { canShowBrowserNotifications, sendBrowserNotification } from '../utils/notifications';

const POLLING_INTERVALS = {
  TOKEN_LIST: 30000,
  TOKEN_BALANCES: 30000,
  TOKEN_TRANSFERS: 30000,
} as const;

export function useTokenBalances(walletAddress?: string) {
  const queryClient = useQueryClient();
  const { isConnected: isIndexerConnected, isEnabled: isIndexerEnabled } = useIndexerConnection();

  // Step 1: Get tokens this wallet has interacted with (from indexer)
  const {
    data: tokens,
    isLoading: isLoadingTokens,
    error: tokensError,
  } = useQuery<Token[]>({
    queryKey: ['walletTokens', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      return indexerService.token.getTokensForWallet(walletAddress);
    },
    enabled: !!walletAddress && isIndexerConnected,
    staleTime: POLLING_INTERVALS.TOKEN_LIST,
    refetchInterval: POLLING_INTERVALS.TOKEN_LIST,
  });

  // Keep a ref to the latest tokens so the subscription callback always has fresh metadata
  const tokensRef = useRef<Token[]>([]);
  useEffect(() => {
    tokensRef.current = tokens ?? [];
  }, [tokens]);

  // Step 2: Fetch on-chain balances for discovered ERC20 tokens
  const {
    data: erc20Balances,
    isLoading: isLoadingBalances,
    error: balancesError,
    refetch: refetchBalances,
  } = useQuery<OnChainTokenBalance[]>({
    queryKey: ['erc20Balances', walletAddress, tokens?.map(t => t.address).join(',')],
    queryFn: async () => {
      if (!walletAddress || !tokens || tokens.length === 0) return [];
      return getERC20Balances(walletAddress, tokens);
    },
    enabled: !!walletAddress && !!tokens && tokens.length > 0,
    staleTime: POLLING_INTERVALS.TOKEN_BALANCES,
    refetchInterval: POLLING_INTERVALS.TOKEN_BALANCES,
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
    staleTime: POLLING_INTERVALS.TOKEN_TRANSFERS,
    refetchInterval: POLLING_INTERVALS.TOKEN_TRANSFERS,
  });

  // Step 4: Real-time subscription for new token transfers
  useEffect(() => {
    if (!walletAddress || !isIndexerConnected) return;

    const unsubscribe = indexerService.subscription.subscribeToTokenTransfers(walletAddress, {
      onInsert: (transfer: TokenTransfer) => {
        queryClient.invalidateQueries({ queryKey: ['walletTokens', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['erc20Balances', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['tokenTransfers', walletAddress] });

        if (transfer.direction === 'inflow') {
          const token = tokensRef.current.find(
            t => t.address.toLowerCase() === transfer.token_address.toLowerCase()
          );
          const symbol = token?.symbol ?? `${transfer.token_address.slice(0, 6)}...`;
          const isNFT = transfer.token_id !== null;

          let amountDisplay: string;
          if (isNFT) {
            amountDisplay = `NFT #${transfer.token_id} (${symbol})`;
          } else {
            const decimals = token?.decimals ?? 18;
            const formatted = parseFloat(formatUnits(BigInt(transfer.value), decimals)).toFixed(4);
            amountDisplay = `${formatted} ${symbol}`;
          }

          const senderShort = `${transfer.from_address.slice(0, 6)}...${transfer.from_address.slice(-4)}`;
          notificationManager.add({
            message: `💎 Vault received ${amountDisplay} from ${senderShort}`,
            type: 'success',
          });

          if (canShowBrowserNotifications()) {
            sendBrowserNotification('Vault Received Tokens', {
              body: `Received ${amountDisplay} from ${senderShort}`,
              tag: `${walletAddress}-token-${transfer.transaction_hash}-${transfer.log_index}`,
            });
          }
        }
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

  return {
    tokens: tokens ?? [],
    erc20Balances: erc20Balances ?? [],
    tokenTransfers: tokenTransfersResult?.data ?? [],
    tokenTransfersTotal: tokenTransfersResult?.total ?? 0,
    isLoadingTokens,
    isLoadingBalances,
    isLoadingTransfers,
    isIndexerEnabled,
    isIndexerConnected,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refetchBalances,
    refetchTransfers,
  };
}
