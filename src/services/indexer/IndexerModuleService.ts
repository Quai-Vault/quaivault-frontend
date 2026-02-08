import { supabase } from '../../config/supabase';
import {
  DailyLimitStateSchema,
  WhitelistEntrySchema,
  SocialRecoveryConfigSchema,
  SocialRecoverySchema,
  RecoveryApprovalSchema,
  type DailyLimitState,
  type WhitelistEntry,
  type SocialRecoveryConfig,
  type SocialRecovery,
  type RecoveryApproval,
} from '../../types/database';
import { validateAddress } from '../utils/TransactionErrorHandler';

export interface ModuleStatus {
  address: string;
  isActive: boolean;
}

export interface DailyLimitConfig {
  limit: string;
  spent: string;
  lastResetDay: string;
}

export interface RecoveryConfig {
  guardians: string[];
  threshold: number;
  recoveryPeriod: number;
}

export interface PendingRecovery {
  recoveryHash: string;
  newOwners: string[];
  newThreshold: number;
  approvalCount: number;
  requiredThreshold: number;
  executionTime: number;
  status: string;
}

export interface ModuleTransactionRecord {
  moduleType: string;
  toAddress: string;
  value: string;
  remainingLimit: string | null;
  executedAtBlock: number;
  executedAtTx: string;
  createdAt: string;
}

