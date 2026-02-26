import { supabase, INDEXER_CONFIG } from '../../config/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  TransactionSchema,
  ConfirmationSchema,
  DepositSchema,
  DailyLimitStateSchema,
  WhitelistEntrySchema,
  WalletModuleSchema,
  WalletOwnerSchema,
  SocialRecoverySchema,
  RecoveryApprovalSchema,
  TokenTransferSchema,
  IndexerStateSchema,
  ModuleTransactionSchema,
  type IndexerTransaction,
  type Deposit,
  type Confirmation,
  type DailyLimitState,
  type WhitelistEntry,
  type WalletModule,
  type WalletOwner,
  type SocialRecovery,
  type RecoveryApproval,
  type TokenTransfer,
  type IndexerState,
  type ModuleTransaction,
} from '../../types/database';

export interface SubscriptionCallbacks<T> {
  onInsert?: (record: T) => void;
  onUpdate?: (record: T) => void;
  onDelete?: (record: T) => void;
  onError?: (error: Error) => void;
  /** Called after successful reconnection - use to refresh data that may have been missed */
  onReconnect?: () => void;
}

export class IndexerSubscriptionService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private isReconnecting: Map<string, boolean> = new Map();
  private reconnectTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private maxReconnectAttempts = 5;
  private reconnectDelayMs = 1000;

  private ensureClient() {
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }
    return supabase;
  }

  subscribeToTransactions(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<IndexerTransaction>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `transactions:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'transactions',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = TransactionSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onInsert?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid transaction payload: ${parsed.error.message}`));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'transactions',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = TransactionSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onUpdate?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid transaction payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // If this was a reconnection, notify callback to refresh data
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    // Return unsubscribe function
    return () => {
      // Cancel any pending reconnect timeout
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  subscribeToConfirmations(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<Confirmation>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `confirmations:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'confirmations',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = ConfirmationSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onInsert?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid confirmation payload: ${parsed.error.message}`));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'confirmations',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = ConfirmationSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onUpdate?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid confirmation payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // If this was a reconnection, notify callback to refresh data
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      // Cancel any pending reconnect timeout
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  subscribeToDeposits(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<Deposit>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `deposits:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'deposits',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = DepositSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onInsert?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid deposit payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // If this was a reconnection, notify callback to refresh data
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      // Cancel any pending reconnect timeout
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  subscribeToDailyLimitState(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<DailyLimitState>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `daily_limit_state:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'daily_limit_state',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = DailyLimitStateSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onInsert?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid daily limit state payload: ${parsed.error.message}`));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'daily_limit_state',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = DailyLimitStateSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onUpdate?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid daily limit state payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  subscribeToWhitelistEntries(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<WhitelistEntry>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `whitelist_entries:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'whitelist_entries',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = WhitelistEntrySchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onInsert?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid whitelist entry payload: ${parsed.error.message}`));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'whitelist_entries',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = WhitelistEntrySchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onUpdate?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid whitelist entry payload: ${parsed.error.message}`));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'whitelist_entries',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = WhitelistEntrySchema.safeParse(payload.old);
            if (parsed.success) {
              callbacks.onDelete?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid whitelist entry payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  subscribeToWalletModules(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<WalletModule>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `wallet_modules:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'wallet_modules',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = WalletModuleSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onInsert?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid wallet module payload: ${parsed.error.message}`));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'wallet_modules',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = WalletModuleSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onUpdate?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid wallet module payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  subscribeToWalletOwners(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<WalletOwner>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `wallet_owners:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'wallet_owners',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = WalletOwnerSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onInsert?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid wallet owner payload: ${parsed.error.message}`));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'wallet_owners',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = WalletOwnerSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onUpdate?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid wallet owner payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  subscribeToSocialRecoveries(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<SocialRecovery>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `social_recoveries:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'social_recoveries',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = SocialRecoverySchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onInsert?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid social recovery payload: ${parsed.error.message}`));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'social_recoveries',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = SocialRecoverySchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onUpdate?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid social recovery payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  /**
   * Subscribe to social recovery configuration changes
   * Watches both social_recovery_configs and social_recovery_guardians tables
   */
  subscribeToRecoveryConfig(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<unknown>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `recovery_config:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'social_recovery_configs',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            callbacks.onInsert?.(payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'social_recovery_configs',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            callbacks.onUpdate?.(payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'social_recovery_guardians',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            callbacks.onInsert?.(payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'social_recovery_guardians',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            callbacks.onUpdate?.(payload.new);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  subscribeToRecoveryApprovals(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<RecoveryApproval>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `recovery_approvals:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'social_recovery_approvals',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = RecoveryApprovalSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onInsert?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid recovery approval payload: ${parsed.error.message}`));
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'social_recovery_approvals',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = RecoveryApprovalSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onUpdate?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid recovery approval payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  subscribeToTokenTransfers(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<TokenTransfer>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `token_transfers:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'token_transfers',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = TokenTransferSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onInsert?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid token transfer payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  subscribeToIndexerState(
    callbacks: SubscriptionCallbacks<IndexerState>
  ): () => void {
    const client = this.ensureClient();
    const channelName = 'indexer_state:main';

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'indexer_state',
          },
          (payload) => {
            const parsed = IndexerStateSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onUpdate?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid indexer state payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  subscribeToModuleTransactions(
    walletAddress: string,
    callbacks: SubscriptionCallbacks<ModuleTransaction>
  ): () => void {
    const client = this.ensureClient();
    const channelName = `module_transactions:${walletAddress.toLowerCase()}`;

    const subscribe = () => {
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: INDEXER_CONFIG.SCHEMA,
            table: 'module_transactions',
            filter: `wallet_address=eq.${walletAddress.toLowerCase()}`,
          },
          (payload) => {
            const parsed = ModuleTransactionSchema.safeParse(payload.new);
            if (parsed.success) {
              callbacks.onInsert?.(parsed.data);
            } else {
              callbacks.onError?.(new Error(`Invalid module transaction payload: ${parsed.error.message}`));
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (this.isReconnecting.get(channelName)) {
              this.isReconnecting.set(channelName, false);
              callbacks.onReconnect?.();
            }
            this.reconnectAttempts.set(channelName, 0);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.handleReconnect(channelName, subscribe, callbacks.onError);
          } else if (status === 'CLOSED') {
            this.channels.delete(channelName);
            this.reconnectAttempts.delete(channelName);
            this.isReconnecting.delete(channelName);
          }
        });

      this.channels.set(channelName, channel);
    };

    subscribe();

    return () => {
      const timeout = this.reconnectTimeouts.get(channelName);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(channelName);
      }

      const channel = this.channels.get(channelName);
      if (channel) {
        this.ensureClient().removeChannel(channel);
        this.channels.delete(channelName);
        this.reconnectAttempts.delete(channelName);
        this.isReconnecting.delete(channelName);
      }
    };
  }

  private handleReconnect(
    channelName: string,
    subscribe: () => void,
    onError?: (error: Error) => void
  ): void {
    // Guard: skip if a reconnect is already scheduled for this channel
    if (this.reconnectTimeouts.has(channelName)) {
      return;
    }

    const attempts = this.reconnectAttempts.get(channelName) ?? 0;

    if (attempts >= this.maxReconnectAttempts) {
      // Clean up dead channel and all tracking state
      const deadChannel = this.channels.get(channelName);
      if (deadChannel && supabase) {
        supabase.removeChannel(deadChannel);
      }
      this.channels.delete(channelName);
      this.reconnectAttempts.delete(channelName);
      this.isReconnecting.delete(channelName);
      onError?.(new Error(`Failed to reconnect after ${attempts} attempts`));
      return;
    }

    const delay = this.reconnectDelayMs * Math.pow(2, attempts);
    this.reconnectAttempts.set(channelName, attempts + 1);
    // Mark as reconnecting so onReconnect callback is called after successful subscription
    this.isReconnecting.set(channelName, true);

    const timeoutId = setTimeout(() => {
      this.reconnectTimeouts.delete(channelName);
      const oldChannel = this.channels.get(channelName);
      if (oldChannel && supabase) {
        supabase.removeChannel(oldChannel);
      }
      subscribe();
    }, delay);

    this.reconnectTimeouts.set(channelName, timeoutId);
  }

  // Get count of active subscriptions
  getActiveSubscriptionCount(): number {
    return this.channels.size;
  }

  // Unsubscribe from all channels (cleanup)
  unsubscribeAll(): void {
    // Clear all pending reconnect timeouts
    this.reconnectTimeouts.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.reconnectTimeouts.clear();

    this.channels.forEach((channel) => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    });
    this.channels.clear();
    this.reconnectAttempts.clear();
    this.isReconnecting.clear();
  }
}
