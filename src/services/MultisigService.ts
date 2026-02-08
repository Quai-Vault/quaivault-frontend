import { getAddress } from 'quais';
import type { Provider, Signer } from '../types';
import type { WalletInfo, Transaction, PendingTransaction, DeploymentConfig } from '../types';

// Import specialized services
import { WalletService } from './core/WalletService';
import { TransactionService } from './core/TransactionService';
import { OwnerService } from './core/OwnerService';
import { WhitelistModuleService } from './modules/WhitelistModuleService';
import { DailyLimitModuleService } from './modules/DailyLimitModuleService';
import { SocialRecoveryModuleService } from './modules/SocialRecoveryModuleService';

// Import indexer service for faster reads
import { indexerService } from './indexer';
import { convertIndexerTransaction } from './utils/TransactionConverter';
import { INDEXER_CONFIG } from '../config/supabase';
import { validateAddress, validateTxHash } from './utils/TransactionErrorHandler';
import type { SocialRecovery, RecoveryApproval } from '../types/database';

// Re-export types from modules
export type { RecoveryConfig, Recovery, PendingRecovery } from './modules/SocialRecoveryModuleService';

/**
 * MultisigService - Facade for multisig wallet operations
 *
 * This class provides two usage patterns:
 *
 * 1. **Indexer-first reads** - Use methods directly on multisigService for
 *    reads that benefit from faster indexer responses with blockchain fallback:
 *    ```typescript
 *    const info = await multisigService.getWalletInfo(address);
 *    const pending = await multisigService.getPendingTransactions(address);
 *    ```
 *
 * 2. **Direct service access** - For writes and operations that don't need
 *    indexer optimization, access the underlying services directly:
 *    ```typescript
 *    await multisigService.transaction.approveTransaction(address, hash);
 *    await multisigService.owner.addOwner(address, newOwner);
 *    await multisigService.wallet.deployWallet(config);
 *    ```
 */
export class MultisigService {
  // Specialized services - exposed for direct access
  public readonly wallet: WalletService;
  public readonly transaction: TransactionService;
  public readonly owner: OwnerService;
  public readonly whitelist: WhitelistModuleService;
  public readonly dailyLimit: DailyLimitModuleService;
  public readonly socialRecovery: SocialRecoveryModuleService;

  // Indexer availability cache
  private indexerAvailableCache: boolean | null = null;
  private indexerCheckTimestamp = 0;
  private indexerCheckPromise: Promise<boolean> | null = null;

  constructor(provider?: Provider) {
    this.wallet = new WalletService(provider);
    this.transaction = new TransactionService(provider);
    this.owner = new OwnerService(provider, this.transaction);
    this.whitelist = new WhitelistModuleService(provider, this.transaction);
    this.dailyLimit = new DailyLimitModuleService(provider, this.transaction);
    this.socialRecovery = new SocialRecoveryModuleService(provider, this.transaction);
  }

  /**
   * Check if the indexer is available (cached for performance)
   */
  private async isIndexerAvailable(): Promise<boolean> {
    if (!INDEXER_CONFIG.ENABLED) {
      return false;
    }

    const now = Date.now();
    if (this.indexerAvailableCache !== null && now - this.indexerCheckTimestamp < INDEXER_CONFIG.HEALTH_CACHE_MS) {
      return this.indexerAvailableCache;
    }

    // Deduplicate concurrent calls — reuse in-flight promise
    if (this.indexerCheckPromise) {
      return this.indexerCheckPromise;
    }

    this.indexerCheckPromise = (async () => {
      try {
        this.indexerAvailableCache = await indexerService.isAvailable();
        this.indexerCheckTimestamp = Date.now();
        return this.indexerAvailableCache;
      } catch {
        this.indexerAvailableCache = false;
        this.indexerCheckTimestamp = Date.now();
        return false;
      } finally {
        this.indexerCheckPromise = null;
      }
    })();

    return this.indexerCheckPromise;
  }

  /**
   * Invalidate the indexer health cache
   * Call this when subscription errors occur to trigger immediate re-check
   */
  invalidateIndexerCache(): void {
    this.indexerAvailableCache = null;
    this.indexerCheckTimestamp = 0;
  }

