import { useQuery, useQueryClient } from '@tanstack/react-query';
import { indexerService } from '../services/indexer';
import { getERC1155Balances } from '../services/utils/TokenBalanceService';
import { getErc1155MetadataBatch, type NftMetadata } from '../services/utils/NftMetadataService';
import { useIndexerConnection } from './useIndexerConnection';
import { usePageVisibility } from './usePageVisibility';
import type { Token } from '../types/database';

const TOKEN_POLLING_INTERVAL_MS = 30_000;
const METADATA_STALE_TIME_MS = 5 * 60_000;
const MAX_DISPLAY = 50;

export interface Erc1155Holding {
  tokenAddress: string;
  tokenId: string;
  quantity: string; // on-chain verified balance (bigint string)
  collectionName: string | null;
  collectionSymbol: string | null;
}

export interface Erc1155HoldingWithMetadata extends Erc1155Holding {
  metadata: NftMetadata | null;
}

export function useErc1155Holdings(walletAddress?: string) {
  const queryClient = useQueryClient();
  const { isConnected: isIndexerConnected, isEnabled: isIndexerEnabled } = useIndexerConnection();
  const isPageVisible = usePageVisibility();

  const pollingInterval = !isPageVisible || isIndexerConnected ? false : TOKEN_POLLING_INTERVAL_MS;

  // Step 1: Share the walletTokens query (React Query dedup)
  const {
    data: tokens,
    isLoading: isLoadingTokens,
  } = useQuery<Token[]>({
    queryKey: ['walletTokens', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      return indexerService.token.getTokensForWallet(walletAddress);
    },
    enabled: !!walletAddress && isIndexerEnabled,
    staleTime: TOKEN_POLLING_INTERVAL_MS,
    refetchInterval: pollingInterval,
  });

  const erc1155Tokens = tokens?.filter(t => t.standard === 'ERC1155') ?? [];
  const erc1155Addresses = erc1155Tokens.map(t => t.address);

  // Step 2: Aggregate transfers and verify on-chain
  const {
    data: holdings,
    isLoading: isLoadingHoldings,
    isRefetching: isRefetchingHoldings,
    error: holdingsError,
    refetch: refetchHoldings,
  } = useQuery<Erc1155Holding[]>({
    queryKey: ['erc1155Holdings', walletAddress, erc1155Addresses.join(',')],
    queryFn: async () => {
      if (!walletAddress || erc1155Addresses.length === 0) return [];

      const transfers = await indexerService.token.getErc1155TransfersForWallet(
        walletAddress,
        erc1155Addresses
      );

      // Aggregate by (tokenAddress, tokenId): sum inflow values, subtract outflow values
      const balanceMap = new Map<string, { tokenAddress: string; tokenId: string; net: bigint }>();
      for (const t of transfers) {
        if (!t.token_id) continue;
        const key = `${t.token_address.toLowerCase()}:${t.token_id}`;
        if (!balanceMap.has(key)) {
          balanceMap.set(key, { tokenAddress: t.token_address, tokenId: t.token_id, net: 0n });
        }
        const entry = balanceMap.get(key)!;
        const val = BigInt(t.value || '0');
        entry.net += t.direction === 'inflow' ? val : -val;
      }

      // Keep only positive-balance entries
      const candidates = Array.from(balanceMap.values())
        .filter(e => e.net > 0n)
        .slice(0, MAX_DISPLAY);

      if (candidates.length === 0) return [];

      // Verify on-chain (authoritative — replaces computed balances)
      const onChain = await getERC1155Balances(
        walletAddress,
        candidates.map(c => ({ tokenAddress: c.tokenAddress, tokenId: c.tokenId })),
        erc1155Tokens,
      );

      return onChain.map(b => {
        const tokenMeta = erc1155Tokens.find(
          t => t.address.toLowerCase() === b.tokenAddress.toLowerCase()
        );
        return {
          tokenAddress: b.tokenAddress,
          tokenId: b.tokenId,
          quantity: b.balance,
          collectionName: tokenMeta?.name ?? null,
          collectionSymbol: tokenMeta?.symbol ?? null,
        };
      });
    },
    enabled: !!walletAddress && erc1155Addresses.length > 0 && isIndexerConnected,
    staleTime: TOKEN_POLLING_INTERVAL_MS,
    refetchInterval: pollingInterval,
  });

  // Step 3: Fetch metadata
  const holdingKeys = holdings?.map(h => `${h.tokenAddress}:${h.tokenId}`).join(',') ?? '';
  const {
    data: metadataMap,
    isLoading: isLoadingMetadata,
  } = useQuery<Map<string, NftMetadata>>({
    queryKey: ['erc1155Metadata', walletAddress, holdingKeys],
    queryFn: async () => {
      if (!holdings || holdings.length === 0) return new Map();
      return getErc1155MetadataBatch(holdings);
    },
    enabled: !!holdings && holdings.length > 0,
    staleTime: METADATA_STALE_TIME_MS,
  });

  // Merge holdings with metadata
  const holdingsWithMetadata: Erc1155HoldingWithMetadata[] = (holdings ?? []).map(h => ({
    ...h,
    metadata: metadataMap?.get(`${h.tokenAddress}:${h.tokenId}`) ?? null,
  }));

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['walletTokens', walletAddress] });
    refetchHoldings();
  };

  return {
    holdings: holdingsWithMetadata,
    totalItems: holdings?.length ?? 0,
    isLoading: isLoadingTokens || isLoadingHoldings,
    isLoadingMetadata,
    isRefetching: isRefetchingHoldings,
    isIndexerEnabled,
    isIndexerConnected,
    error: holdingsError instanceof Error ? holdingsError.message : holdingsError ? String(holdingsError) : null,
    refetchAll,
  };
}
