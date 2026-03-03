import { INDEXER_CONFIG } from '../../config/supabase';
import { IndexerSubscriptionService, type SubscriptionCallbacks } from './IndexerSubscriptionService';
import type {
  IndexerTransaction,
  Confirmation,
  Deposit,
  WalletModule,
  WalletOwner,
  SocialRecovery,
  RecoveryApproval,
  TokenTransfer,
} from '../../types/database';

export interface WalletSubscriptionCallbacks {
  // Transaction subscriptions
  onTransactionInsert?: (tx: IndexerTransaction) => void;
  onTransactionUpdate?: (tx: IndexerTransaction) => void;
  // Confirmation subscriptions
  onConfirmationInsert?: (confirmation: Confirmation) => void;
  onConfirmationUpdate?: (confirmation: Confirmation) => void;
  // Deposit subscriptions
  onDepositInsert?: (deposit: Deposit) => void;
  // Wallet module subscriptions
  onWalletModuleInsert?: (module: WalletModule) => void;
  onWalletModuleUpdate?: (module: WalletModule) => void;
  // Wallet owner subscriptions
  onWalletOwnerInsert?: (owner: WalletOwner) => void;
  onWalletOwnerUpdate?: (owner: WalletOwner) => void;
  // Social recovery config subscriptions (social_recovery_configs + social_recovery_guardians)
  onRecoveryConfigChange?: () => void;
  // Social recovery subscriptions
  onSocialRecoveryInsert?: (recovery: SocialRecovery) => void;
  onSocialRecoveryUpdate?: (recovery: SocialRecovery) => void;
  // Recovery approval subscriptions
  onRecoveryApprovalInsert?: (approval: RecoveryApproval) => void;
  onRecoveryApprovalUpdate?: (approval: RecoveryApproval) => void;
  // Token transfer subscriptions
  onTokenTransferInsert?: (transfer: TokenTransfer) => void;
  // Error handling
  onError?: (error: Error) => void;
  /** Called when any subscription channel reconnects after a disconnection */
  onReconnect?: () => void;
  /** Called when this wallet is evicted due to subscription limit */
  onEvicted?: (walletAddress: string) => void;
}

/**
 * Manages subscription limits by tracking active wallet views
 * and dynamically subscribing/unsubscribing based on what's visible
 */
export class SubscriptionManager {
  private subscriptionService: IndexerSubscriptionService;
  private activeWallets: Set<string> = new Set();
  private unsubscribeFns: Map<string, (() => void)[]> = new Map();
  private evictionCallbacks: Map<string, ((walletAddress: string) => void)> = new Map();

  constructor(subscriptionService: IndexerSubscriptionService) {
    this.subscriptionService = subscriptionService;
  }