  /**
   * Set signer for signing transactions
   */
  setSigner(signer: Signer | null): void {
    this.wallet.setSigner(signer);
    this.transaction.setSigner(signer);
    this.owner.setSigner(signer);
    this.whitelist.setSigner(signer);
    this.dailyLimit.setSigner(signer);
    this.socialRecovery.setSigner(signer);
  }

  /**
   * Deploy a new multisig wallet
   * @param config Deployment configuration (owners and threshold)
   * @param onProgress Optional progress callback for deployment steps
   * @returns Promise resolving to the deployed wallet address
   */
  async deployWallet(
    config: DeploymentConfig,
    onProgress?: (progress: {
      step: 'mining' | 'deploying' | 'deploying_waiting' | 'success';
      txHash?: string;
      walletAddress?: string;
      expectedAddress?: string;
      miningAttempts?: number;
      message?: string;
    }) => void
  ): Promise<string> {
    return this.wallet.deployWallet(config, onProgress);
  }

  // ============ Indexer-First Wallet Methods ============
  // For direct wallet operations (deploy, verify), use: multisigService.wallet.method()

  async getWalletInfo(walletAddress: string): Promise<WalletInfo> {
    // Validate and checksum address (Supabase services handle lowercase internally)
    const checksummedAddress = validateAddress(walletAddress);
    const indexerAvailable = await this.isIndexerAvailable();

    // Try indexer first for faster response
    if (indexerAvailable) {
      try {
        // Indexer services convert to lowercase internally for queries
        const [wallet, owners] = await Promise.all([
          indexerService.wallet.getWalletDetails(walletAddress),
          indexerService.wallet.getWalletOwners(walletAddress),
        ]);

        if (wallet) {
          // Balance comes from blockchain - use checksummed address for RPC
          const balance = await this.wallet.getBalance(checksummedAddress);

          // Return checksummed addresses for display and blockchain compatibility
          return {
            address: checksummedAddress,
            owners: owners.map((o) => getAddress(o)),
            threshold: wallet.threshold,
            balance: balance.toString(),
          };
        }
      } catch {
        // Silently fall back to blockchain
      }
    }

    // Fallback to blockchain - use checksummed address
    return this.wallet.getWalletInfo(checksummedAddress);
  }

  async getWalletsForOwner(ownerAddress: string): Promise<string[]> {
    const indexerAvailable = await this.isIndexerAvailable();

    // Try indexer first for faster response
    if (indexerAvailable) {
      try {
        const wallets = await indexerService.wallet.getWalletsForOwner(ownerAddress);
        // Return checksummed addresses for display and blockchain compatibility
        return wallets.map((w) => getAddress(w.address));
      } catch {
        // Silently fall back to blockchain
      }
    }

    // Fallback to blockchain
    return this.wallet.getWalletsForOwner(ownerAddress);
  }

  async getWalletsForGuardian(guardianAddress: string): Promise<string[]> {
    const indexerAvailable = await this.isIndexerAvailable();

    // Guardian wallets are only available via indexer (social recovery is indexed only)
    if (indexerAvailable) {
      try {
        const wallets = await indexerService.wallet.getWalletsForGuardian(guardianAddress);
        // Return checksummed addresses for display and blockchain compatibility
        return wallets.map((w) => getAddress(w.address));
      } catch {
        // Return empty array if indexer unavailable or query fails
        return [];
      }
    }

    // No blockchain fallback - guardian relationships are only tracked in indexer
    return [];
  }

  async isOwner(walletAddress: string, address: string): Promise<boolean> {
    // Try indexer first for faster response
    if (await this.isIndexerAvailable()) {
      try {
        const owners = await indexerService.wallet.getWalletOwners(walletAddress);
        const normalizedAddress = address.toLowerCase();
        return owners.some((o) => o.toLowerCase() === normalizedAddress);
      } catch {
        // Silently fall back to blockchain
      }
    }

    // Fallback to blockchain - use checksummed addresses for RPC calls
    return this.wallet.isOwner(getAddress(walletAddress), getAddress(address));
  }

  async isModuleEnabled(walletAddress: string, moduleAddress: string): Promise<boolean> {
    // Try indexer first
    if (await this.isIndexerAvailable()) {
      try {
        return await indexerService.module.isModuleEnabled(walletAddress, moduleAddress);
      } catch (error) {
        // Only log if it's not the expected "table not available" error
        const errorMessage = error instanceof Error ? error.message : '';
        if (!errorMessage.includes('table not available')) {
          console.warn('Indexer query failed, falling back to blockchain:', errorMessage || 'Unknown error');
        }
      }
    }

    // Use checksummed addresses for RPC calls
    return this.wallet.isModuleEnabled(getAddress(walletAddress), moduleAddress);
  }

