import { useQuery } from '@tanstack/react-query';
import { indexerService } from '../services/indexer';
import { INDEXER_CONFIG } from '../config/supabase';

export interface IndexerConnectionState {
  isConnected: boolean;
  isSynced: boolean;
  blocksBehind: number | null;
  isLoading: boolean;
  isEnabled: boolean;
}

/**
 * Hook for monitoring indexer connection status
 *
 * @returns Connection state including availability, sync status, and loading state
 */
export function useIndexerConnection(): IndexerConnectionState {
  const { data: health, isLoading } = useQuery({
    queryKey: ['indexerHealth'],
    queryFn: () => indexerService.getHealthStatus(),
    refetchInterval: INDEXER_CONFIG.HEALTH_CACHE_MS, // Check based on config
    staleTime: INDEXER_CONFIG.HEALTH_CACHE_MS / 2,
    enabled: INDEXER_CONFIG.ENABLED,
    retry: 1,
  });

  return {
    isConnected: health?.available ?? false,
    isSynced: health?.synced ?? false,
    blocksBehind: health?.blocksBehind ?? null,
    isLoading,
    isEnabled: INDEXER_CONFIG.ENABLED,
  };
}
