import { supabase } from '../../config/supabase';
import {
  SocialRecoveryConfigSchema,
  SocialRecoverySchema,
  RecoveryApprovalSchema,
  WalletDelegatecallTargetSchema,
  WalletModuleInventorySchema,
  ModuleExecutionSchema,
  type SocialRecovery,
  type RecoveryApproval,
  type WalletDelegatecallTarget,
  type WalletModuleInventory,
  type ModuleExecution,
} from '../../types/database';
import { validateAddress, validateTxHash } from '../utils/TransactionErrorHandler';
import type { PaginationOptions, PaginatedResult } from './IndexerTransactionService';

export interface ModuleStatus {
  address: string;
  isActive: boolean;
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
  expiration: number;
  status: string;
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
   * Get the indexer's stable lifecycle envelope for every module observed on a
   * vault. This is history and freshness data; callers must use getModules()
   * on the live vault as the authority for security-sensitive actions.
   */
  async getWalletModuleInventory(walletAddress: string): Promise<WalletModuleInventory> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client.rpc('get_wallet_module_inventory', {
      p_wallet_address: validatedWallet.toLowerCase(),
    });

    if (error) {
      throw new Error(`Module inventory query failed: ${error.message}`);
    }
    if (!data) {
      throw new Error('Module inventory query returned no envelope');
    }

    const inventory = WalletModuleInventorySchema.parse(data);
    if (inventory.wallet.toLowerCase() !== validatedWallet.toLowerCase()) {
      throw new Error('Module inventory returned a different wallet');
    }
    return inventory;
  }

  /** Fetch a bounded, deterministic module activity feed for a vault. */
  async getModuleExecutions(
    walletAddress: string,
    moduleAddress?: string,
    limit = 20
  ): Promise<ModuleExecution[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

    let query = client
      .from('module_executions')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase());

    if (moduleAddress) {
      query = query.eq('module_address', validateAddress(moduleAddress).toLowerCase());
    }

    const { data, error } = await query
      .order('executed_at_block', { ascending: false })
      .order('log_index', { ascending: false, nullsFirst: false })
      .limit(boundedLimit);

    if (error) {
      throw new Error(`Module execution query failed: ${error.message}`);
    }

    return (data ?? []).map((row: unknown) => ModuleExecutionSchema.parse(row));
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
   * Get active delegatecall targets for a wallet
   */
  async getDelegatecallTargets(walletAddress: string): Promise<WalletDelegatecallTarget[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('wallet_delegatecall_targets')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('is_active', true);

    if (error) {
      if (this.isTableNotFoundError(error)) {
        throw new Error('wallet_delegatecall_targets table not available');
      }
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    return (data ?? []).map((row: unknown) => WalletDelegatecallTargetSchema.parse(row));
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
        .eq('is_active', true)
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
        expiration: recovery.expiration ?? 0,
        status: recovery.status,
      };
    });
  }

  /**
   * Get social recovery history (all statuses) for a wallet, counted server-side.
   */
  async getRecoveryHistory(
    walletAddress: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<SocialRecovery>> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;

    const { data, error, count } = await client
      .from('social_recoveries')
      .select('*', { count: 'exact' })
      .eq('wallet_address', validatedWallet.toLowerCase())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      if (this.isTableNotFoundError(error)) {
        throw new Error('social_recoveries table not available');
      }
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    const recoveries = (data ?? []).map((row: unknown) => SocialRecoverySchema.parse(row));
    const total = count ?? 0;

    return {
      data: recoveries,
      total,
      hasMore: offset + recoveries.length < total,
    };
  }

  /**
   * Get approvals for a specific recovery operation
   */
  async getRecoveryApprovals(walletAddress: string, recoveryHash: string): Promise<RecoveryApproval[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    const validatedHash = validateTxHash(recoveryHash);

    const { data, error } = await client
      .from('social_recovery_approvals')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('recovery_hash', validatedHash)
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