  // ============ Transaction Service Methods ============

  /**
   * Propose a new multisig transaction
   *
   * @param walletAddress - Address of the multisig wallet
   * @param to - Destination address for the transaction
   * @param value - Amount of QUAI to send (in wei)
   * @param data - Encoded transaction data (use TransactionBuilderService to construct)
   * @returns Transaction hash that can be used to approve/execute the transaction
   * @throws {Error} If user rejects the transaction or if validation fails
   *
   * @example
   * ```typescript
   * // Propose a simple transfer
   * const txHash = await multisigService.proposeTransaction(
   *   walletAddress,
   *   recipientAddress,
   *   ethers.parseEther("1.0"), // 1 QUAI
   *   "0x" // empty data for simple transfer
   * );
   * ```
   */
  async proposeTransaction(
    walletAddress: string,
    to: string,
    value: bigint,
    data: string
  ): Promise<string> {
    const validatedWallet = validateAddress(walletAddress);
    const validatedTo = validateAddress(to);
    return this.transaction.proposeTransaction(validatedWallet, validatedTo, value, data);
  }

  /**
   * Approve a pending multisig transaction
   *
   * @param walletAddress - Address of the multisig wallet
   * @param txHash - Transaction hash to approve
   * @throws {Error} If transaction doesn't exist, is already executed, or user rejects
   *
   * @example
   * ```typescript
   * await multisigService.approveTransaction(walletAddress, txHash);
   * // Transaction is now approved by current signer
   * ```
   */
  async approveTransaction(walletAddress: string, txHash: string): Promise<void> {
    const validatedWallet = validateAddress(walletAddress);
    const validatedHash = validateTxHash(txHash);
    return this.transaction.approveTransaction(validatedWallet, validatedHash);
  }

  /**
   * Revoke approval for a pending transaction
   *
   * @param walletAddress - Address of the multisig wallet
   * @param txHash - Transaction hash to revoke approval for
   * @throws {Error} If transaction doesn't exist, is already executed, or wasn't approved by caller
   */
  async revokeApproval(walletAddress: string, txHash: string): Promise<void> {
    const validatedWallet = validateAddress(walletAddress);
    const validatedHash = validateTxHash(txHash);
    return this.transaction.revokeApproval(validatedWallet, validatedHash);
  }

  /**
   * Cancel a pending transaction (proposer can cancel immediately, others need threshold approvals)
   *
   * @param walletAddress - Address of the multisig wallet
   * @param txHash - Transaction hash to cancel
   * @throws {Error} If transaction doesn't exist, is already executed, or caller lacks permission
   */
  async cancelTransaction(walletAddress: string, txHash: string): Promise<void> {
    const validatedWallet = validateAddress(walletAddress);
    const validatedHash = validateTxHash(txHash);
    return this.transaction.cancelTransaction(validatedWallet, validatedHash);
  }

  /**
   * Execute a transaction after threshold approvals are met
   *
   * @param walletAddress - Address of the multisig wallet
   * @param txHash - Transaction hash to execute
   * @throws {Error} If threshold not met, transaction already executed, or execution fails
   *
   * @example
   * ```typescript
   * const tx = await multisigService.getTransaction(walletAddress, txHash);
   * if (tx.numApprovals >= threshold) {
   *   await multisigService.executeTransaction(walletAddress, txHash);
   * }
   * ```
   */
  async executeTransaction(walletAddress: string, txHash: string): Promise<void> {
    const validatedWallet = validateAddress(walletAddress);
    const validatedHash = validateTxHash(txHash);
    return this.transaction.executeTransaction(validatedWallet, validatedHash);
  }

  async getTransaction(walletAddress: string, txHash: string): Promise<Transaction> {
    // This returns the raw Transaction struct - always use blockchain for consistency
    return this.transaction.getTransaction(walletAddress, txHash);
  }

