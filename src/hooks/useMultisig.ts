import { useCallback, useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWalletStore } from '../store/walletStore';
import { multisigService } from '../services/MultisigService';
import { notificationManager } from '../components/NotificationContainer';
import { CONTRACT_ADDRESSES } from '../config/contracts';
import { INDEXER_CONFIG } from '../config/supabase';
import { indexerService } from '../services/indexer';
import { convertIndexerTransaction } from '../services/utils/TransactionConverter';
import { useIndexerConnection } from './useIndexerConnection';
import type { DeploymentConfig, TransactionData, PendingTransaction } from '../types';
import { formatQuai } from 'quais';
import { canShowBrowserNotifications, sendBrowserNotification } from '../utils/notifications';
import { getModuleName } from '../utils/transactionDecoder';

// Polling intervals (in milliseconds)
// Subscriptions provide real-time updates, but polling acts as a safety net
const POLLING_INTERVALS = {
  WALLET_INFO: 15000,        // 15 seconds - balance and owner info
  PENDING_TXS: 10000,        // 10 seconds - pending transactions (critical for UX)
  PENDING_TXS_FALLBACK: 30000, // 30 seconds - when subscriptions are active as backup
  TRANSACTION_HISTORY: 30000, // 30 seconds - executed/cancelled transactions
  USER_WALLETS: 30000,       // 30 seconds - wallet list
} as const;

// Maximum number of wallets to track in memory (LRU eviction after this limit)
// Prevents memory leaks in long-running sessions
const MAX_TRACKED_WALLETS = 50;

/**
 * Simple LRU Map that evicts oldest entries when max size is exceeded.
 * Uses Map's insertion order for LRU behavior (oldest entries are first).
 *
 * IMPORTANT: `get()` promotes the accessed entry (delete + re-insert) which
 * mutates the Map.  Do NOT call `get()` while iterating over the Map with
 * `for..of`, `forEach`, or spread — this corrupts the iterator.
 * Use `peek()` instead for read-only access during iteration.
 */
class LRUMap<K, V> extends Map<K, V> {
  private maxSize: number;
  
  constructor(maxSize: number) {
    super();
    this.maxSize = maxSize;
  }

  set(key: K, value: V): this {
    // If key exists, delete and re-add to update access order
    if (this.has(key)) {
      this.delete(key);
    }
    super.set(key, value);

    // Evict oldest entries if over limit
    while (this.size > this.maxSize) {
      const oldestKey = this.keys().next().value;
      if (oldestKey !== undefined) {
        this.delete(oldestKey);
      }
    }
    return this;
  }

  get(key: K): V | undefined {
    const value = super.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.delete(key);
      super.set(key, value);
    }
    return value;
  }

  /** Read a value without promoting it in the LRU order.
   *  Safe to call during iteration since it doesn't mutate the Map. */
  peek(key: K): V | undefined {
    return super.get(key);
  }
}

// Global tracking of last notified balances (shared across all hook instances)
// This prevents duplicate notifications when multiple components use the same wallet
// Uses LRU eviction to prevent memory leaks
const lastNotifiedBalances = new LRUMap<string, string>(MAX_TRACKED_WALLETS);

// Global tracking of notified transaction states per wallet (executed, cancelled, ready to execute)
// Using LRU Maps keyed by wallet address for proper cleanup
const notifiedExecutedTxs = new LRUMap<string, Set<string>>(MAX_TRACKED_WALLETS);
const notifiedCancelledTxs = new LRUMap<string, Set<string>>(MAX_TRACKED_WALLETS);
const notifiedReadyTxs = new LRUMap<string, Set<string>>(MAX_TRACKED_WALLETS);
const notifiedProposedTxs = new LRUMap<string, Set<string>>(MAX_TRACKED_WALLETS);

// Global tracking of notified approvals (to detect when someone else approves)
// Using 2-level structure: walletAddress -> Map<txHash, Set<approvers>>
// This prevents unbounded growth from composite keys
const notifiedApprovals = new LRUMap<string, Map<string, Set<string>>>(MAX_TRACKED_WALLETS);

// Maximum number of transactions to keep in cache per wallet
const MAX_CACHE_TRANSACTIONS = 500;

/** Cap a Set to the last N entries by removing the oldest ones */
function capSet<T>(set: Set<T>, max: number): void {
  if (set.size <= max) return;
  const iter = set.values();
  let toRemove = set.size - max;
  while (toRemove-- > 0) {
    const next = iter.next();
    if (!next.done) set.delete(next.value);
  }
}

// Global tracking of notified wallet changes (owners, threshold)
const lastNotifiedOwners = new LRUMap<string, string>(MAX_TRACKED_WALLETS);
const lastNotifiedThresholds = new LRUMap<string, number>(MAX_TRACKED_WALLETS);

// Global tracking of notified module status changes
const lastNotifiedModuleStatus = new LRUMap<string, Record<string, boolean>>(MAX_TRACKED_WALLETS);

// Track which wallets are being watched by active hook instances (for cleanup)
// This one doesn't need LRU since it's cleaned up when hooks unmount
const activeWalletSubscriptions = new Map<string, number>();

/**
 * Clean up global state for a wallet when no longer needed
 */
function cleanupWalletState(walletAddress: string): void {
  const normalizedAddress = walletAddress.toLowerCase();
  lastNotifiedBalances.delete(normalizedAddress);
  lastNotifiedOwners.delete(normalizedAddress);
  lastNotifiedThresholds.delete(normalizedAddress);
  lastNotifiedModuleStatus.delete(normalizedAddress);
  notifiedExecutedTxs.delete(normalizedAddress);
  notifiedCancelledTxs.delete(normalizedAddress);
  notifiedReadyTxs.delete(normalizedAddress);
  notifiedProposedTxs.delete(normalizedAddress);

  // notifiedApprovals uses 2-level structure, just delete the wallet entry
  notifiedApprovals.delete(normalizedAddress);
}

/**
 * Hook to detect if the page is visible (not hidden/minimized)
 */
function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof document === 'undefined') return true;
    return !document.hidden;
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}

