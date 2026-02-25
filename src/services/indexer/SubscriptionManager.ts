import { INDEXER_CONFIG } from '../../config/supabase';
import { IndexerSubscriptionService, type SubscriptionCallbacks } from './IndexerSubscriptionService';
import type {
  IndexerTransaction,
  Deposit,
  DailyLimitState,
  WhitelistEntry,
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
  // Deposit subscriptions
  onDepositInsert?: (deposit: Deposit) => void;
  // Daily limit state subscriptions
  onDailyLimitStateInsert?: (state: DailyLimitState) => void;
  onDailyLimitStateUpdate?: (state: DailyLimitState) => void;
  // Whitelist entry subscriptions
  onWhitelistEntryInsert?: (entry: WhitelistEntry) => void;
  onWhitelistEntryUpdate?: (entry: WhitelistEntry) => void;
  onWhitelistEntryDelete?: (entry: WhitelistEntry) => void;
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

    // Subscribe to transactions
    if (callbacks.onTransactionInsert || callbacks.onTransactionUpdate) {
      const unsubTx = this.subscriptionService.subscribeToTransactions(normalizedAddress, {
        onInsert: callbacks.onTransactionInsert,
        onUpdate: callbacks.onTransactionUpdate,
        onError: callbacks.onError,
      });
      unsubscribers.push(unsubTx);
    }

    // Subscribe to deposits
    if (callbacks.onDepositInsert) {
      const unsubDeposit = this.subscriptionService.subscribeToDeposits(normalizedAddress, {
        onInsert: callbacks.onDepositInsert,
        onError: callbacks.onError,
      });
      unsubscribers.push(unsubDeposit);
    }

    // Subscribe to daily limit state
    if (callbacks.onDailyLimitStateInsert || callbacks.onDailyLimitStateUpdate) {
      const unsubDailyLimit = this.subscriptionService.subscribeToDailyLimitState(normalizedAddress, {
        onInsert: callbacks.onDailyLimitStateInsert,
        onUpdate: callbacks.onDailyLimitStateUpdate,
        onError: callbacks.onError,
      });
      unsubscribers.push(unsubDailyLimit);
    }

    // Subscribe to whitelist entries
    if (callbacks.onWhitelistEntryInsert || callbacks.onWhitelistEntryUpdate || callbacks.onWhitelistEntryDelete) {
      const unsubWhitelist = this.subscriptionService.subscribeToWhitelistEntries(normalizedAddress, {
        onInsert: callbacks.onWhitelistEntryInsert,
        onUpdate: callbacks.onWhitelistEntryUpdate,
        onDelete: callbacks.onWhitelistEntryDelete,
        onError: callbacks.onError,
      });
      unsubscribers.push(unsubWhitelist);
    }

    // Subscribe to wallet modules
    if (callbacks.onWalletModuleInsert || callbacks.onWalletModuleUpdate) {
      const unsubModules = this.subscriptionService.subscribeToWalletModules(normalizedAddress, {
        onInsert: callbacks.onWalletModuleInsert,
        onUpdate: callbacks.onWalletModuleUpdate,
        onError: callbacks.onError,
      });
      unsubscribers.push(unsubModules);
    }

    // Subscribe to wallet owners
    if (callbacks.onWalletOwnerInsert || callbacks.onWalletOwnerUpdate) {
      const unsubOwners = this.subscriptionService.subscribeToWalletOwners(normalizedAddress, {
        onInsert: callbacks.onWalletOwnerInsert,
        onUpdate: callbacks.onWalletOwnerUpdate,
        onError: callbacks.onError,
      });
      unsubscribers.push(unsubOwners);
    }

    // Subscribe to recovery config changes (social_recovery_configs + social_recovery_guardians)
    if (callbacks.onRecoveryConfigChange) {
      const configChangeCallback = callbacks.onRecoveryConfigChange;
      const unsubRecoveryConfig = this.subscriptionService.subscribeToRecoveryConfig(normalizedAddress, {
        onInsert: () => configChangeCallback(),
        onUpdate: () => configChangeCallback(),
        onReconnect: () => configChangeCallback(),
        onError: callbacks.onError,
      });
      unsubscribers.push(unsubRecoveryConfig);
    }

    // Subscribe to social recoveries
    if (callbacks.onSocialRecoveryInsert || callbacks.onSocialRecoveryUpdate) {
      const unsubRecoveries = this.subscriptionService.subscribeToSocialRecoveries(normalizedAddress, {
        onInsert: callbacks.onSocialRecoveryInsert,
        onUpdate: callbacks.onSocialRecoveryUpdate,
        onError: callbacks.onError,
      });
      unsubscribers.push(unsubRecoveries);
    }

    // Subscribe to recovery approvals
    if (callbacks.onRecoveryApprovalInsert || callbacks.onRecoveryApprovalUpdate) {
      const unsubApprovals = this.subscriptionService.subscribeToRecoveryApprovals(normalizedAddress, {
        onInsert: callbacks.onRecoveryApprovalInsert,
        onUpdate: callbacks.onRecoveryApprovalUpdate,
        onError: callbacks.onError,
      });
      unsubscribers.push(unsubApprovals);
    }

    // Subscribe to token transfers
    if (callbacks.onTokenTransferInsert) {
      const unsubTokenTransfers = this.subscriptionService.subscribeToTokenTransfers(normalizedAddress, {
        onInsert: callbacks.onTokenTransferInsert,
        onError: callbacks.onError,
      });
      unsubscribers.push(unsubTokenTransfers);
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
      unsubscribers.forEach((unsub) => {
        try {
          unsub();
        } catch (error) {
          console.warn(`Failed to unsubscribe wallet ${normalizedAddress}:`,
            error instanceof Error ? error.message : 'Unknown error');
        }
      });
      this.unsubscribeFns.delete(normalizedAddress);
      this.evictionCallbacks.delete(normalizedAddress);
      this.activeWallets.delete(normalizedAddress);
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