  async getTransactionByHash(walletAddress: string, txHash: string): Promise<PendingTransaction | null> {
    const validatedWallet = validateAddress(walletAddress);
    const validatedHash = validateTxHash(txHash);

    // Try indexer first for faster response
    if (await this.isIndexerAvailable()) {
      try {
        const [wallet, tx] = await Promise.all([
          indexerService.wallet.getWalletDetails(validatedWallet),
          indexerService.transaction.getTransactionByHash(validatedWallet, validatedHash),
        ]);

        if (tx && wallet) {
          const confirmations = await indexerService.transaction.getActiveConfirmations(
            validatedWallet,
            validatedHash
          );
          return convertIndexerTransaction(tx, wallet.threshold, confirmations);
        }
        return null;
      } catch {
        // Silently fall back to blockchain
      }
    }

    // Fallback to blockchain
    return this.transaction.getTransactionByHash(validatedWallet, validatedHash);
  }

  async getPendingTransactions(walletAddress: string): Promise<PendingTransaction[]> {
    const validatedWallet = validateAddress(walletAddress);

    // Try indexer first for faster response
    if (await this.isIndexerAvailable()) {
      try {
        const [wallet, txs] = await Promise.all([
          indexerService.wallet.getWalletDetails(validatedWallet),
          indexerService.transaction.getPendingTransactions(validatedWallet),
        ]);

        if (!wallet) {
          throw new Error('Wallet not found in indexer');
        }

        // Batch fetch all confirmations in a single query (prevents N+1)
        const txHashes = txs.map((tx) => tx.tx_hash);
        const confirmationsMap = await indexerService.transaction.getActiveConfirmationsBatch(
          validatedWallet,
          txHashes
        );

        // Convert each transaction with its confirmations
        const converted = txs.map((tx) => {
          const confirmations = confirmationsMap.get(tx.tx_hash) ?? [];
          return convertIndexerTransaction(tx, wallet.threshold, confirmations);
        });

        return converted;
      } catch {
        // Silently fall back to blockchain
      }
    }

    return this.transaction.getPendingTransactions(validatedWallet);
  }

  async getExecutedTransactions(walletAddress: string): Promise<PendingTransaction[]> {
    return this.getTransactionsByStatus(walletAddress, 'executed');
  }

  async getCancelledTransactions(walletAddress: string): Promise<PendingTransaction[]> {
    return this.getTransactionsByStatus(walletAddress, 'cancelled');
  }

  private async getTransactionsByStatus(
    walletAddress: string,
    status: 'executed' | 'cancelled'
  ): Promise<PendingTransaction[]> {
    const validatedWallet = validateAddress(walletAddress);

    if (await this.isIndexerAvailable()) {
      try {
        const [wallet, result] = await Promise.all([
          indexerService.wallet.getWalletDetails(validatedWallet),
          indexerService.transaction.getTransactionHistory(validatedWallet, { limit: 50 }),
        ]);

        if (!wallet) {
          throw new Error('Wallet not found in indexer');
        }

        const filteredTxs = result.data.filter((tx) => tx.status === status);

        const txHashes = filteredTxs.map((tx) => tx.tx_hash);
        const confirmationsMap = await indexerService.transaction.getActiveConfirmationsBatch(
          validatedWallet,
          txHashes
        );

        const multisigTxs = filteredTxs.map((tx) => {
          const confirmations = confirmationsMap.get(tx.tx_hash) ?? [];
          return convertIndexerTransaction(tx, wallet.threshold, confirmations);
        });

        // For executed status, also include module bypass transactions (whitelist/daily limit)
        if (status === 'executed') {
          try {
            const moduleTxs = await indexerService.module.getModuleTransactions(validatedWallet);
            const convertedModuleTxs: PendingTransaction[] = moduleTxs.map((mtx) => ({
              hash: mtx.executedAtTx,
              to: mtx.toAddress,
              value: mtx.value,
              data: '0x',
              numApprovals: 0,
              threshold: 0,
              executed: true,
              cancelled: false,
              timestamp: Math.floor(new Date(mtx.createdAt).getTime() / 1000),
              proposer: '',
              approvals: {},
              transactionType: mtx.moduleType === 'whitelist' ? 'whitelist_execution' : 'daily_limit_execution',
              decodedParams: null,
            }));

            // Merge and sort by timestamp descending
            return [...multisigTxs, ...convertedModuleTxs].sort((a, b) => b.timestamp - a.timestamp);
          } catch {
            // module_transactions table may not exist - return multisig txs only
          }
        }

        return multisigTxs;
      } catch {
        // Silently fall back to blockchain
      }
    }

    return status === 'executed'
      ? this.transaction.getExecutedTransactions(validatedWallet)
      : this.transaction.getCancelledTransactions(validatedWallet);
  }

