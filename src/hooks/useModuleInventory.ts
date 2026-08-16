import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CONTRACT_ADDRESSES } from '../config/contracts';
import { DAO_SHIPS_CONFIG } from '../config/daoShips';
import { hasWalletProvider } from '../config/provider';
import { INDEXER_CONFIG } from '../config/supabase';
import { daoShipsService, toDaoShipDisplay, type DaoShipVerification } from '../services/DaoShipsService';
import { multisigService } from '../services/MultisigService';
import { indexerService } from '../services/indexer';
import type { WalletModuleInventory, WalletModuleInventoryItem } from '../types/database';
import type { DaoShipDisplay, DaoShipSummary, Untrusted } from '../types/daoShips';
import { usePageVisibility } from './usePageVisibility';

export type ModuleAuthority = 'live' | 'indexed' | 'unavailable';

export interface ResolvedVaultModule {
  address: string;
  isActive: boolean;
  authority: ModuleAuthority;
  liveStatus: boolean | null;
  indexed: WalletModuleInventoryItem | null;
  hasStatusMismatch: boolean;
  name: string;
  description: string;
  kind: 'social-recovery' | 'dao-ships' | 'dao-ships-unverified' | 'unknown';
  daoCandidate: Untrusted<DaoShipSummary> | null;
  dao: Untrusted<DaoShipSummary> | null;
  daoDisplay: DaoShipDisplay | null;
  daoVerification: DaoShipVerification | null;
}

interface ResolveModuleOptions {
  inventory?: WalletModuleInventory;
  liveModules?: string[];
  daoDetails?: Untrusted<DaoShipSummary>[];
  verifications?: Map<string, DaoShipVerification>;
}

const normalize = (address: string) => address.toLowerCase();

/** Pure resolution logic, exported so authority and mismatch behavior stay pinned by tests. */
export function resolveVaultModules({
  inventory,
  liveModules,
  daoDetails = [],
  verifications = new Map(),
}: ResolveModuleOptions): ResolvedVaultModule[] {
  const liveSet = liveModules ? new Set(liveModules.map(normalize)) : null;
  const indexedByAddress = new Map(
    (inventory?.modules ?? []).map((item) => [normalize(item.moduleAddress), item])
  );
  const daoByAddress = new Map(daoDetails.map((dao) => [normalize(dao.id), dao]));
  const addresses = new Set<string>([
    ...indexedByAddress.keys(),
    ...(liveSet ?? []),
  ]);

  return Array.from(addresses).map((address) => {
    const indexed = indexedByAddress.get(address) ?? null;
    const liveStatus = liveSet ? liveSet.has(address) : null;
    const authority: ModuleAuthority = liveSet ? 'live' : indexed ? 'indexed' : 'unavailable';
    const isActive = liveStatus ?? indexed?.isActive ?? false;
    const hasStatusMismatch = liveStatus !== null && indexed !== null
      && liveStatus !== indexed.isActive;
    const possibleDao = daoByAddress.get(address) ?? null;
    const verification = verifications.get(address) ?? null;
    const avatarMismatch = verification?.avatarMatches === false;
    const daoCandidate = avatarMismatch ? null : possibleDao;
    const dao = daoCandidate && verification?.avatarMatches ? daoCandidate : null;
    const isSocialRecovery = Boolean(CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE)
      && address === normalize(CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE);
    const kind: ResolvedVaultModule['kind'] = dao
      ? 'dao-ships'
      : daoCandidate ? 'dao-ships-unverified'
      : isSocialRecovery ? 'social-recovery' : 'unknown';

    return {
      address,
      isActive,
      authority,
      liveStatus,
      indexed,
      hasStatusMismatch,
      name: dao ? (toDaoShipDisplay(dao).name || 'DAO Ships')
        : daoCandidate ? 'Possible DAO Ships'
        : isSocialRecovery ? 'Social Recovery' : 'Unknown Module',
      description: dao ? 'DAO governance for this vault treasury'
        : daoCandidate ? 'DAO indexer match; connect a wallet to verify on-chain'
        : isSocialRecovery ? 'Recover wallet access using guardian consensus'
          : 'Unrecognized vault module',
      kind,
      daoCandidate,
      dao,
      daoDisplay: dao ? toDaoShipDisplay(dao) : null,
      daoVerification: dao ? verification : null,
    };
  }).sort((a, b) => Number(b.isActive) - Number(a.isActive)
    || (b.indexed?.lastEventBlock ?? 0) - (a.indexed?.lastEventBlock ?? 0)
    || a.address.localeCompare(b.address));
}