  /**
   * Called when user views a wallet - subscribes if under limit
   */
  activateWallet(walletAddress: string, callbacks: WalletSubscriptionCallbacks): void {
    const normalizedAddress = walletAddress.toLowerCase();

    if (this.activeWallets.has(normalizedAddress)) return;

    // Check if we're at the limit
    if (this.activeWallets.size >= INDEXER_CONFIG.MAX_SUBSCRIPTIONS) {
      // Remove oldest subscription (FIFO)
      const oldestResult = this.activeWallets.values().next();
      if (!oldestResult.done && oldestResult.value) {
        const evictedWallet = oldestResult.value;
        // Notify the evicted wallet's callback before deactivating
        const evictionCallback = this.evictionCallbacks.get(evictedWallet);
        if (evictionCallback) {
          evictionCallback(evictedWallet);
        }
        this.deactivateWallet(evictedWallet);
      }
    }

    const unsubscribers: (() => void)[] = [];

    // Helper to build per-channel callbacks with shared error/reconnect handling
    const withShared = <T>(channelCallbacks: SubscriptionCallbacks<T>): SubscriptionCallbacks<T> => ({
      ...channelCallbacks,
      onError: callbacks.onError,
      onReconnect: callbacks.onReconnect,
    });

    try {
      // Subscribe to transactions
      if (callbacks.onTransactionInsert || callbacks.onTransactionUpdate) {
        unsubscribers.push(
          this.subscriptionService.subscribeToTransactions(normalizedAddress, withShared({
            onInsert: callbacks.onTransactionInsert,
            onUpdate: callbacks.onTransactionUpdate,
          }))
        );
      }

      // Subscribe to confirmations
      if (callbacks.onConfirmationInsert || callbacks.onConfirmationUpdate) {
        unsubscribers.push(
          this.subscriptionService.subscribeToConfirmations(normalizedAddress, withShared({
            onInsert: callbacks.onConfirmationInsert,
            onUpdate: callbacks.onConfirmationUpdate,
          }))
        );
      }

      // Subscribe to deposits
      if (callbacks.onDepositInsert) {
        unsubscribers.push(
          this.subscriptionService.subscribeToDeposits(normalizedAddress, withShared({
            onInsert: callbacks.onDepositInsert,
          }))
        );
      }

      // Subscribe to wallet modules
      if (callbacks.onWalletModuleInsert || callbacks.onWalletModuleUpdate) {
        unsubscribers.push(
          this.subscriptionService.subscribeToWalletModules(normalizedAddress, withShared({
            onInsert: callbacks.onWalletModuleInsert,
            onUpdate: callbacks.onWalletModuleUpdate,
          }))
        );
      }

      // Subscribe to wallet owners
      if (callbacks.onWalletOwnerInsert || callbacks.onWalletOwnerUpdate) {
        unsubscribers.push(
          this.subscriptionService.subscribeToWalletOwners(normalizedAddress, withShared({
            onInsert: callbacks.onWalletOwnerInsert,
            onUpdate: callbacks.onWalletOwnerUpdate,
          }))
        );
      }

      // Subscribe to recovery config changes (social_recovery_configs + social_recovery_guardians)
      if (callbacks.onRecoveryConfigChange) {
        const configChangeCallback = callbacks.onRecoveryConfigChange;
        unsubscribers.push(
          this.subscriptionService.subscribeToRecoveryConfig(normalizedAddress, {
            onInsert: () => configChangeCallback(),
            onUpdate: () => configChangeCallback(),
            onReconnect: callbacks.onReconnect || (() => configChangeCallback()),
            onError: callbacks.onError,
          })
        );
      }

      // Subscribe to social recoveries
      if (callbacks.onSocialRecoveryInsert || callbacks.onSocialRecoveryUpdate) {
        unsubscribers.push(
          this.subscriptionService.subscribeToSocialRecoveries(normalizedAddress, withShared({
            onInsert: callbacks.onSocialRecoveryInsert,
            onUpdate: callbacks.onSocialRecoveryUpdate,
          }))
        );
      }

      // Subscribe to recovery approvals
      if (callbacks.onRecoveryApprovalInsert || callbacks.onRecoveryApprovalUpdate) {
        unsubscribers.push(
          this.subscriptionService.subscribeToRecoveryApprovals(normalizedAddress, withShared({
            onInsert: callbacks.onRecoveryApprovalInsert,
            onUpdate: callbacks.onRecoveryApprovalUpdate,
          }))
        );
      }

      // Subscribe to token transfers
      if (callbacks.onTokenTransferInsert) {
        unsubscribers.push(
          this.subscriptionService.subscribeToTokenTransfers(normalizedAddress, withShared({
            onInsert: callbacks.onTokenTransferInsert,
          }))
        );
      }
    } catch (error) {
      // Cleanup any partial subscriptions on failure
      unsubscribers.forEach((unsub) => {
        try { unsub(); } catch { /* ignore cleanup errors */ }
      });
      callbacks.onError?.(error instanceof Error ? error : new Error('Subscription setup failed'));
      return;
    }

    this.activeWallets.add(normalizedAddress);
    this.unsubscribeFns.set(normalizedAddress, unsubscribers);
    // Store eviction callback if provided
    if (callbacks.onEvicted) {
      this.evictionCallbacks.set(normalizedAddress, callbacks.onEvicted);
    }
  }

  /**
   * Called when user navigates away from a wallet
   */
  deactivateWallet(walletAddress: string): void {
    const normalizedAddress = walletAddress.toLowerCase();
    const unsubscribers = this.unsubscribeFns.get(normalizedAddress);

    if (unsubscribers) {
      // Remove from tracking maps BEFORE calling unsubscribe to prevent
      // callbacks from being processed during async teardown (M22)
      this.unsubscribeFns.delete(normalizedAddress);
      this.evictionCallbacks.delete(normalizedAddress);
      this.activeWallets.delete(normalizedAddress);

      unsubscribers.forEach((unsub) => {
        try {
          unsub();
        } catch (error) {
          console.warn(`Failed to unsubscribe wallet ${normalizedAddress}:`,
            error instanceof Error ? error.message : 'Unknown error');
        }
      });
    }
  }

  /**
   * Check if a wallet is currently subscribed
   */
  isWalletActive(walletAddress: string): boolean {
    return this.activeWallets.has(walletAddress.toLowerCase());
  }

  /**
   * Get count of active wallet subscriptions
   */
  getActiveWalletCount(): number {
    return this.activeWallets.size;
  }

  /**
   * Cleanup all subscriptions (on logout or unmount)
   */
  cleanup(): void {
    this.unsubscribeFns.forEach((unsubscribers) => {
      unsubscribers.forEach((unsub) => {
        try {
          unsub();
        } catch (error) {
          console.warn('Failed to unsubscribe during cleanup:',
            error instanceof Error ? error.message : 'Unknown error');
        }
      });
    });
    this.unsubscribeFns.clear();
    this.evictionCallbacks.clear();
    this.activeWallets.clear();
  }
}