  // ============ Indexer-First Whitelist Methods ============
  // For owner/module operations, use: multisigService.owner.method()

  /**
   * Propose adding an address to the whitelist (requires multisig approval)
   * @param walletAddress Address of the multisig wallet
   * @param address Address to add to whitelist
   * @param limit Optional spending limit for this address (defaults to 0 = unlimited)
   * @returns Transaction hash for the multisig proposal
   */
  async proposeAddToWhitelist(
    walletAddress: string,
    address: string,
    limit: bigint = 0n
  ): Promise<string> {
    return this.whitelist.proposeAddToWhitelist(walletAddress, address, limit);
  }

  /**
   * Propose removing an address from the whitelist (requires multisig approval)
   * @param walletAddress Address of the multisig wallet
   * @param address Address to remove from whitelist
   * @returns Transaction hash for the multisig proposal
   */
  async proposeRemoveFromWhitelist(walletAddress: string, address: string): Promise<string> {
    return this.whitelist.proposeRemoveFromWhitelist(walletAddress, address);
  }

  async isWhitelisted(walletAddress: string, address: string): Promise<boolean> {
    // Try indexer first for faster response
    if (await this.isIndexerAvailable()) {
      try {
        const entries = await indexerService.module.getWhitelistEntries(walletAddress);
        const normalizedAddress = address.toLowerCase();
        return entries.some((e) => e.address.toLowerCase() === normalizedAddress);
      } catch {
        // Silently fall back to blockchain
      }
    }

    // Fallback to blockchain
    return this.whitelist.isWhitelisted(walletAddress, address);
  }

  async getWhitelistLimit(walletAddress: string, address: string): Promise<bigint> {
    // Try indexer first for faster response
    if (await this.isIndexerAvailable()) {
      try {
        const entries = await indexerService.module.getWhitelistEntries(walletAddress);
        const normalizedAddress = address.toLowerCase();
        const entry = entries.find((e) => e.address.toLowerCase() === normalizedAddress);
        if (entry) {
          return entry.limit ? BigInt(entry.limit) : 0n;
        }
        return 0n; // Not whitelisted
      } catch {
        // Silently fall back to blockchain
      }
    }

    // Fallback to blockchain
    return this.whitelist.getWhitelistLimit(walletAddress, address);
  }

  async getWhitelistedAddresses(walletAddress: string): Promise<Array<{ address: string; limit: bigint }>> {
    // Try indexer first for faster response
    if (await this.isIndexerAvailable()) {
      try {
        const entries = await indexerService.module.getWhitelistEntries(walletAddress);
        return entries.map((e) => ({
          address: e.address,
          limit: e.limit ? BigInt(e.limit) : 0n,
        }));
      } catch {
        // Silently fall back to blockchain
      }
    }

    // Fallback to blockchain
    return this.whitelist.getWhitelistedAddresses(walletAddress);
  }

  /**
   * Check if a transaction can bypass multisig approval via whitelist module
   * @param walletAddress Address of the multisig wallet
   * @param to Destination address
   * @param value Amount to transfer in wei
   * @returns Object with canExecute flag and optional reason if cannot execute
   */
  async canExecuteViaWhitelist(
    walletAddress: string,
    to: string,
    value: bigint
  ): Promise<{ canExecute: boolean; reason?: string }> {
    return this.whitelist.canExecuteViaWhitelist(walletAddress, to, value);
  }

  // ============ Indexer-First Daily Limit Methods ============

  /**
   * Propose setting the daily spending limit (requires multisig approval)
   * @param walletAddress Address of the multisig wallet
   * @param limit Daily spending limit in wei
   * @returns Transaction hash for the multisig proposal
   */
  async proposeSetDailyLimit(walletAddress: string, limit: bigint): Promise<string> {
    return this.dailyLimit.proposeSetDailyLimit(walletAddress, limit);
  }

  /**
   * Propose resetting the daily limit (requires multisig approval)
   * @param walletAddress Address of the multisig wallet
   * @returns Transaction hash for the multisig proposal
   */
  async proposeResetDailyLimit(walletAddress: string): Promise<string> {
    return this.dailyLimit.proposeResetDailyLimit(walletAddress);
  }