export function useModuleInventory(walletAddress?: string) {
  const isPageVisible = usePageVisibility();
  const canReadChain = hasWalletProvider();

  const inventoryQuery = useQuery({
    queryKey: ['moduleInventory', walletAddress],
    queryFn: () => indexerService.module.getWalletModuleInventory(walletAddress!),
    enabled: !!walletAddress && INDEXER_CONFIG.ENABLED,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 30_000 : false,
    retry: 1,
  });

  const liveQuery = useQuery({
    queryKey: ['liveModules', walletAddress],
    queryFn: () => multisigService.wallet.getModules(walletAddress!),
    enabled: !!walletAddress && canReadChain,
    staleTime: 15_000,
    refetchInterval: isPageVisible ? 15_000 : false,
    retry: 1,
  });

  const candidateAddresses = useMemo(() => {
    const addresses = new Set<string>();
    for (const address of liveQuery.data ?? []) addresses.add(normalize(address));
    for (const module of inventoryQuery.data?.modules ?? []) addresses.add(normalize(module.moduleAddress));
    return Array.from(addresses).slice(0, 100);
  }, [inventoryQuery.data, liveQuery.data]);

  const daoQuery = useQuery({
    queryKey: ['daoShipsModuleDetails', walletAddress, candidateAddresses],
    queryFn: () => daoShipsService.getDaoDetailsForModules(walletAddress!, candidateAddresses),
    enabled: !!walletAddress && DAO_SHIPS_CONFIG.ENABLED && candidateAddresses.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const verificationQuery = useQuery({
    queryKey: ['daoShipsModuleVerification', walletAddress, daoQuery.data?.details.map((dao) => dao.id)],
    queryFn: async () => {
      const entries = await Promise.all((daoQuery.data?.details ?? []).map(async (dao) => {
        try {
          const verification = await daoShipsService.verifyDaoShip(walletAddress!, dao.id);
          return [normalize(dao.id), verification] as const;
        } catch (error) {
          console.warn(`[DAO Ships] Verification failed for ${dao.id}:`, error);
          return null;
        }
      }));
      return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
    },
    enabled: !!walletAddress && canReadChain && (daoQuery.data?.details.length ?? 0) > 0,
    staleTime: 30_000,
    retry: false,
  });

  const modules = useMemo(() => resolveVaultModules({
    inventory: inventoryQuery.data,
    liveModules: liveQuery.data,
    daoDetails: daoQuery.data?.details,
    verifications: verificationQuery.data,
  }), [daoQuery.data, inventoryQuery.data, liveQuery.data, verificationQuery.data]);

  const activeModules = modules.filter((module) => module.isActive);
  const allHistoricalModules = modules.filter((module) => !module.isActive && module.indexed);
  const historicalModules = allHistoricalModules.slice(0, 100);

  return {
    modules,
    activeModules,
    historicalModules,
    historicalModuleCount: allHistoricalModules.length,
    historyTruncated: allHistoricalModules.length > historicalModules.length,
    inventory: inventoryQuery.data,
    daoIndexer: daoQuery.data,
    isLoading: (INDEXER_CONFIG.ENABLED && inventoryQuery.isPending)
      || (canReadChain && liveQuery.isPending),
    isRefreshing: inventoryQuery.isFetching || liveQuery.isFetching,
    liveReadAvailable: liveQuery.isSuccess,
    liveReadError: liveQuery.error,
    inventoryError: inventoryQuery.error,
    daoError: daoQuery.error,
    refetch: async () => {
      await Promise.allSettled([inventoryQuery.refetch(), liveQuery.refetch(), daoQuery.refetch()]);
    },
  };
}
