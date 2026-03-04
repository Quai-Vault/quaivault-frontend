import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWalletStore } from '../store/walletStore';
import { multisigService } from '../services/MultisigService';
import { notificationManager } from '../components/NotificationContainer';
import { CONTRACT_ADDRESSES } from '../config/contracts';
import { INDEXER_CONFIG } from '../config/supabase';
import { indexerService } from '../services/indexer';
import { convertIndexerTransaction, safeGetAddress } from '../services/utils/TransactionConverter';
import { useIndexerConnection } from './useIndexerConnection';
import { useWalletInfo } from './useWalletInfo';
import { usePendingTransactions } from './usePendingTransactions';
import { useTransactionHistory } from './useTransactionHistory';
import { useModuleStatus } from './useModuleStatus';
import type { DeploymentConfig, TransactionData, PendingTransaction } from '../types';
import type { WalletModule, Confirmation } from '../types/database';
import type { WalletSubscriptionCallbacks } from '../services/indexer';
import { formatQuai } from 'quais';
import { canShowBrowserNotifications, sendBrowserNotification } from '../utils/notifications';
import { formatDuration } from '../utils/formatting';
import { getModuleName } from '../utils/transactionDecoder';

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

// Global tracking of notified wallet changes (owners, threshold, timelock)
const lastNotifiedOwners = new LRUMap<string, string>(MAX_TRACKED_WALLETS);
const lastNotifiedThresholds = new LRUMap<string, number>(MAX_TRACKED_WALLETS);
const lastNotifiedDelays = new LRUMap<string, number>(MAX_TRACKED_WALLETS);

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
  lastNotifiedDelays.delete(normalizedAddress);
  lastNotifiedModuleStatus.delete(normalizedAddress);
  notifiedExecutedTxs.delete(normalizedAddress);
  notifiedCancelledTxs.delete(normalizedAddress);
  notifiedReadyTxs.delete(normalizedAddress);
  notifiedProposedTxs.delete(normalizedAddress);

  // notifiedApprovals uses 2-level structure, just delete the wallet entry
  notifiedApprovals.delete(normalizedAddress);
}