export class IndexerModuleService {
  private ensureClient() {
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }
    return supabase;
  }

  /**
   * Check if an error indicates table doesn't exist (triggers fallback to blockchain)
   */
  private isTableNotFoundError(error: { code?: string; message?: string }): boolean {
    return (
      error.code === '42P01' ||
      error.message?.includes('406') ||
      error.message?.includes('relation') ||
      error.message?.includes('does not exist')
    ) ?? false;
  }

  /**
   * Get enabled/disabled status for all modules on a wallet
   */
  async getModuleStatuses(walletAddress: string): Promise<Record<string, boolean>> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('wallet_modules')
      .select('module_address, is_active')
      .eq('wallet_address', validatedWallet.toLowerCase());

    if (error) {
      if (this.isTableNotFoundError(error)) {
        throw new Error('wallet_modules table not available');
      }
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    const statuses: Record<string, boolean> = {};
    (data ?? []).forEach((row: { module_address: string; is_active: boolean }) => {
      statuses[row.module_address.toLowerCase()] = row.is_active;
    });

    return statuses;
  }

  /**
   * Check if a specific module is enabled
   */
  async isModuleEnabled(walletAddress: string, moduleAddress: string): Promise<boolean> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    const validatedModule = validateAddress(moduleAddress);

    // Don't use .single() - just check if any matching record exists
    const { data, error } = await client
      .from('wallet_modules')
      .select('is_active')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('module_address', validatedModule.toLowerCase())
      .limit(1);

    if (error) {
      if (this.isTableNotFoundError(error)) {
        throw new Error('wallet_modules table not available');
      }
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    // No matching record means module not enabled
    if (!data || data.length === 0) {
      return false;
    }

    return data[0]?.is_active ?? false;
  }

  /**
   * Get daily limit configuration from daily_limit_state table
   */
  async getDailyLimitConfig(walletAddress: string): Promise<DailyLimitConfig | null> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('daily_limit_state')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      if (this.isTableNotFoundError(error)) {
        throw new Error('daily_limit_state table not available');
      }
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    const validated = DailyLimitStateSchema.parse(data);
    return {
      limit: validated.daily_limit,
      spent: validated.spent_today,
      lastResetDay: validated.last_reset_day,
    };
  }

  /**
   * Get whitelist entries from whitelist_entries table
   */
  async getWhitelistEntries(walletAddress: string): Promise<Array<{
    address: string;
    limit: string | null;
  }>> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('whitelist_entries')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('is_active', true);

    if (error) {
      if (this.isTableNotFoundError(error)) {
        throw new Error('whitelist_entries table not available');
      }
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    return (data ?? []).map((entry: unknown) => {
      const validated = WhitelistEntrySchema.parse(entry);
      return {
        address: validated.whitelisted_address,
        limit: validated.limit_amount,
      };
    });
  }

  /**
   * Get social recovery configuration from social_recovery_configs + guardians tables
   */
  async getRecoveryConfig(walletAddress: string): Promise<RecoveryConfig | null> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const [configResult, guardiansResult] = await Promise.all([
      client
        .from('social_recovery_configs')
        .select('*')
        .eq('wallet_address', validatedWallet.toLowerCase())
        .single(),
      client
        .from('social_recovery_guardians')
        .select('guardian_address')
        .eq('wallet_address', validatedWallet.toLowerCase())
        .eq('is_active', true),
    ]);

    if (configResult.error) {
      if (configResult.error.code === 'PGRST116') return null;
      if (this.isTableNotFoundError(configResult.error)) {
        throw new Error('social_recovery_configs table not available');
      }
      throw new Error(`Indexer query failed: ${configResult.error.message}`);
    }

    // Check guardians query error (config may exist but guardians table may fail)
    if (guardiansResult.error) {
      if (this.isTableNotFoundError(guardiansResult.error)) {
        throw new Error('social_recovery_guardians table not available');
      }
      console.warn('Guardians query failed, falling back to blockchain:', guardiansResult.error.message);
      return null;
    }

    const config = SocialRecoveryConfigSchema.parse(configResult.data);
    const guardians = (guardiansResult.data ?? []).map(
      (g: { guardian_address: string }) => g.guardian_address
    );

    return {
      guardians,
      threshold: config.threshold,
      recoveryPeriod: config.recovery_period,
    };
  }

  /**
   * Get pending social recoveries for a wallet
   */
  async getPendingRecoveries(walletAddress: string): Promise<PendingRecovery[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('social_recoveries')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('status', 'pending');

    if (error) {
      if (this.isTableNotFoundError(error)) {
        throw new Error('social_recoveries table not available');
      }
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    return (data ?? []).map((row: unknown) => {
      const recovery = SocialRecoverySchema.parse(row);
      return {
        recoveryHash: recovery.recovery_hash,
        newOwners: recovery.new_owners,
        newThreshold: recovery.new_threshold,
        approvalCount: recovery.approval_count,
        requiredThreshold: recovery.required_threshold,
        executionTime: recovery.execution_time,
        status: recovery.status,
      };
    });
  }

  /**
   * Get module transaction history (whitelist/daily limit bypass transactions)
   */
  async getModuleTransactions(
    walletAddress: string,
    moduleType?: 'whitelist' | 'daily_limit'
  ): Promise<ModuleTransactionRecord[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    let query = client
      .from('module_transactions')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(100);

    if (moduleType) {
      query = query.eq('module_type', moduleType);
    }

    const { data, error } = await query;

    if (error) {
      if (this.isTableNotFoundError(error)) {
        throw new Error('module_transactions table not available');
      }
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    return (data ?? []).map((tx: {
      module_type: string;
      to_address: string;
      value: string;
      remaining_limit: string | null;
      executed_at_block: number;
      executed_at_tx: string;
      created_at: string;
    }) => ({
      moduleType: tx.module_type,
      toAddress: tx.to_address,
      value: tx.value,
      remainingLimit: tx.remaining_limit,
      executedAtBlock: tx.executed_at_block,
      executedAtTx: tx.executed_at_tx,
      createdAt: tx.created_at,
    }));
  }

  /**
   * Get social recovery history (all statuses) for a wallet
   */
  async getRecoveryHistory(walletAddress: string): Promise<SocialRecovery[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('social_recoveries')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      if (this.isTableNotFoundError(error)) {
        throw new Error('social_recoveries table not available');
      }
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    return (data ?? []).map((row: unknown) => SocialRecoverySchema.parse(row));
  }

  /**
   * Get approvals for a specific recovery operation
   */
  async getRecoveryApprovals(walletAddress: string, recoveryHash: string): Promise<RecoveryApproval[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('social_recovery_approvals')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('recovery_hash', recoveryHash)
      .order('created_at', { ascending: true });

    if (error) {
      if (this.isTableNotFoundError(error)) {
        throw new Error('social_recovery_approvals table not available');
      }
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    return (data ?? []).map((row: unknown) => RecoveryApprovalSchema.parse(row));
  }
}
