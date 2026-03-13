import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { indexerService } from '../services/indexer';
import { getNftOwner } from '../services/utils/ContractMetadataService';
import { getNftMetadataBatch, type NftHolding, type NftMetadata } from '../services/utils/NftMetadataService';
import { useIndexerConnection } from './useIndexerConnection';
import { usePageVisibility } from './usePageVisibility';
import type { Token } from '../types/database';

const TOKEN_POLLING_INTERVAL_MS = 30_000;
const METADATA_STALE_TIME_MS = 5 * 60_000; // 5 minutes — NFT metadata is immutable
const MAX_DISPLAY_NFTS = 50;
const OWNERSHIP_CHECK_CONCURRENCY = 10;

export interface NftHoldingWithMetadata extends NftHolding {
  metadata: NftMetadata | null;
}

export function useNftHoldings(walletAddress?: string) {
  const queryClient = useQueryClient();
  const { isConnected: isIndexerConnected, isEnabled: isIndexerEnabled } = useIndexerConnection();
  const isPageVisible = usePageVisibility();

  const pollingInterval = !isPageVisible || isIndexerConnected ? false : TOKEN_POLLING_INTERVAL_MS;

  // Step 1: Get ERC721 tokens from the shared walletTokens query
  // (useTokenBalances fetches all tokens; we filter to ERC721 here)
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

  const erc721Tokens = tokens?.filter(t => t.standard === 'ERC721') ?? [];
  const erc721Addresses = erc721Tokens.map(t => t.address);

  // Step 2: Derive current NFT holdings from transfer history + on-chain verification
  const {
    data: holdings,
    isLoading: isLoadingHoldings,
    isRefetching: isRefetchingHoldings,
    error: holdingsError,
    refetch: refetchHoldings,
  } = useQuery<NftHolding[]>({
    queryKey: ['nftHoldings', walletAddress, erc721Addresses.join(',')],
    queryFn: async () => {
      if (!walletAddress || erc721Addresses.length === 0) return [];

      // Fetch all ERC721 transfers for this wallet
      const transfers = await indexerService.token.getErc721TransfersForWallet(
        walletAddress,
        erc721Addresses
      );

      // Deduplicate: keep only the latest transfer per (token_address, token_id).
      // Transfers are ordered by block_number DESC, so first occurrence = latest.
      const seen = new Set<string>();
      const latestInflows: Array<{ tokenAddress: string; tokenId: string }> = [];
      for (const t of transfers) {
        if (!t.token_id) continue;
        const key = `${t.token_address.toLowerCase()}:${t.token_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Only keep inflows (wallet received the NFT)
        if (t.direction === 'inflow') {
          latestInflows.push({ tokenAddress: t.token_address, tokenId: t.token_id });
        }
      }

      // Verify on-chain ownership with concurrency limit
      const candidates = latestInflows.slice(0, MAX_DISPLAY_NFTS);
      const results: (NftHolding | null)[] = [];
      for (let i = 0; i < candidates.length; i += OWNERSHIP_CHECK_CONCURRENCY) {
        const batch = candidates.slice(i, i + OWNERSHIP_CHECK_CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ tokenAddress, tokenId }) => {
            const owner = await getNftOwner(tokenAddress, tokenId);
            if (!owner || owner.toLowerCase() !== walletAddress.toLowerCase()) {
              return null;
            }
            const tokenMeta = erc721Tokens.find(
              t => t.address.toLowerCase() === tokenAddress.toLowerCase()
            );
            return {
              tokenAddress,
              tokenId,
              collectionName: tokenMeta?.name ?? null,
              collectionSymbol: tokenMeta?.symbol ?? null,
            } as NftHolding;
          })
        );
        for (const r of batchResults) {
          results.push(r.status === 'fulfilled' ? r.value : null);
        }
      }

      return results.filter((h): h is NftHolding => h !== null);
    },
    enabled: !!walletAddress && erc721Addresses.length > 0 && isIndexerConnected,
    staleTime: TOKEN_POLLING_INTERVAL_MS,
    refetchInterval: pollingInterval,
  });

  // Step 3: Fetch metadata for verified holdings
  const holdingKeys = holdings?.map(h => `${h.tokenAddress}:${h.tokenId}`).join(',') ?? '';
  const {
    data: metadataMap,
    isLoading: isLoadingMetadata,
  } = useQuery<Map<string, NftMetadata>>({
    queryKey: ['nftMetadata', walletAddress, holdingKeys],
    queryFn: async () => {
      if (!holdings || holdings.length === 0) return new Map();
      return getNftMetadataBatch(holdings);
    },
    enabled: !!holdings && holdings.length > 0,
    staleTime: METADATA_STALE_TIME_MS,
  });

  // Merge holdings with metadata (memoized to prevent new array reference each render)
  const holdingsWithMetadata: NftHoldingWithMetadata[] = useMemo(
    () => (holdings ?? []).map(h => ({
      ...h,
      metadata: metadataMap?.get(`${h.tokenAddress}:${h.tokenId}`) ?? null,
    })),
    [holdings, metadataMap],
  );

  const error = holdingsError;

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['walletTokens', walletAddress] });
    refetchHoldings();
  };

  return {
    holdings: holdingsWithMetadata,
    totalNfts: holdings?.length ?? 0,
    maxDisplayed: MAX_DISPLAY_NFTS,
    isLoading: isLoadingTokens || isLoadingHoldings,
    isLoadingMetadata,
    isRefetching: isRefetchingHoldings,
    isIndexerEnabled,
    isIndexerConnected,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refetchAll,
  };
}
