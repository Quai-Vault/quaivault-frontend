import { useQuery } from '@tanstack/react-query';
import { multisigService } from '../services/MultisigService';
import { CONTRACT_ADDRESSES } from '../config/contracts';
import { usePageVisibility } from './usePageVisibility';

// Match the polling interval used in useMultisig for module status
const MODULE_STATUS_POLL_INTERVAL = 15000; // 15 seconds

/**
 * Queries the on-chain enabled/disabled status of known modules for a vault.
 * Returns a Record<string, boolean | null> keyed by module contract address.
 * A `null` value means the query failed (unknown status) — callers should
 * treat this differently from `false` (definitively disabled).
 */
export function useModuleStatus(walletAddress?: string) {
  const isPageVisible = usePageVisibility();

  const {
    data: moduleStatuses,
    isLoading: isLoadingModules,
    refetch: refetchModules,
    isRefetching: isRefetchingModules,
  } = useQuery({
    queryKey: ['moduleStatus', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      const moduleAddresses = [
        CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE,
      ].filter(Boolean) as string[];

      const results = await Promise.all(
        moduleAddresses.map(async (moduleAddress) => {
          try {
            const isEnabled = await multisigService.isModuleEnabled(walletAddress, moduleAddress);
            return { moduleAddress, isEnabled };
          } catch (error) {
            console.warn(
              `Failed to check status for module ${moduleAddress}:`,
              error instanceof Error ? error.message : 'Unknown error'
            );
            return { moduleAddress, isEnabled: null as boolean | null };
          }
        })
      );

      const statuses: Record<string, boolean | null> = {};
      results.forEach(({ moduleAddress, isEnabled }) => {
        statuses[moduleAddress] = isEnabled;
      });
      return statuses;
    },
    enabled: !!walletAddress && isPageVisible,
    refetchInterval: isPageVisible ? MODULE_STATUS_POLL_INTERVAL : false,
  });

  return {
    moduleStatuses,
    isLoadingModules,
    refetchModules,
    isRefetchingModules,
  };
}