  async getDailyLimit(walletAddress: string): Promise<{ limit: bigint; spent: bigint; lastReset: bigint }> {
    // Try indexer first for faster response
    if (await this.isIndexerAvailable()) {
      try {
        const config = await indexerService.module.getDailyLimitConfig(walletAddress);
        if (config) {
          // lastResetDay is a DATE string (e.g. "2026-02-06") from Supabase
          // Convert to Unix timestamp for consistency with the contract's uint256
          const lastResetTimestamp = config.lastResetDay
            ? BigInt(Math.floor(new Date(config.lastResetDay).getTime() / 1000))
            : 0n;
          return {
            limit: BigInt(config.limit),
            spent: BigInt(config.spent),
            lastReset: lastResetTimestamp,
          };
        }
      } catch (error) {
        console.warn('Indexer getDailyLimit failed, falling back to blockchain:', error instanceof Error ? error.message : error);
      }
    }

    // Fallback to blockchain
    return this.dailyLimit.getDailyLimit(walletAddress);
  }

  /**
   * Check if a transaction can bypass multisig approval via daily limit module
   * @param walletAddress Address of the multisig wallet
   * @param value Amount to transfer in wei
   * @returns Object with canExecute flag and optional reason if cannot execute
   */
  async canExecuteViaDailyLimit(
    walletAddress: string,
    value: bigint
  ): Promise<{ canExecute: boolean; reason?: string }> {
    return this.dailyLimit.canExecuteViaDailyLimit(walletAddress, value);
  }

  /**
   * Get remaining daily limit that can still be spent today
   * @param walletAddress Address of the multisig wallet
   * @returns Remaining limit in wei
   */
  async getRemainingLimit(walletAddress: string): Promise<bigint> {
    return this.dailyLimit.getRemainingLimit(walletAddress);
  }

  /**
   * Get time until the daily limit resets
   * @param walletAddress Address of the multisig wallet
   * @returns Time in seconds until reset
   */
  async getTimeUntilReset(walletAddress: string): Promise<bigint> {
    return this.dailyLimit.getTimeUntilReset(walletAddress);
  }

  // ============ Indexer-First Social Recovery Methods ============

  /**
   * Propose setting up recovery configuration (requires multisig approval)
   * @param walletAddress Address of the multisig wallet
   * @param guardians Array of guardian addresses
   * @param threshold Number of guardian approvals required
   * @param recoveryPeriodDays Recovery period in days (minimum 1)
   * @returns Transaction hash for the multisig proposal
   */
  async proposeSetupRecovery(
    walletAddress: string,
    guardians: string[],
    threshold: number,
    recoveryPeriodDays: number
  ): Promise<string> {
    return this.socialRecovery.proposeSetupRecovery(walletAddress, guardians, threshold, recoveryPeriodDays);
  }

  /**
   * Initiate recovery process (guardians only)
   * @param walletAddress Address of the multisig wallet
   * @param newOwners Array of new owner addresses
   * @param newThreshold New threshold value
   * @returns Recovery hash
   */
  async initiateRecovery(
    walletAddress: string,
    newOwners: string[],
    newThreshold: number
  ): Promise<string> {
    return this.socialRecovery.initiateRecovery(walletAddress, newOwners, newThreshold);
  }

  /**
   * Approve a recovery (guardians only)
   * @param walletAddress Address of the multisig wallet
   * @param recoveryHash Hash of the recovery to approve
   */
  async approveRecovery(walletAddress: string, recoveryHash: string): Promise<void> {
    return this.socialRecovery.approveRecovery(walletAddress, recoveryHash);
  }

  /**
   * Execute recovery after threshold is met and time delay has passed
   * @param walletAddress Address of the multisig wallet
   * @param recoveryHash Hash of the recovery to execute
   */
  async executeRecovery(walletAddress: string, recoveryHash: string): Promise<void> {
    return this.socialRecovery.executeRecovery(walletAddress, recoveryHash);
  }

  /**
   * Cancel a recovery (owners only)
   * @param walletAddress Address of the multisig wallet
   * @param recoveryHash Hash of the recovery to cancel
   */
  async cancelRecovery(walletAddress: string, recoveryHash: string): Promise<void> {
    return this.socialRecovery.cancelRecovery(walletAddress, recoveryHash);
  }