export function useMultisig(walletAddress?: string) {
  const queryClient = useQueryClient();
  const isPageVisible = usePageVisibility();
  const { isConnected: isIndexerConnected } = useIndexerConnection();
  const {
    address: connectedAddress,
    setError,
    setLoading,
    setWalletInfo,
    setPendingTransactions,
  } = useWalletStore();

  // Track previous balances for each wallet (using ref to persist across renders)
  const prevBalancesRef = useRef<Map<string, string>>(new Map());

  // Track previous pending transactions state (for approval changes)
  const prevPendingTxsRef = useRef<Map<string, Map<string, PendingTransaction>>>(new Map()); // walletAddress -> Map<txHash, tx>

  // Track previous wallet info (for owner/threshold changes)
  const prevWalletInfoRef = useRef<Map<string, { owners: string[]; threshold: number }>>(new Map());

  // Cache wallet threshold to avoid repeated fetches in subscription updates
  const walletThresholdCacheRef = useRef<Map<string, number>>(new Map());

  // Global processing queue for ALL subscription cache updates (prevents race conditions)
  // Using a single queue ensures setQueryData calls don't interleave across different transactions
  const cacheUpdateQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Track queue size with hard limit to prevent memory issues
  const cacheUpdateQueueSizeRef = useRef<number>(0);
  const QUEUE_WARNING_THRESHOLD = 20; // Log warning when queue backs up
  const MAX_QUEUE_SIZE = 100; // Hard limit - drop updates if exceeded

  // Track mutation timeouts for cleanup on unmount
  const mutationTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Track active subscription count for cleanup
  useEffect(() => {
    if (!walletAddress) return;
    const normalizedAddress = walletAddress.toLowerCase();

    // Increment subscription count
    activeWalletSubscriptions.set(
      normalizedAddress,
      (activeWalletSubscriptions.get(normalizedAddress) ?? 0) + 1
    );

    return () => {
      // Clean up per-instance refs for this wallet to prevent memory leaks
      prevPendingTxsRef.current.delete(normalizedAddress);
      prevBalancesRef.current.delete(normalizedAddress);
      prevWalletInfoRef.current.delete(normalizedAddress);
      walletThresholdCacheRef.current.delete(normalizedAddress);

      // Decrement subscription count on unmount
      const count = activeWalletSubscriptions.get(normalizedAddress) ?? 1;
      if (count <= 1) {
        activeWalletSubscriptions.delete(normalizedAddress);
        // Clean up global state when no hooks are watching this wallet
        cleanupWalletState(normalizedAddress);
      } else {
        activeWalletSubscriptions.set(normalizedAddress, count - 1);
      }
    };
  }, [walletAddress]);

  // Get wallet info
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
      setWalletInfo(walletAddress, info);
      // Cache threshold for subscription updates
      if (info) {
        walletThresholdCacheRef.current.set(walletAddress.toLowerCase(), info.threshold);
      }
      return info;
    },
    enabled: !!walletAddress && isPageVisible,
    // Reduce polling frequency - subscriptions handle most updates
    refetchInterval: isPageVisible ? POLLING_INTERVALS.WALLET_INFO : false,
  });

  // Track wallet info changes for notifications (balance, owners, threshold)
  useEffect(() => {
    if (walletInfo && walletAddress) {
      // Normalize address for consistent map key access (matches cleanup in unmount effect)
      const normalizedAddr = walletAddress.toLowerCase();
      const prevInfo = prevWalletInfoRef.current.get(normalizedAddr);

      // Track balance changes
      const currentBalance = walletInfo.balance;
      const prevBalance = prevBalancesRef.current.get(normalizedAddr);
      const lastNotifiedBalance = lastNotifiedBalances.get(normalizedAddr);

      if (prevBalance && currentBalance) {
        const prevBigInt = BigInt(prevBalance);
        const currentBigInt = BigInt(currentBalance);
        const lastNotifiedBigInt = lastNotifiedBalance ? BigInt(lastNotifiedBalance) : null;

        const hasIncreased = currentBigInt > prevBigInt;
        const alreadyNotified = lastNotifiedBigInt !== null && currentBigInt === lastNotifiedBigInt;

        if (hasIncreased && !alreadyNotified) {
          const increase = currentBigInt - prevBigInt;
          const increaseFormatted = parseFloat(formatQuai(increase)).toFixed(4);
          const totalFormatted = parseFloat(formatQuai(currentBigInt)).toFixed(4);

          lastNotifiedBalances.set(normalizedAddr, currentBalance);

          notificationManager.add({
            message: `💰 Vault received ${increaseFormatted} QUAI! New balance: ${totalFormatted} QUAI`,
            type: 'success',
          });

          if (canShowBrowserNotifications()) {
            sendBrowserNotification('Vault Received Funds', {
              body: `Received ${increaseFormatted} QUAI. New balance: ${totalFormatted} QUAI`,
              tag: `${normalizedAddr}-${currentBalance}`,
            });
          }
        }
      }

      prevBalancesRef.current.set(normalizedAddr, currentBalance);

      // Track owner changes
      if (prevInfo) {
        const prevOwners = prevInfo.owners.map(o => o.toLowerCase()).sort();
        const currentOwners = walletInfo.owners.map(o => o.toLowerCase()).sort();

        // Use Set comparison instead of JSON.stringify for better performance
        const prevOwnersSet = new Set(prevOwners);
        const currentOwnersSet = new Set(currentOwners);
        const ownersChanged = prevOwners.length !== currentOwners.length ||
          prevOwners.some(o => !currentOwnersSet.has(o));

        // Use joined string for notification dedup (sorted, so consistent)
        const currentOwnersKey = currentOwners.join(',');
        const lastNotifiedOwnersKey = lastNotifiedOwners.get(normalizedAddr);

        if (ownersChanged && currentOwnersKey !== lastNotifiedOwnersKey) {
          const addedOwners = currentOwners.filter(addr => !prevOwnersSet.has(addr));
          const removedOwners = prevOwners.filter(addr => !currentOwnersSet.has(addr));

          if (addedOwners.length > 0) {
            addedOwners.forEach((owner) => {
              const ownerShort = `${owner.slice(0, 6)}...${owner.slice(-4)}`;
              notificationManager.add({
                message: `👤 Owner added: ${ownerShort}`,
                type: 'success',
              });
            });
          }

          if (removedOwners.length > 0) {
            removedOwners.forEach((owner) => {
              const ownerShort = `${owner.slice(0, 6)}...${owner.slice(-4)}`;
              notificationManager.add({
                message: `👤 Owner removed: ${ownerShort}`,
                type: 'warning',
              });
            });
          }

          lastNotifiedOwners.set(normalizedAddr, currentOwnersKey);
        }

        // Track threshold changes
        const prevThreshold = prevInfo.threshold;
        const currentThreshold = walletInfo.threshold;
        const lastNotifiedThreshold = lastNotifiedThresholds.get(normalizedAddr);

        if (prevThreshold !== currentThreshold && currentThreshold !== lastNotifiedThreshold) {
          notificationManager.add({
            message: `⚙️ Threshold changed: ${prevThreshold} → ${currentThreshold}`,
            type: 'info',
          });

          if (canShowBrowserNotifications()) {
            sendBrowserNotification('Threshold Changed', {
              body: `Approval threshold changed from ${prevThreshold} to ${currentThreshold}`,
              tag: `threshold-${normalizedAddr}-${currentThreshold}`,
            });
          }

          lastNotifiedThresholds.set(normalizedAddr, currentThreshold);
        }
      }

      // Update stored wallet info
      prevWalletInfoRef.current.set(normalizedAddr, {
        owners: walletInfo.owners,
        threshold: walletInfo.threshold,
      });
    }
  }, [walletInfo, walletAddress]);

  // Query module statuses to track changes
  const {
    data: moduleStatuses,
  } = useQuery({
    queryKey: ['moduleStatus', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      const moduleAddresses = [
        CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE,
        CONTRACT_ADDRESSES.DAILY_LIMIT_MODULE,
        CONTRACT_ADDRESSES.WHITELIST_MODULE,
      ].filter(Boolean) as string[];

      // Use Promise.all for parallel queries instead of sequential
      const results = await Promise.all(
        moduleAddresses.map(async (moduleAddress) => {
          try {
            const isEnabled = await multisigService.isModuleEnabled(walletAddress, moduleAddress);
            return { moduleAddress, isEnabled };
          } catch (error) {
            console.warn(`Failed to check status for module ${moduleAddress}:`,
              error instanceof Error ? error.message : 'Unknown error');
            return { moduleAddress, isEnabled: false };
          }
        })
      );

      const statuses: Record<string, boolean> = {};
      results.forEach(({ moduleAddress, isEnabled }) => {
        statuses[moduleAddress] = isEnabled;
      });
      return statuses;
    },
    enabled: !!walletAddress && isPageVisible,
    // Less frequent polling - module status doesn't change often
    refetchInterval: isPageVisible ? POLLING_INTERVALS.WALLET_INFO : false,
  });

  // Track module status changes for notifications
  useEffect(() => {
    if (!moduleStatuses || !walletAddress) return;
    const normalizedAddr = walletAddress.toLowerCase();

    const prevStatuses = lastNotifiedModuleStatus.get(normalizedAddr) || {};
    const currentStatuses = moduleStatuses;

    // Check each module for status changes
    for (const [moduleAddress, isEnabled] of Object.entries(currentStatuses)) {
      const prevEnabled = prevStatuses[moduleAddress];
      const moduleName = getModuleName(moduleAddress) || 'Unknown Module';

      // Only notify if status actually changed (not on first load)
      if (prevEnabled !== undefined && prevEnabled !== isEnabled) {
        if (isEnabled) {
          notificationManager.add({
            message: `✅ ${moduleName} module enabled`,
            type: 'success',
          });

          if (canShowBrowserNotifications()) {
            sendBrowserNotification(`${moduleName} Module Enabled`, {
              body: `The ${moduleName} module has been enabled for this vault`,
            });
          }
        } else {
          notificationManager.add({
            message: `✅ ${moduleName} module disabled`,
            type: 'success',
          });

          if (canShowBrowserNotifications()) {
            sendBrowserNotification(`${moduleName} Module Disabled`, {
              body: `The ${moduleName} module has been disabled for this vault`,
            });
          }
        }
      }
    }

    // Update last notified status
    lastNotifiedModuleStatus.set(normalizedAddr, { ...currentStatuses });
  }, [moduleStatuses, walletAddress]);

  // Get pending transactions
  const {
    data: pendingTransactions,
    isLoading: isLoadingTransactions,
    refetch: refetchTransactions,
    isRefetching: isRefetchingPending,
  } = useQuery({
    queryKey: ['pendingTransactions', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const txs = await multisigService.getPendingTransactions(walletAddress);
      setPendingTransactions(walletAddress, txs);
      return txs;
    },
    enabled: !!walletAddress && isPageVisible,
    // Poll as primary update mechanism when indexer unavailable,
    // or as fallback safety net when subscriptions are active
    refetchInterval: isPageVisible
      ? (isIndexerConnected
          ? POLLING_INTERVALS.PENDING_TXS_FALLBACK  // Backup when subscriptions active
          : POLLING_INTERVALS.PENDING_TXS)          // Primary when no subscriptions
      : false,
  });

  // Real-time subscriptions when indexer is connected
  useEffect(() => {
    if (!walletAddress || !isIndexerConnected || !INDEXER_CONFIG.ENABLED) return;

    // Track if effect is still active (prevents race conditions on unmount)
    let isActive = true;

    // Helper to queue ALL cache updates sequentially (prevents race conditions)
    // Using a single global queue ensures setQueryData calls don't interleave
    // across different transactions affecting the same query cache
    const queueCacheUpdate = (processor: () => Promise<void>): void => {
      // Enforce hard limit to prevent memory issues
      if (cacheUpdateQueueSizeRef.current >= MAX_QUEUE_SIZE) {
        console.warn(`Cache update queue at max capacity (${MAX_QUEUE_SIZE}), dropping update`);
        return;
      }

      cacheUpdateQueueSizeRef.current++;

      // Log warning if queue is backing up (but still process)
      if (cacheUpdateQueueSizeRef.current > QUEUE_WARNING_THRESHOLD) {
        console.debug(`Cache update queue size: ${cacheUpdateQueueSizeRef.current}`);
      }

      cacheUpdateQueueRef.current = cacheUpdateQueueRef.current
        .catch((prevError) => {
          // Log errors from previous processing for debugging
          console.debug('Previous cache update error:', prevError instanceof Error ? prevError.message : 'Unknown');
        })
        .then(async () => {
          // Check if effect is still active before processing
          if (!isActive) return;
          await processor();
        })
        .catch((error) => {
          console.warn('Cache update failed:', error instanceof Error ? error.message : 'Unknown error');
        })
        .finally(() => {
          cacheUpdateQueueSizeRef.current--;
        });
    };

    // Helper to get threshold (cached or fetch)
    const getThreshold = async (): Promise<number> => {
      const cached = walletThresholdCacheRef.current.get(walletAddress.toLowerCase());
      if (cached !== undefined) return cached;
      
      // Fetch and cache
      const wallet = await indexerService.wallet.getWalletDetails(walletAddress);
      if (wallet) {
        walletThresholdCacheRef.current.set(walletAddress.toLowerCase(), wallet.threshold);
        return wallet.threshold;
      }
      return 1; // Fallback
    };

    // Subscribe to transaction updates
    const unsubscribeTx = indexerService.subscription.subscribeToTransactions(walletAddress, {
      onInsert: (tx) => {
        queueCacheUpdate(async () => {
          if (!isActive) return;

          // Parallelize: fetch threshold and confirmations simultaneously
          const [threshold, confirmations] = await Promise.all([
            getThreshold(),
            indexerService.transaction.getActiveConfirmations(walletAddress, tx.tx_hash)
          ]);

          if (!isActive) return;

          const converted = convertIndexerTransaction(tx, threshold, confirmations);

          queryClient.setQueryData<PendingTransaction[]>(
            ['pendingTransactions', walletAddress],
            (old = []) => {
              // Limit cache size to prevent unbounded growth
              return [converted, ...old].slice(0, MAX_CACHE_TRANSACTIONS);
            }
          );
        });
      },
      onUpdate: (tx) => {
        queueCacheUpdate(async () => {
          if (!isActive) return;

          // Parallelize: fetch threshold and confirmations simultaneously
          const [threshold, confirmations] = await Promise.all([
            getThreshold(),
            indexerService.transaction.getActiveConfirmations(walletAddress, tx.tx_hash)
          ]);

          if (!isActive) return;

          const converted = convertIndexerTransaction(tx, threshold, confirmations);

          if (tx.status === 'executed' || tx.status === 'cancelled') {
            // Remove from pending
            queryClient.setQueryData<PendingTransaction[]>(
              ['pendingTransactions', walletAddress],
              (old = []) => old.filter((t) => t.hash !== tx.tx_hash)
            );

            // Add to appropriate history
            const historyKey = tx.status === 'executed' ? 'executedTransactions' : 'cancelledTransactions';
            queryClient.setQueryData<PendingTransaction[]>(
              [historyKey, walletAddress],
              // Limit cache size to prevent unbounded growth
              (old = []) => [converted, ...old].slice(0, MAX_CACHE_TRANSACTIONS)
            );
          } else {
            // Update in pending
            queryClient.setQueryData<PendingTransaction[]>(
              ['pendingTransactions', walletAddress],
              (old = []) => old.map((t) => (t.hash === tx.tx_hash ? converted : t))
            );
          }
        });
      },
      onError: (error) => {
        if (!isActive) return;
        console.error('Transaction subscription error:', error instanceof Error ? error.message : 'Unknown error');
        // Invalidate indexer health cache to trigger immediate re-check
        multisigService.invalidateIndexerCache();
        // Refresh data as fallback
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', walletAddress] });
      },
      onReconnect: () => {
        if (!isActive) return;
        // Refresh all transaction data after reconnection to catch any missed events
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['executedTransactions', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['cancelledTransactions', walletAddress] });
      },
    });

    // Subscribe to confirmations for instant approval updates
    const unsubscribeConfirmations = indexerService.subscription.subscribeToConfirmations(walletAddress, {
      onInsert: (confirmation) => {
        queueCacheUpdate(async () => {
          if (!isActive) return;

          // Get threshold (cached)
          const threshold = await getThreshold();

          // Fetch transaction and all confirmations
          const [tx, confirmations] = await Promise.all([
            indexerService.transaction.getTransactionByHash(walletAddress, confirmation.tx_hash),
            indexerService.transaction.getActiveConfirmations(walletAddress, confirmation.tx_hash)
          ]);

          if (!tx || !isActive) return;

          const converted = convertIndexerTransaction(tx, threshold, confirmations);

          // Update transaction in cache
          queryClient.setQueryData<PendingTransaction[]>(
            ['pendingTransactions', walletAddress],
            (old = []) => old.map((t) => (t.hash === confirmation.tx_hash ? converted : t))
          );
        });
      },
      onDelete: (confirmation) => {
        queueCacheUpdate(async () => {
          if (!isActive) return;

          // Get threshold (cached)
          const threshold = await getThreshold();

          // Fetch transaction and remaining confirmations
          const [tx, confirmations] = await Promise.all([
            indexerService.transaction.getTransactionByHash(walletAddress, confirmation.tx_hash),
            indexerService.transaction.getActiveConfirmations(walletAddress, confirmation.tx_hash)
          ]);

          if (!tx || !isActive) return;

          const converted = convertIndexerTransaction(tx, threshold, confirmations);

          // Update transaction in cache
          queryClient.setQueryData<PendingTransaction[]>(
            ['pendingTransactions', walletAddress],
            (old = []) => old.map((t) => (t.hash === confirmation.tx_hash ? converted : t))
          );
        });
      },
      onError: (error) => {
        if (!isActive) return;
        console.warn('Confirmation subscription error:', error instanceof Error ? error.message : 'Unknown error');
      },
    });

    // Subscribe to deposit updates (triggers balance refresh; notification handled by balance-change detection)
    // This is the single deposit subscription — DepositHistory relies on query invalidation here
    const unsubscribeDeposit = indexerService.subscription.subscribeToDeposits(walletAddress, {
      onInsert: () => {
        if (!isActive) return;
        // Refresh wallet info to update balance (the balance-change effect handles the notification)
        queryClient.invalidateQueries({ queryKey: ['walletInfo', walletAddress] });
        // Also refresh deposit history list
        queryClient.invalidateQueries({ queryKey: ['deposits', walletAddress] });
      },
      onReconnect: () => {
        if (!isActive) return;
        // Refresh wallet info after reconnection to catch any missed deposits
        queryClient.invalidateQueries({ queryKey: ['walletInfo', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['deposits', walletAddress] });
      },
    });

    // Subscribe to daily limit state updates
    const unsubscribeDailyLimit = indexerService.subscription.subscribeToDailyLimitState(walletAddress, {
      onInsert: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['dailyLimit', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['remainingLimit', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['timeUntilReset', walletAddress] });
      },
      onUpdate: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['dailyLimit', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['remainingLimit', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['timeUntilReset', walletAddress] });
      },
      onReconnect: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['dailyLimit', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['remainingLimit', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['timeUntilReset', walletAddress] });
      },
    });

    // Subscribe to whitelist entry updates
    const unsubscribeWhitelist = indexerService.subscription.subscribeToWhitelistEntries(walletAddress, {
      onInsert: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['whitelistedAddresses', walletAddress] });
      },
      onUpdate: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['whitelistedAddresses', walletAddress] });
      },
      onDelete: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['whitelistedAddresses', walletAddress] });
      },
      onReconnect: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['whitelistedAddresses', walletAddress] });
      },
    });

    // Subscribe to wallet module updates
    const unsubscribeModules = indexerService.subscription.subscribeToWalletModules(walletAddress, {
      onInsert: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['moduleStatus', walletAddress] });
      },
      onUpdate: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['moduleStatus', walletAddress] });
      },
      onReconnect: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['moduleStatus', walletAddress] });
      },
    });

    // Subscribe to wallet owner updates
    const unsubscribeOwners = indexerService.subscription.subscribeToWalletOwners(walletAddress, {
      onInsert: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['walletInfo', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['owners', walletAddress] });
      },
      onUpdate: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['walletInfo', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['owners', walletAddress] });
      },
      onReconnect: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['walletInfo', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['owners', walletAddress] });
      },
    });

    // Subscribe to recovery config changes (social_recovery_configs + social_recovery_guardians)
    const unsubscribeRecoveryConfig = indexerService.subscription.subscribeToRecoveryConfig(walletAddress, {
      onInsert: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['recoveryConfig', walletAddress] });
      },
      onUpdate: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['recoveryConfig', walletAddress] });
      },
      onReconnect: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['recoveryConfig', walletAddress] });
      },
    });

    // Subscribe to social recovery updates (pending recovery operations)
    const unsubscribeSocialRecoveries = indexerService.subscription.subscribeToSocialRecoveries(walletAddress, {
      onInsert: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      },
      onUpdate: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      },
      onReconnect: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['recoveryConfig', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      },
    });

    // Subscribe to recovery approval updates
    const unsubscribeRecoveryApprovals = indexerService.subscription.subscribeToRecoveryApprovals(walletAddress, {
      onInsert: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      },
      onUpdate: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      },
      onReconnect: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      },
    });

    return () => {
      // Mark effect as inactive to prevent in-flight operations from updating state
      isActive = false;
      unsubscribeTx();
      unsubscribeConfirmations();
      unsubscribeDeposit();
      unsubscribeDailyLimit();
      unsubscribeWhitelist();
      unsubscribeModules();
      unsubscribeOwners();
      unsubscribeRecoveryConfig();
      unsubscribeSocialRecoveries();
      unsubscribeRecoveryApprovals();
    };
  }, [walletAddress, isIndexerConnected, queryClient]);

  // Track pending transactions for notifications (new transactions, approvals, ready to execute)
  useEffect(() => {
    if (!pendingTransactions || !walletAddress) return;

    // Normalize addresses once at the start to avoid repeated toLowerCase() calls
    const normalizedWallet = walletAddress.toLowerCase();
    const normalizedConnected = connectedAddress?.toLowerCase();

    const prevTxsMap = prevPendingTxsRef.current.get(normalizedWallet) || new Map();
    const currentTxsMap = new Map<string, PendingTransaction>();

    // Process current transactions
    pendingTransactions.forEach((tx) => {
      const txHashLower = tx.hash.toLowerCase();
      currentTxsMap.set(txHashLower, tx);
      const prevTx = prevTxsMap.get(txHashLower);

      if (!prevTx) {
        // New transaction detected (only notify if we had previous transactions and haven't already notified)
        const walletProposedSet = notifiedProposedTxs.get(normalizedWallet) ?? new Set();
        if (prevTxsMap.size > 0 && !walletProposedSet.has(txHashLower)) {
          walletProposedSet.add(txHashLower);
          capSet(walletProposedSet, MAX_CACHE_TRANSACTIONS);
          notifiedProposedTxs.set(normalizedWallet, walletProposedSet);
          notificationManager.add({
            message: `📝 New transaction proposed: ${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
            type: 'info',
          });

          if (canShowBrowserNotifications()) {
            sendBrowserNotification('New Transaction Proposed', {
              body: `Transaction ${tx.hash.slice(0, 10)}... requires approval`,
              tag: tx.hash,
            });
          }
        }
      } else {
        // Existing transaction - check for changes

        // Check if transaction is now ready to execute
        const wasReady = prevTx.numApprovals >= prevTx.threshold;
        const isReady = tx.numApprovals >= tx.threshold;
        const walletReadySet = notifiedReadyTxs.get(normalizedWallet) ?? new Set();
        if (!wasReady && isReady && !walletReadySet.has(txHashLower)) {
          walletReadySet.add(txHashLower);
          capSet(walletReadySet, MAX_CACHE_TRANSACTIONS);
          notifiedReadyTxs.set(normalizedWallet, walletReadySet);
          notificationManager.add({
            message: `✅ Transaction ready to execute! ${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
            type: 'success',
          });

          if (canShowBrowserNotifications()) {
            sendBrowserNotification('Transaction Ready to Execute', {
              body: `Transaction ${tx.hash.slice(0, 10)}... has reached the threshold`,
              tag: `ready-${tx.hash}`,
            });
          }
        }

        // Check for new approvals (someone else approved)
        if (normalizedConnected) {
          // Filter approvals by checking the raw key (approvals map keys may be mixed-case)
          const prevApprovals = Object.keys(prevTx.approvals).filter(addr => prevTx.approvals[addr]).map(addr => addr.toLowerCase());
          const currentApprovals = Object.keys(tx.approvals).filter(addr => tx.approvals[addr]).map(addr => addr.toLowerCase());

          // Find new approvers (not the connected user)
          const newApprovers = currentApprovals.filter(
            addr => !prevApprovals.includes(addr) && addr !== normalizedConnected
          );

          if (newApprovers.length > 0) {
            // Use 2-level structure: wallet -> txHash -> Set<approvers>
            let walletApprovals = notifiedApprovals.get(normalizedWallet);
            if (!walletApprovals) {
              walletApprovals = new Map<string, Set<string>>();
              notifiedApprovals.set(normalizedWallet, walletApprovals);
            }
            const notifiedSet = walletApprovals.get(txHashLower) ?? new Set<string>();

            newApprovers.forEach((approver) => {
              if (!notifiedSet.has(approver)) {
                notifiedSet.add(approver);
                const approverShort = `${approver.slice(0, 6)}...${approver.slice(-4)}`;
                notificationManager.add({
                  message: `👍 ${approverShort} approved transaction ${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
                  type: 'info',
                });

                if (canShowBrowserNotifications()) {
                  sendBrowserNotification('Transaction Approved', {
                    body: `${approverShort} approved transaction ${tx.hash.slice(0, 10)}...`,
                    tag: `approval-${tx.hash}-${approver}`,
                  });
                }
              }
            });

            walletApprovals.set(txHashLower, notifiedSet);
          }

          // Check for revoked approvals
          const revokedApprovers = prevApprovals.filter(
            addr => !currentApprovals.includes(addr) && addr !== normalizedConnected
          );

          if (revokedApprovers.length > 0) {
            revokedApprovers.forEach((revoker) => {
              const revokerShort = `${revoker.slice(0, 6)}...${revoker.slice(-4)}`;
              notificationManager.add({
                message: `👎 ${revokerShort} revoked approval for transaction ${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
                type: 'warning',
              });
            });
          }
        }
      }
    });

    // Update stored state
    prevPendingTxsRef.current.set(normalizedWallet, currentTxsMap);
  }, [pendingTransactions, walletAddress, connectedAddress]);

  // Get executed transactions (history)
  const {
    data: executedTransactions,
    isLoading: isLoadingHistory,
    refetch: refetchHistory,
    isRefetching: isRefetchingHistory,
  } = useQuery({
    queryKey: ['executedTransactions', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const txs = await multisigService.getExecutedTransactions(walletAddress);
      return txs;
    },
    enabled: !!walletAddress && isPageVisible,
    // Less frequent polling for history (not time-sensitive)
    refetchInterval: isPageVisible ? POLLING_INTERVALS.TRANSACTION_HISTORY : false,
  });

  // Track executed transactions for notifications
  useEffect(() => {
    if (!executedTransactions || !walletAddress) return;

    const normalizedWallet = walletAddress.toLowerCase();
    const walletExecutedSet = notifiedExecutedTxs.get(normalizedWallet) ?? new Set();

    executedTransactions.forEach((tx) => {
      const txHashLower = tx.hash.toLowerCase();
      if (!walletExecutedSet.has(txHashLower)) {
        walletExecutedSet.add(txHashLower);

        // Only notify if this was a pending transaction we were tracking
        const wasPending = prevPendingTxsRef.current.get(normalizedWallet)?.has(txHashLower);
        if (wasPending) {
          notificationManager.add({
            message: `✅ Transaction executed: ${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
            type: 'success',
          });

          if (canShowBrowserNotifications()) {
            sendBrowserNotification('Transaction Executed', {
              body: `Transaction ${tx.hash.slice(0, 10)}... has been executed`,
              tag: `executed-${tx.hash}`,
            });
          }
        }
      }
    });

    capSet(walletExecutedSet, MAX_CACHE_TRANSACTIONS);
    notifiedExecutedTxs.set(normalizedWallet, walletExecutedSet);
  }, [executedTransactions, walletAddress]);

  // Get cancelled transactions
  const {
    data: cancelledTransactions,
    isLoading: isLoadingCancelled,
    refetch: refetchCancelled,
    isRefetching: isRefetchingCancelled,
  } = useQuery({
    queryKey: ['cancelledTransactions', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const txs = await multisigService.getCancelledTransactions(walletAddress);
      return txs;
    },
    enabled: !!walletAddress && isPageVisible,
    // Less frequent polling for history (not time-sensitive)
    refetchInterval: isPageVisible ? POLLING_INTERVALS.TRANSACTION_HISTORY : false,
  });

  // Track cancelled transactions for notifications
  useEffect(() => {
    if (!cancelledTransactions || !walletAddress) return;

    const normalizedWallet = walletAddress.toLowerCase();
    const walletCancelledSet = notifiedCancelledTxs.get(normalizedWallet) ?? new Set();

    cancelledTransactions.forEach((tx) => {
      const txHashLower = tx.hash.toLowerCase();
      if (!walletCancelledSet.has(txHashLower)) {
        walletCancelledSet.add(txHashLower);

        // Only notify if this was a pending transaction we were tracking
        const wasPending = prevPendingTxsRef.current.get(normalizedWallet)?.has(txHashLower);
        if (wasPending) {
          notificationManager.add({
            message: `❌ Transaction cancelled: ${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`,
            type: 'warning',
          });

          if (canShowBrowserNotifications()) {
            sendBrowserNotification('Transaction Cancelled', {
              body: `Transaction ${tx.hash.slice(0, 10)}... has been cancelled`,
              tag: `cancelled-${tx.hash}`,
            });
          }
        }
      }
    });

    capSet(walletCancelledSet, MAX_CACHE_TRANSACTIONS);
    notifiedCancelledTxs.set(normalizedWallet, walletCancelledSet);
  }, [cancelledTransactions, walletAddress]);

  // Get social recovery history
  const {
    data: recoveryHistory,
    isLoading: isLoadingRecoveryHistory,
    refetch: refetchRecoveryHistory,
    isRefetching: isRefetchingRecoveryHistory,
  } = useQuery({
    queryKey: ['recoveryHistory', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      return await multisigService.getRecoveryHistory(walletAddress);
    },
    enabled: !!walletAddress && isPageVisible,
    refetchInterval: isPageVisible ? POLLING_INTERVALS.TRANSACTION_HISTORY : false,
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
    // Less frequent polling - wallet list doesn't change often
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
    // Less frequent polling - wallet list doesn't change often
    refetchInterval: isPageVisible ? POLLING_INTERVALS.USER_WALLETS : false,
  });

  // Deploy wallet mutation
  const deployWallet = useMutation({
    mutationFn: async (config: DeploymentConfig) => {
      setLoading(true);
      return await multisigService.wallet.deployWallet(config);
    },
    onSuccess: () => {
      // Invalidate to refetch wallet list from indexer
      queryClient.invalidateQueries({ queryKey: ['userWallets'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to deploy wallet');
    },
    onSettled: () => {
      setLoading(false);
    },
  });

  // Propose transaction mutation
  const proposeTransaction = useMutation({
    mutationFn: async (tx: TransactionData & { walletAddress: string }) => {
      return await multisigService.proposeTransaction(
        tx.walletAddress,
        tx.to,
        tx.value,
        tx.data
      );
    },
    onSuccess: (txHash, variables) => {
      // Mark this transaction as already notified to prevent duplicate notifications from polling
      if (txHash) {
        const normalizedWallet = variables.walletAddress.toLowerCase();
        const walletProposedSet = notifiedProposedTxs.get(normalizedWallet) ?? new Set();
        walletProposedSet.add(txHash.toLowerCase());
        capSet(walletProposedSet, MAX_CACHE_TRANSACTIONS);
        notifiedProposedTxs.set(normalizedWallet, walletProposedSet);
      }
      // Show success notification when you propose a transaction
      notificationManager.add({
        message: `Transaction proposed successfully! Hash: ${txHash?.slice(0, 10)}...${txHash?.slice(-6)}`,
        type: 'success',
      });
      // Invalidate to pick up new transaction from indexer/subscription
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to propose transaction');
      // Show error notification
      notificationManager.add({
        message: `Failed to propose transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    },
  });

  // Approve transaction mutation
  const approveTransaction = useMutation({
    mutationFn: async ({ walletAddress, txHash }: { walletAddress: string; txHash: string }) => {
      return await multisigService.approveTransaction(walletAddress, txHash);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
    },
    onError: (error, variables) => {
      setError(error instanceof Error ? error.message : 'Failed to approve transaction');
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
    },
  });

  // Revoke approval mutation
  const revokeApproval = useMutation({
    mutationFn: async ({ walletAddress, txHash }: { walletAddress: string; txHash: string }) => {
      return await multisigService.revokeApproval(walletAddress, txHash);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
    },
    onError: (error, variables) => {
      setError(error instanceof Error ? error.message : 'Failed to revoke approval');
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
    },
  });

  // Execute transaction mutation
  const executeTransaction = useMutation({
    mutationFn: async ({ walletAddress, txHash }: { walletAddress: string; txHash: string }) => {
      return await multisigService.executeTransaction(walletAddress, txHash);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['executedTransactions', variables.walletAddress] });
      // Invalidate module queries - executed transaction may have changed module config
      queryClient.invalidateQueries({ queryKey: ['dailyLimit', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['remainingLimit', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['timeUntilReset', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['whitelistedAddresses', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['moduleStatus', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['recoveryConfig', variables.walletAddress] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to execute transaction');
    },
  });

  // Cancel transaction mutation
  const cancelTransaction = useMutation({
    mutationFn: async ({ walletAddress, txHash }: { walletAddress: string; txHash: string }) => {
      return await multisigService.cancelTransaction(walletAddress, txHash);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['cancelledTransactions', variables.walletAddress] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to cancel transaction');
    },
  });

  // Add owner mutation (proposes transaction)
  const addOwner = useMutation({
    mutationFn: async ({ walletAddress, newOwner }: { walletAddress: string; newOwner: string }) => {
      return await multisigService.owner.addOwner(walletAddress, newOwner);
    },
    onSuccess: (_txHash, variables) => {
      // Invalidate and refetch queries
      queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      // Also manually refetch after a short delay to ensure the transaction appears
      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        queryClient.refetchQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 2000);
      mutationTimeoutsRef.current.add(timeoutId);
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to add owner');
    },
  });

  // Remove owner mutation (proposes transaction)
  const removeOwner = useMutation({
    mutationFn: async ({ walletAddress, owner }: { walletAddress: string; owner: string }) => {
      return await multisigService.owner.removeOwner(walletAddress, owner);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to remove owner');
    },
  });

  // Change threshold mutation (proposes transaction)
  const changeThreshold = useMutation({
    mutationFn: async ({ walletAddress, newThreshold }: { walletAddress: string; newThreshold: number }) => {
      return await multisigService.owner.changeThreshold(walletAddress, newThreshold);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to change threshold');
    },
  });

  // Enable module mutation (proposes transaction)
  const enableModule = useMutation({
    mutationFn: async ({ walletAddress, moduleAddress }: { walletAddress: string; moduleAddress: string }) => {
      return await multisigService.owner.enableModule(walletAddress, moduleAddress);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['moduleStatus', variables.walletAddress] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to enable module');
    },
  });

  // Disable module mutation (proposes transaction)
  const disableModule = useMutation({
    mutationFn: async ({ walletAddress, moduleAddress }: { walletAddress: string; moduleAddress: string }) => {
      return await multisigService.owner.disableModule(walletAddress, moduleAddress);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['moduleStatus', variables.walletAddress] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to disable module');
    },
  });

  // Execute transaction via whitelist (bypasses approval requirement)
  const executeToWhitelist = useMutation({
    mutationFn: async (tx: TransactionData & { walletAddress: string }) => {
      return await multisigService.whitelist.executeToWhitelist(
        tx.walletAddress,
        tx.to,
        tx.value,
        tx.data
      );
    },
    onSuccess: (txHash, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['executedTransactions', variables.walletAddress] });
      if (txHash) {
        notificationManager.add({
          message: `✅ Transaction executed via whitelist! Hash: ${txHash.slice(0, 10)}...${txHash.slice(-6)}`,
          type: 'success',
        });
      }
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to execute transaction via whitelist');
      notificationManager.add({
        message: `Failed to execute via whitelist: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    },
  });

  // Execute transaction via daily limit (bypasses approval requirement)
  // Note: This is ONLY enforced in the frontend. Users can bypass this by interacting with the multisig directly.
  const executeBelowLimit = useMutation({
    mutationFn: async (tx: TransactionData & { walletAddress: string }) => {
      return await multisigService.dailyLimit.executeBelowLimit(
        tx.walletAddress,
        tx.to,
        tx.value
      );
    },
    onSuccess: (txHash, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['executedTransactions', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['dailyLimit', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['remainingLimit', variables.walletAddress] });
      if (txHash) {
        notificationManager.add({
          message: `✅ Transaction executed via daily limit! Hash: ${txHash.slice(0, 10)}...${txHash.slice(-6)}`,
          type: 'success',
        });
      }
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to execute transaction via daily limit');
      notificationManager.add({
        message: `Failed to execute via daily limit: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    },
  });

  // Track manual refresh state (separate from polling/subscription updates)
  const [isManuallyRefreshing, setIsManuallyRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setIsManuallyRefreshing(true);
    try {
      await Promise.all([
        refetchWalletInfo(),
        refetchTransactions(),
        refetchHistory(),
        refetchUserWallets(),
        refetchGuardianWallets(),
        refetchCancelled(),
      ]);
    } finally {
      // Reset after a short delay to show the refresh indicator
      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        setIsManuallyRefreshing(false);
      }, 500);
      mutationTimeoutsRef.current.add(timeoutId);
    }
  }, [refetchWalletInfo, refetchTransactions, refetchHistory, refetchUserWallets, refetchGuardianWallets, refetchCancelled]);

  // Cleanup mutation timeouts on unmount
  useEffect(() => {
    return () => {
      mutationTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      mutationTimeoutsRef.current.clear();
    };
  }, []);

  return {
    // Data
    walletInfo,
    pendingTransactions,
    executedTransactions,
    cancelledTransactions,
    recoveryHistory,
    userWallets,
    guardianWallets,

    // Loading states
    isLoading: isLoadingInfo || isLoadingTransactions || isLoadingHistory || isLoadingCancelled || isLoadingWallets || isLoadingGuardianWallets,
    isLoadingInfo,
    isLoadingTransactions,
    isLoadingHistory,
    isLoadingCancelled,
    isLoadingRecoveryHistory,
    isLoadingWallets,
    isLoadingGuardianWallets,

    // Refreshing states (for visual indicators)
    // Only show refetching when manually refreshing or polling (not during subscription updates)
    isRefetchingWalletInfo: isRefetchingWalletInfo && (isManuallyRefreshing || !isIndexerConnected),
    isRefetchingPending: isRefetchingPending && (isManuallyRefreshing || (!isIndexerConnected && INDEXER_CONFIG.ENABLED)),
    isRefetchingHistory: isRefetchingHistory && isManuallyRefreshing,
    isRefetchingCancelled: isRefetchingCancelled && isManuallyRefreshing,
    isRefetchingRecoveryHistory: isRefetchingRecoveryHistory && isManuallyRefreshing,
    isRefetchingWallets: isRefetchingWallets && isManuallyRefreshing,
    isRefetchingGuardianWallets: isRefetchingGuardianWallets && isManuallyRefreshing,

    // Mutations
    deployWallet: deployWallet.mutate,
    deployWalletAsync: deployWallet.mutateAsync,
    proposeTransaction: proposeTransaction.mutate,
    proposeTransactionAsync: proposeTransaction.mutateAsync,
    approveTransaction: approveTransaction.mutate,
    approveTransactionAsync: approveTransaction.mutateAsync,
    revokeApproval: revokeApproval.mutate,
    revokeApprovalAsync: revokeApproval.mutateAsync,
    executeTransaction: executeTransaction.mutate,
    executeTransactionAsync: executeTransaction.mutateAsync,
    cancelTransaction: cancelTransaction.mutate,
    cancelTransactionAsync: cancelTransaction.mutateAsync,
    addOwner: addOwner.mutate,
    addOwnerAsync: addOwner.mutateAsync,
    removeOwner: removeOwner.mutate,
    removeOwnerAsync: removeOwner.mutateAsync,
    changeThreshold: changeThreshold.mutate,
    changeThresholdAsync: changeThreshold.mutateAsync,
    enableModule: enableModule.mutate,
    enableModuleAsync: enableModule.mutateAsync,
    disableModule: disableModule.mutate,
    disableModuleAsync: disableModule.mutateAsync,
    executeToWhitelist: executeToWhitelist.mutate,
    executeToWhitelistAsync: executeToWhitelist.mutateAsync,
    executeBelowLimit: executeBelowLimit.mutate,
    executeBelowLimitAsync: executeBelowLimit.mutateAsync,

    // Mutation states
    isDeploying: deployWallet.isPending,
    isProposing: proposeTransaction.isPending,
    isApproving: approveTransaction.isPending,
    isRevoking: revokeApproval.isPending,
    isExecuting: executeTransaction.isPending,
    isCancelling: cancelTransaction.isPending,
    isAddingOwner: addOwner.isPending,
    isRemovingOwner: removeOwner.isPending,
    isChangingThreshold: changeThreshold.isPending,
    isExecutingViaWhitelist: executeToWhitelist.isPending,
    isExecutingViaDailyLimit: executeBelowLimit.isPending,

    // Utilities
    refresh,
    refreshTransactions: refetchTransactions,
    refreshHistory: refetchHistory,
    refreshCancelled: refetchCancelled,
    refreshRecoveryHistory: refetchRecoveryHistory,
  };
}