export function useMultisig(walletAddress?: string) {
  const queryClient = useQueryClient();
  const { isConnected: isIndexerConnected } = useIndexerConnection();
  const {
    address: connectedAddress,
    setError,
    setLoading,
    setWalletInfo: setWalletInfoInStore,
  } = useWalletStore();

  // ---------------------------------------------------------------------------
  // Composed sub-hooks — queries are delegated to focused, reusable hooks
  // ---------------------------------------------------------------------------
  const {
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
  } = useWalletInfo(walletAddress);

  const {
    pendingTransactions,
    isLoadingTransactions,
    refetchTransactions,
    isRefetchingPending,
  } = usePendingTransactions(walletAddress);

  const {
    executedTransactions,
    cancelledTransactions,
    recoveryHistory,
    isLoadingHistory,
    isLoadingCancelled,
    isLoadingRecoveryHistory,
    refetchHistory,
    refetchCancelled,
    refetchRecoveryHistory,
    isRefetchingHistory,
    isRefetchingCancelled,
    isRefetchingRecoveryHistory,
  } = useTransactionHistory(walletAddress);

  const {
    moduleStatuses,
  } = useModuleStatus(walletAddress);

  // ---------------------------------------------------------------------------
  // Side-effect sync — wallet info to store + threshold cache for subscriptions
  // ---------------------------------------------------------------------------
  const walletThresholdCacheRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (walletInfo && walletAddress) {
      setWalletInfoInStore(walletAddress, walletInfo);
      walletThresholdCacheRef.current.set(walletAddress.toLowerCase(), walletInfo.threshold);
    }
  }, [walletInfo, walletAddress, setWalletInfoInStore]);

  // ---------------------------------------------------------------------------
  // Notification tracking refs (per-instance, cleaned up on unmount)
  // ---------------------------------------------------------------------------
  const prevBalancesRef = useRef<Map<string, string>>(new Map());
  const prevPendingTxsRef = useRef<Map<string, Map<string, PendingTransaction>>>(new Map());
  const prevWalletInfoRef = useRef<Map<string, { owners: string[]; threshold: number; minExecutionDelay?: number }>>(new Map());

  // Track mutation timeouts for cleanup on unmount
  const mutationTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Clear any pending mutation debounce timeouts on unmount to prevent
  // stale query invalidations firing after the component is gone.
  useEffect(() => {
    const timeouts = mutationTimeoutsRef.current;
    return () => { timeouts.forEach(clearTimeout); };
  }, []);

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

  // ---------------------------------------------------------------------------
  // Notification effects — track data changes and alert the user
  // ---------------------------------------------------------------------------

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
        let prevBigInt: bigint, currentBigInt: bigint, lastNotifiedBigInt: bigint | null;
        try {
          prevBigInt = BigInt(prevBalance);
          currentBigInt = BigInt(currentBalance);
          lastNotifiedBigInt = lastNotifiedBalance ? BigInt(lastNotifiedBalance) : null;
        } catch {
          // Invalid balance string — skip notification for this cycle
          prevBalancesRef.current.set(normalizedAddr, currentBalance);
          return;
        }

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

              if (canShowBrowserNotifications()) {
                sendBrowserNotification('Owner Added', {
                  body: `${ownerShort} has been added as a vault owner`,
                  tag: `owner-added-${normalizedAddr}-${owner}`,
                });
              }
            });
          }

          if (removedOwners.length > 0) {
            removedOwners.forEach((owner) => {
              const ownerShort = `${owner.slice(0, 6)}...${owner.slice(-4)}`;
              notificationManager.add({
                message: `👤 Owner removed: ${ownerShort}`,
                type: 'warning',
              });

              if (canShowBrowserNotifications()) {
                sendBrowserNotification('Owner Removed', {
                  body: `${ownerShort} has been removed as a vault owner`,
                  tag: `owner-removed-${normalizedAddr}-${owner}`,
                });
              }
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

        // Track minExecutionDelay changes
        const prevMinDelay = prevInfo.minExecutionDelay ?? 0;
        const currentMinDelay = walletInfo.minExecutionDelay ?? 0;
        const lastNotifiedDelay = lastNotifiedDelays.peek(normalizedAddr);

        if (prevMinDelay !== currentMinDelay && currentMinDelay !== lastNotifiedDelay) {
          const delayLabel = currentMinDelay > 0
            ? `Timelock changed to ${formatDuration(currentMinDelay)}`
            : 'Timelock removed';
          notificationManager.add({
            message: `⏱️ ${delayLabel}`,
            type: 'info',
          });

          if (canShowBrowserNotifications()) {
            sendBrowserNotification('Vault Timelock Changed', {
              body: currentMinDelay > 0
                ? `Minimum execution delay changed to ${formatDuration(currentMinDelay)}`
                : 'Minimum execution delay has been removed',
              tag: `delay-${normalizedAddr}-${currentMinDelay}`,
            });
          }

          lastNotifiedDelays.set(normalizedAddr, currentMinDelay);
        }
      }

      // Update stored wallet info
      prevWalletInfoRef.current.set(normalizedAddr, {
        owners: walletInfo.owners,
        threshold: walletInfo.threshold,
        minExecutionDelay: walletInfo.minExecutionDelay ?? 0,
      });
    }
  }, [walletInfo, walletAddress]);

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

  // ---------------------------------------------------------------------------
  // Real-time subscriptions (indexer WebSocket) — routed through SubscriptionManager
  // for LRU eviction, dedup, and centralized lifecycle management.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!walletAddress || !isIndexerConnected || !INDEXER_CONFIG.ENABLED) return;

    // Track if effect is still active (prevents race conditions on unmount)
    let isActive = true;

    // Helper: patch module status cache directly from payload
    const patchModuleStatus = (module: WalletModule) => {
      if (!isActive) return;
      const configKey = [
        CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE,
      ].find(addr => addr?.toLowerCase() === module.module_address.toLowerCase());
      if (!configKey) {
        queryClient.invalidateQueries({ queryKey: ['moduleStatus', walletAddress] });
        return;
      }
      queryClient.setQueryData<Record<string, boolean>>(
        ['moduleStatus', walletAddress],
        (old = {}) => ({ ...old, [configKey]: module.is_active })
      );
    };

    // Helper: handle confirmation insert/update for approval tracking
    const handleConfirmationInsert = (confirmation: Confirmation) => {
      if (!isActive || !confirmation.is_active) return;
      const cached = queryClient.getQueryData<PendingTransaction[]>(['pendingTransactions', walletAddress]);
      if (!cached?.some(t => t.hash === confirmation.tx_hash)) {
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', walletAddress] });
        return;
      }
      const ownerKey = safeGetAddress(confirmation.owner_address);
      queryClient.setQueryData<PendingTransaction[]>(
        ['pendingTransactions', walletAddress],
        (old = []) => old.map(tx => {
          if (tx.hash !== confirmation.tx_hash) return tx;
          const updatedApprovals = { ...tx.approvals, [ownerKey]: true };
          return { ...tx, approvals: updatedApprovals, numApprovals: Object.values(updatedApprovals).filter(Boolean).length };
        })
      );
    };

    const handleConfirmationUpdate = (confirmation: Confirmation) => {
      if (!isActive) return;
      const ownerKey = safeGetAddress(confirmation.owner_address);
      queryClient.setQueryData<PendingTransaction[]>(
        ['pendingTransactions', walletAddress],
        (old = []) => old.map(tx => {
          if (tx.hash !== confirmation.tx_hash) return tx;
          if (!confirmation.is_active) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [ownerKey]: _, ...remainingApprovals } = tx.approvals;
            return { ...tx, approvals: remainingApprovals, numApprovals: Object.values(remainingApprovals).filter(Boolean).length };
          }
          const updatedApprovals = { ...tx.approvals, [ownerKey]: true };
          return { ...tx, approvals: updatedApprovals, numApprovals: Object.values(updatedApprovals).filter(Boolean).length };
        })
      );
    };

    const callbacks: WalletSubscriptionCallbacks = {
      // --- Transactions ---
      onTransactionInsert: (tx) => {
        if (!isActive) return;
        const threshold = walletThresholdCacheRef.current.get(walletAddress.toLowerCase());
        if (threshold === undefined) {
          queryClient.invalidateQueries({ queryKey: ['pendingTransactions', walletAddress] });
          return;
        }
        const converted = convertIndexerTransaction(tx, threshold, []);
        queryClient.setQueryData<PendingTransaction[]>(
          ['pendingTransactions', walletAddress],
          (old = []) => {
            if (old.some(t => t.hash === converted.hash)) return old;
            return [converted, ...old].slice(0, MAX_CACHE_TRANSACTIONS);
          }
        );
      },
      onTransactionUpdate: (tx) => {
        if (!isActive) return;
        const threshold = walletThresholdCacheRef.current.get(walletAddress.toLowerCase());
        if (threshold === undefined) {
          queryClient.invalidateQueries({ queryKey: ['pendingTransactions', walletAddress] });
          return;
        }
        const cached = queryClient.getQueryData<PendingTransaction[]>(['pendingTransactions', walletAddress]);
        const existingTx = cached?.find(t => t.hash === tx.tx_hash);
        const converted = convertIndexerTransaction(tx, threshold, []);
        const withApprovals = existingTx ? { ...converted, approvals: existingTx.approvals } : converted;

        if (tx.status === 'executed' || tx.status === 'cancelled') {
          queryClient.setQueryData<PendingTransaction[]>(
            ['pendingTransactions', walletAddress],
            (old = []) => old.filter((t) => t.hash !== tx.tx_hash)
          );
          const historyKey = tx.status === 'executed' ? 'executedTransactions' : 'cancelledTransactions';
          queryClient.setQueryData<PendingTransaction[]>(
            [historyKey, walletAddress],
            (old = []) => [withApprovals, ...old].slice(0, MAX_CACHE_TRANSACTIONS)
          );
          if (tx.status === 'executed') {
            queryClient.invalidateQueries({ queryKey: ['walletInfo', walletAddress] });
          }
        } else {
          queryClient.setQueryData<PendingTransaction[]>(
            ['pendingTransactions', walletAddress],
            (old = []) => old.map((t) => (t.hash === tx.tx_hash ? withApprovals : t))
          );
        }
      },

      // --- Confirmations ---
      onConfirmationInsert: handleConfirmationInsert,
      onConfirmationUpdate: handleConfirmationUpdate,

      // --- Deposits ---
      onDepositInsert: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['walletInfo', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['deposits', walletAddress] });
      },

      // --- Wallet modules ---
      onWalletModuleInsert: patchModuleStatus,
      onWalletModuleUpdate: patchModuleStatus,

      // --- Wallet owners ---
      onWalletOwnerInsert: () => {
        if (!isActive) return;
        walletThresholdCacheRef.current.delete(walletAddress.toLowerCase());
        queryClient.invalidateQueries({ queryKey: ['walletInfo', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['owners', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', walletAddress] });
      },
      onWalletOwnerUpdate: () => {
        if (!isActive) return;
        walletThresholdCacheRef.current.delete(walletAddress.toLowerCase());
        queryClient.invalidateQueries({ queryKey: ['walletInfo', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['owners', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', walletAddress] });
      },

      // --- Recovery config ---
      onRecoveryConfigChange: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['recoveryConfig', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['isGuardian', walletAddress] });
      },

      // --- Social recoveries ---
      onSocialRecoveryInsert: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      },
      onSocialRecoveryUpdate: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      },

      // --- Recovery approvals ---
      onRecoveryApprovalInsert: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['recoveryApprovalStatuses', walletAddress] });
      },
      onRecoveryApprovalUpdate: () => {
        if (!isActive) return;
        queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['recoveryApprovalStatuses', walletAddress] });
      },

      // --- Shared handlers ---
      onError: (error) => {
        if (!isActive) return;
        console.error('Subscription error:', error instanceof Error ? error.message : 'Unknown error');
        multisigService.invalidateIndexerCache();
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', walletAddress] });
      },
      onReconnect: () => {
        if (!isActive) return;
        // Refresh all data after reconnection to catch any missed events
        walletThresholdCacheRef.current.delete(walletAddress.toLowerCase());
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['executedTransactions', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['cancelledTransactions', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['walletInfo', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['deposits', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['moduleStatus', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['owners', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['recoveryConfig', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['isGuardian', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['recoveryApprovalStatuses', walletAddress] });
      },
    };

    indexerService.subscriptionManager.activateWallet(walletAddress, callbacks);

    return () => {
      isActive = false;
      indexerService.subscriptionManager.deactivateWallet(walletAddress);
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
        const prevCount = Object.values(prevTx.approvals).filter(Boolean).length || prevTx.numApprovals;
        const curCount = Object.values(tx.approvals).filter(Boolean).length || tx.numApprovals;
        const wasReady = prevCount >= prevTx.threshold;
        const isReady = curCount >= tx.threshold;
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

              if (canShowBrowserNotifications()) {
                sendBrowserNotification('Approval Revoked', {
                  body: `${revokerShort} revoked approval for ${tx.hash.slice(0, 10)}...`,
                  tag: `revoked-${tx.hash}-${revoker}`,
                });
              }
            });
          }
        }
      }
    });

    // Update stored state
    prevPendingTxsRef.current.set(normalizedWallet, currentTxsMap);
  }, [pendingTransactions, walletAddress, connectedAddress]);

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

  // ---------------------------------------------------------------------------
  // Mutations — kept here because they pre-mark notification LRU maps
  // to prevent duplicate notifications from polling effects.
  // For standalone mutation use without notification tracking, see useTransactionActions.
  // ---------------------------------------------------------------------------

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
        tx.data,
        tx.expiration,
        tx.executionDelay,
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
      // Two-phase safety net: the subscription's onInsert should deliver the new tx in real-time,
      // but page navigation can cause a brief gap where the subscription tears down and re-establishes.
      // Phase 1 (4s): early poll — catches fast indexer writes.
      // Phase 2 (10s): late poll — catches slow indexer writes that phase 1 missed.
      // Without phase 2, a stale phase-1 refetch resets the query freshness clock and the next
      // automatic poll won't fire for another 30 seconds (refetchInterval).
      const phase1Id = setTimeout(() => {
        mutationTimeoutsRef.current.delete(phase1Id);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 4000);
      mutationTimeoutsRef.current.add(phase1Id);
      const phase2Id = setTimeout(() => {
        mutationTimeoutsRef.current.delete(phase2Id);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 10000);
      mutationTimeoutsRef.current.add(phase2Id);
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
      // Delay the refetch so the indexer has time to write the confirmation before we read.
      // An immediate invalidation races with the subscription's setQueryData and can overwrite
      // the correct approval count with a stale indexer snapshot.
      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 2000);
      mutationTimeoutsRef.current.add(timeoutId);
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
      // Same delay rationale as approveTransaction — let the subscription update first
      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 2000);
      mutationTimeoutsRef.current.add(timeoutId);
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
      // Notify the executor immediately. The useEffect that tracks executedTransactions changes
      // has a race against the pendingTransactions effect (which clears prevPendingTxsRef),
      // so the wasPending check can be false by the time it runs — pre-mark here to prevent
      // a duplicate if the effect does fire, and show the notification unconditionally.
      const normalizedWallet = variables.walletAddress.toLowerCase();
      const walletExecutedSet = notifiedExecutedTxs.get(normalizedWallet) ?? new Set();
      walletExecutedSet.add(variables.txHash.toLowerCase());
      capSet(walletExecutedSet, MAX_CACHE_TRANSACTIONS);
      notifiedExecutedTxs.set(normalizedWallet, walletExecutedSet);
      notificationManager.add({
        message: `✅ Transaction executed: ${variables.txHash.slice(0, 10)}...${variables.txHash.slice(-6)}`,
        type: 'success',
      });

      // Immediately remove from pending — chain has confirmed execution, this is not optimistic.
      // Delaying the invalidation avoids a race where the indexer hasn't processed the block yet
      // and an immediate refetch would pull back stale "pending" data, re-adding the tx to the list.
      const existingPending = queryClient.getQueryData<PendingTransaction[]>(['pendingTransactions', variables.walletAddress]);
      const executedTx = existingPending?.find(t => t.hash === variables.txHash);
      queryClient.setQueryData<PendingTransaction[]>(
        ['pendingTransactions', variables.walletAddress],
        (old = []) => old.filter(t => t.hash !== variables.txHash)
      );
      if (executedTx) {
        queryClient.setQueryData<PendingTransaction[]>(
          ['executedTransactions', variables.walletAddress],
          (old = []) => [{ ...executedTx, executed: true }, ...old].slice(0, MAX_CACHE_TRANSACTIONS)
        );
      }
      // Delayed safety-net: by the time this runs the indexer should have processed the block.
      // The subscription's onUpdate will also handle this, so this is just a fallback.
      const executeTimeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(executeTimeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['executedTransactions', variables.walletAddress] });
      }, 10000);
      mutationTimeoutsRef.current.add(executeTimeoutId);

      // Immediate invalidations for on-chain storage reads (no event-log lag)
      queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['moduleStatus', variables.walletAddress] });

      // recoveryConfig reads from the indexer DB first (MultisigService.getRecoveryConfig),
      // which can be stale immediately after execution. Invalidate immediately (fast path)
      // and again after a short delay as a safety net for indexer processing lag.
      queryClient.invalidateQueries({ queryKey: ['recoveryConfig', variables.walletAddress] });
      const recoveryConfigRetryId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(recoveryConfigRetryId);
        queryClient.invalidateQueries({ queryKey: ['recoveryConfig', variables.walletAddress] });
      }, 3000);
      mutationTimeoutsRef.current.add(recoveryConfigRetryId);
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
      // Same race as executeTransaction — pre-mark and notify immediately
      const normalizedWallet = variables.walletAddress.toLowerCase();
      const walletCancelledSet = notifiedCancelledTxs.get(normalizedWallet) ?? new Set();
      walletCancelledSet.add(variables.txHash.toLowerCase());
      capSet(walletCancelledSet, MAX_CACHE_TRANSACTIONS);
      notifiedCancelledTxs.set(normalizedWallet, walletCancelledSet);
      notificationManager.add({
        message: `❌ Transaction cancelled: ${variables.txHash.slice(0, 10)}...${variables.txHash.slice(-6)}`,
        type: 'warning',
      });

      // Immediately remove from pending — same rationale as executeTransaction.onSuccess.
      const existingPending = queryClient.getQueryData<PendingTransaction[]>(['pendingTransactions', variables.walletAddress]);
      const cancelledTx = existingPending?.find(t => t.hash === variables.txHash);
      queryClient.setQueryData<PendingTransaction[]>(
        ['pendingTransactions', variables.walletAddress],
        (old = []) => old.filter(t => t.hash !== variables.txHash)
      );
      if (cancelledTx) {
        queryClient.setQueryData<PendingTransaction[]>(
          ['cancelledTransactions', variables.walletAddress],
          (old = []) => [{ ...cancelledTx, cancelled: true }, ...old].slice(0, MAX_CACHE_TRANSACTIONS)
        );
      }
      const cancelTimeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(cancelTimeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['cancelledTransactions', variables.walletAddress] });
      }, 10000);
      mutationTimeoutsRef.current.add(cancelTimeoutId);

      queryClient.invalidateQueries({ queryKey: ['moduleStatus', variables.walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['recoveryConfig', variables.walletAddress] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to cancel transaction');
    },
  });

  // Approve and execute in one call
  const approveAndExecute = useMutation({
    mutationFn: async ({ walletAddress, txHash }: { walletAddress: string; txHash: string }) => {
      return await multisigService.approveAndExecute(walletAddress, txHash);
    },
    onSuccess: (executed, variables) => {
      const normalizedWallet = variables.walletAddress.toLowerCase();
      const txLabel = `${variables.txHash.slice(0, 10)}...${variables.txHash.slice(-6)}`;

      if (executed) {
        // Execution happened — same handling as executeTransaction
        const walletExecutedSet = notifiedExecutedTxs.get(normalizedWallet) ?? new Set();
        walletExecutedSet.add(variables.txHash.toLowerCase());
        capSet(walletExecutedSet, MAX_CACHE_TRANSACTIONS);
        notifiedExecutedTxs.set(normalizedWallet, walletExecutedSet);
        notificationManager.add({
          message: `Transaction approved and executed: ${txLabel}`,
          type: 'success',
        });
        const existingPending = queryClient.getQueryData<PendingTransaction[]>(['pendingTransactions', variables.walletAddress]);
        const executedTx = existingPending?.find(t => t.hash === variables.txHash);
        queryClient.setQueryData<PendingTransaction[]>(
          ['pendingTransactions', variables.walletAddress],
          (old = []) => old.filter(t => t.hash !== variables.txHash)
        );
        if (executedTx) {
          queryClient.setQueryData<PendingTransaction[]>(
            ['executedTransactions', variables.walletAddress],
            (old = []) => [{ ...executedTx, executed: true, status: 'executed' as const }, ...old].slice(0, MAX_CACHE_TRANSACTIONS)
          );
        }
        queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['moduleStatus', variables.walletAddress] });
      } else {
        // Only approved, execution didn't happen (e.g. threshold not actually met on-chain)
        notificationManager.add({
          message: `Transaction approved (execution skipped): ${txLabel}`,
          type: 'info',
        });
        // Update approval in cache like a normal approve
        queryClient.setQueryData<PendingTransaction[]>(
          ['pendingTransactions', variables.walletAddress],
          (old = []) => old.map(t =>
            t.hash === variables.txHash
              ? { ...t, numApprovals: t.numApprovals + 1 }
              : t
          )
        );
      }

      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['executedTransactions', variables.walletAddress] });
      }, 10000);
      mutationTimeoutsRef.current.add(timeoutId);
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to approve and execute transaction');
    },
  });

  // Expire transaction mutation (permissionless)
  const expireTransaction = useMutation({
    mutationFn: async ({ walletAddress, txHash }: { walletAddress: string; txHash: string }) => {
      return await multisigService.expireTransaction(walletAddress, txHash);
    },
    onSuccess: (_, variables) => {
      notificationManager.add({
        message: `Transaction expired: ${variables.txHash.slice(0, 10)}...${variables.txHash.slice(-6)}`,
        type: 'warning',
      });
      queryClient.setQueryData<PendingTransaction[]>(
        ['pendingTransactions', variables.walletAddress],
        (old = []) => old.filter(t => t.hash !== variables.txHash)
      );
      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 4000);
      mutationTimeoutsRef.current.add(timeoutId);
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to expire transaction');
    },
  });

  // Add owner mutation (proposes transaction)
  const addOwner = useMutation({
    mutationFn: async ({ walletAddress, newOwner }: { walletAddress: string; newOwner: string }) => {
      return await multisigService.owner.addOwner(walletAddress, newOwner);
    },
    onSuccess: (txHash, variables) => {
      // Pre-mark to prevent duplicate "new transaction proposed" notification from polling
      if (txHash) {
        const normalizedWallet = variables.walletAddress.toLowerCase();
        const walletProposedSet = notifiedProposedTxs.get(normalizedWallet) ?? new Set();
        walletProposedSet.add(txHash.toLowerCase());
        capSet(walletProposedSet, MAX_CACHE_TRANSACTIONS);
        notifiedProposedTxs.set(normalizedWallet, walletProposedSet);
      }
      notificationManager.add({
        message: `Add owner proposal created! Hash: ${txHash?.slice(0, 10)}...${txHash?.slice(-6)}`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
      // Delay so the indexer has time to index the transaction before we poll
      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 4000);
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
    onSuccess: (txHash, variables) => {
      if (txHash) {
        const normalizedWallet = variables.walletAddress.toLowerCase();
        const walletProposedSet = notifiedProposedTxs.get(normalizedWallet) ?? new Set();
        walletProposedSet.add(txHash.toLowerCase());
        capSet(walletProposedSet, MAX_CACHE_TRANSACTIONS);
        notifiedProposedTxs.set(normalizedWallet, walletProposedSet);
      }
      notificationManager.add({
        message: `Remove owner proposal created! Hash: ${txHash?.slice(0, 10)}...${txHash?.slice(-6)}`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 4000);
      mutationTimeoutsRef.current.add(timeoutId);
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
    onSuccess: (txHash, variables) => {
      if (txHash) {
        const normalizedWallet = variables.walletAddress.toLowerCase();
        const walletProposedSet = notifiedProposedTxs.get(normalizedWallet) ?? new Set();
        walletProposedSet.add(txHash.toLowerCase());
        capSet(walletProposedSet, MAX_CACHE_TRANSACTIONS);
        notifiedProposedTxs.set(normalizedWallet, walletProposedSet);
      }
      notificationManager.add({
        message: `Change threshold proposal created! Hash: ${txHash?.slice(0, 10)}...${txHash?.slice(-6)}`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 4000);
      mutationTimeoutsRef.current.add(timeoutId);
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to change threshold');
    },
  });

  // Set min execution delay mutation (proposes transaction)
  const setMinExecutionDelay = useMutation({
    mutationFn: async ({ walletAddress, delaySeconds }: { walletAddress: string; delaySeconds: number }) => {
      return await multisigService.proposeSetMinExecutionDelay(walletAddress, delaySeconds);
    },
    onSuccess: (txHash, variables) => {
      if (txHash) {
        const normalizedWallet = variables.walletAddress.toLowerCase();
        const walletProposedSet = notifiedProposedTxs.get(normalizedWallet) ?? new Set();
        walletProposedSet.add(txHash.toLowerCase());
        capSet(walletProposedSet, MAX_CACHE_TRANSACTIONS);
        notifiedProposedTxs.set(normalizedWallet, walletProposedSet);
      }
      notificationManager.add({
        message: `Change timelock proposal created! Hash: ${txHash?.slice(0, 10)}...${txHash?.slice(-6)}`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['walletInfo', variables.walletAddress] });
      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 4000);
      mutationTimeoutsRef.current.add(timeoutId);
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to change timelock');
    },
  });

  // Enable module mutation (proposes transaction)
  const enableModule = useMutation({
    mutationFn: async ({ walletAddress, moduleAddress }: { walletAddress: string; moduleAddress: string }) => {
      return await multisigService.owner.enableModule(walletAddress, moduleAddress);
    },
    onSuccess: (txHash, variables) => {
      if (txHash) {
        const normalizedWallet = variables.walletAddress.toLowerCase();
        const walletProposedSet = notifiedProposedTxs.get(normalizedWallet) ?? new Set();
        walletProposedSet.add(txHash.toLowerCase());
        capSet(walletProposedSet, MAX_CACHE_TRANSACTIONS);
        notifiedProposedTxs.set(normalizedWallet, walletProposedSet);
      }
      notificationManager.add({
        message: `Enable module proposal created! Hash: ${txHash?.slice(0, 10)}...${txHash?.slice(-6)}`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['moduleStatus', variables.walletAddress] });
      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 4000);
      mutationTimeoutsRef.current.add(timeoutId);
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
    onSuccess: (txHash, variables) => {
      if (txHash) {
        const normalizedWallet = variables.walletAddress.toLowerCase();
        const walletProposedSet = notifiedProposedTxs.get(normalizedWallet) ?? new Set();
        walletProposedSet.add(txHash.toLowerCase());
        capSet(walletProposedSet, MAX_CACHE_TRANSACTIONS);
        notifiedProposedTxs.set(normalizedWallet, walletProposedSet);
      }
      notificationManager.add({
        message: `Disable module proposal created! Hash: ${txHash?.slice(0, 10)}...${txHash?.slice(-6)}`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['moduleStatus', variables.walletAddress] });
      const timeoutId = setTimeout(() => {
        mutationTimeoutsRef.current.delete(timeoutId);
        queryClient.invalidateQueries({ queryKey: ['pendingTransactions', variables.walletAddress] });
      }, 4000);
      mutationTimeoutsRef.current.add(timeoutId);
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'Failed to disable module');
    },
  });

  // ---------------------------------------------------------------------------
  // Manual refresh
  // ---------------------------------------------------------------------------
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
    walletInfoError,
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
    approveAndExecuteAsync: approveAndExecute.mutateAsync,
    expireTransactionAsync: expireTransaction.mutateAsync,
    addOwner: addOwner.mutate,
    addOwnerAsync: addOwner.mutateAsync,
    removeOwner: removeOwner.mutate,
    removeOwnerAsync: removeOwner.mutateAsync,
    changeThreshold: changeThreshold.mutate,
    changeThresholdAsync: changeThreshold.mutateAsync,
    setMinExecutionDelay: setMinExecutionDelay.mutate,
    setMinExecutionDelayAsync: setMinExecutionDelay.mutateAsync,
    enableModule: enableModule.mutate,
    enableModuleAsync: enableModule.mutateAsync,
    disableModule: disableModule.mutate,
    disableModuleAsync: disableModule.mutateAsync,

    // Mutation states
    isDeploying: deployWallet.isPending,
    isProposing: proposeTransaction.isPending,
    isApproving: approveTransaction.isPending,
    isRevoking: revokeApproval.isPending,
    isExecuting: executeTransaction.isPending,
    isCancelling: cancelTransaction.isPending,
    isApproveAndExecuting: approveAndExecute.isPending,
    isExpiring: expireTransaction.isPending,
    isAddingOwner: addOwner.isPending,
    isRemovingOwner: removeOwner.isPending,
    isChangingThreshold: changeThreshold.isPending,
    isSettingMinExecutionDelay: setMinExecutionDelay.isPending,

    // Utilities
    refresh,
    refreshTransactions: refetchTransactions,
    refreshHistory: refetchHistory,
    refreshCancelled: refetchCancelled,
    refreshRecoveryHistory: refetchRecoveryHistory,
  };
}