  /**
   * Revoke recovery approval (guardians only)
   * @param walletAddress Address of the multisig wallet
   * @param recoveryHash Hash of the recovery
   */
  async revokeRecoveryApproval(walletAddress: string, recoveryHash: string): Promise<void> {
    return this.socialRecovery.revokeRecoveryApproval(walletAddress, recoveryHash);
  }

  async getRecoveryConfig(walletAddress: string): Promise<{
    guardians: string[];
    threshold: number;
    recoveryPeriod: number;
  }> {
    // Try indexer first for faster response
    if (await this.isIndexerAvailable()) {
      try {
        const config = await indexerService.module.getRecoveryConfig(walletAddress);
        if (config && config.guardians.length > 0) {
          return {
            guardians: config.guardians,
            threshold: Number(config.threshold),
            recoveryPeriod: Number(config.recoveryPeriod),
          };
        }
        // No config or empty guardians (indexer race condition) - fall through to blockchain
      } catch (error) {
        // Silently fall back to blockchain - table may not exist in indexer schema
        const errorMessage = error instanceof Error ? error.message : '';
        if (!errorMessage.includes('table not available')) {
          console.warn('Indexer recovery config failed, falling back to blockchain:', errorMessage || 'Unknown error');
        }
      }
    }

    // Fallback to blockchain - convert bigint to number for React Query serialization
    const blockchainConfig = await this.socialRecovery.getRecoveryConfig(walletAddress);
    return {
      guardians: blockchainConfig.guardians,
      threshold: Number(blockchainConfig.threshold),
      recoveryPeriod: Number(blockchainConfig.recoveryPeriod),
    };
  }

  async isGuardian(walletAddress: string, address: string): Promise<boolean> {
    // Try indexer first for faster response
    if (await this.isIndexerAvailable()) {
      try {
        const config = await indexerService.module.getRecoveryConfig(walletAddress);
        if (config && config.guardians.length > 0) {
          const normalizedAddress = address.toLowerCase();
          return config.guardians.some((g) => g.toLowerCase() === normalizedAddress);
        }
        // No config or empty guardians - fall through to blockchain
      } catch {
        // Silently fall back to blockchain - table may not exist
      }
    }

    // Fallback to blockchain
    return this.socialRecovery.isGuardian(walletAddress, address);
  }

  async getPendingRecoveries(walletAddress: string): Promise<Array<{
    recoveryHash: string;
    newOwners: string[];
    newThreshold: number;
    approvalCount: number;
    executionTime: number;
    executed: boolean;
  }>> {
    // Try indexer first for faster response (no block range limitations)
    if (await this.isIndexerAvailable()) {
      try {
        const recoveries = await indexerService.module.getPendingRecoveries(walletAddress);
        return recoveries.map((r) => ({
          recoveryHash: r.recoveryHash,
          newOwners: r.newOwners,
          newThreshold: Number(r.newThreshold),
          approvalCount: Number(r.approvalCount),
          executionTime: Number(r.executionTime),
          executed: false, // Indexer only returns pending (non-executed) recoveries
        }));
      } catch {
        // Silently fall back to blockchain
      }
    }

    // Fallback to blockchain (limited to recent blocks) - convert bigint to number for React Query
    const blockchainRecoveries = await this.socialRecovery.getPendingRecoveries(walletAddress);
    return blockchainRecoveries.map((r) => ({
      recoveryHash: r.recoveryHash,
      newOwners: r.newOwners,
      newThreshold: Number(r.newThreshold),
      approvalCount: Number(r.approvalCount),
      executionTime: Number(r.executionTime),
      executed: r.executed,
    }));
  }

  async getRecoveryHistory(walletAddress: string): Promise<SocialRecovery[]> {
    // Recovery history is only available via indexer (no blockchain fallback)
    if (await this.isIndexerAvailable()) {
      try {
        return await indexerService.module.getRecoveryHistory(walletAddress);
      } catch {
        // Indexer failed, return empty
      }
    }
    return [];
  }

  async getRecoveryApprovals(walletAddress: string, recoveryHash: string): Promise<RecoveryApproval[]> {
    // Recovery approvals are only available via indexer (no blockchain fallback)
    if (await this.isIndexerAvailable()) {
      try {
        return await indexerService.module.getRecoveryApprovals(walletAddress, recoveryHash);
      } catch {
        // Indexer failed, return empty
      }
    }
    return [];
  }
}

// Singleton instance for backward compatibility
export const multisigService = new MultisigService();
