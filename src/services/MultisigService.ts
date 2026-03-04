import { getAddress } from 'quais';
import type { Provider, Signer, TransactionStatus } from '../types';
import type { WalletInfo, Transaction, PendingTransaction, DeploymentConfig } from '../types';

// Import specialized services
import { WalletService } from './core/WalletService';
import { TransactionService } from './core/TransactionService';
import { OwnerService } from './core/OwnerService';
import { SocialRecoveryModuleService } from './modules/SocialRecoveryModuleService';

// Import indexer service for faster reads
import { indexerService } from './indexer';
import { convertIndexerTransaction } from './utils/TransactionConverter';
import { INDEXER_CONFIG } from '../config/supabase';
import { getActiveProvider, hasWalletProvider } from '../config/provider';
import { validateAddress, validateTxHash } from './utils/TransactionErrorHandler';
import { transactionBuilderService } from './TransactionBuilderService';
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
  public readonly socialRecovery: SocialRecoveryModuleService;

  // Indexer availability cache
  private indexerAvailableCache: boolean | null = null;
  private indexerCheckTimestamp = 0;
  private indexerCheckPromise: Promise<boolean> | null = null;

  // Serial queue for getBalance calls — Pelagus serializes RPC internally,
  // so concurrent calls just pile up and timeout. Running them one at a time
  // ensures each gets a fair shot.
  private balanceQueue: Promise<bigint> = Promise.resolve(0n);

  constructor(provider?: Provider) {
    this.wallet = new WalletService(provider);
    this.transaction = new TransactionService(provider);
    this.owner = new OwnerService(provider, this.transaction);
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
   * Enqueue a getBalance call so it runs serially (not concurrently).
   * Each call waits for the previous one to finish before starting.
   */
  private fetchBalanceSerial(address: string): Promise<bigint> {
    this.balanceQueue = this.balanceQueue
      .catch(() => {}) // don't let a previous failure block the queue
      .then(() => getActiveProvider().getBalance(address));
    return this.balanceQueue;
  }

  /**
   * Set signer for signing transactions
   */
  setSigner(signer: Signer | null): void {
    this.wallet.setSigner(signer);
    this.transaction.setSigner(signer);
    this.owner.setSigner(signer);
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
        // Fire balance fetch in parallel with indexer queries.
        // Uses a serial queue so concurrent wallet cards don't overwhelm
        // Pelagus's serialized RPC bridge (which causes timeouts).
        const balancePromise: Promise<bigint> = hasWalletProvider()
          ? this.fetchBalanceSerial(checksummedAddress).catch((err) => {
              console.warn('[MultisigService] getBalance failed:', err instanceof Error ? err.message : err);
              return 0n;
            })
          : Promise.resolve(0n);

        // Indexer services convert to lowercase internally for queries
        const [wallet, owners, balance] = await Promise.all([
          indexerService.wallet.getWalletDetails(walletAddress),
          indexerService.wallet.getWalletOwners(walletAddress),
          balancePromise,
        ]);

        if (wallet) {
          // Return checksummed addresses for display and blockchain compatibility
          return {
            address: checksummedAddress,
            owners: owners.map((o) => getAddress(o)),
            threshold: wallet.threshold,
            balance: balance.toString(),
            minExecutionDelay: wallet.min_execution_delay ?? 0,
          };
        }
      } catch (err) {
        console.warn('[MultisigService] getWalletInfo indexer failed, falling back to blockchain:', err instanceof Error ? err.message : err);
      }
    }

    // Fallback to blockchain — only if wallet provider is available.
    // The sharedProvider (public RPC) may be CORS-blocked and hang forever.
    if (!hasWalletProvider()) {
      throw new Error('Wallet info unavailable: no wallet provider and indexer failed');
    }
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
      } catch (err) {
        console.warn('[MultisigService] getWalletsForOwner indexer failed, falling back to blockchain:', err instanceof Error ? err.message : err);
      }
    }

    if (!hasWalletProvider()) return [];
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
      } catch (err) {
        console.warn('[MultisigService] getWalletsForGuardian indexer failed:', err instanceof Error ? err.message : err);
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
      } catch (err) {
        console.warn('[MultisigService] isOwner indexer failed, falling back to blockchain:', err instanceof Error ? err.message : err);
      }
    }

    if (!hasWalletProvider()) return false;
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

    if (!hasWalletProvider()) return false;
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
    data: string,
    expiration?: number,
    executionDelay?: number,
  ): Promise<string> {
    const validatedWallet = validateAddress(walletAddress);
    const validatedTo = validateAddress(to);
    return this.transaction.proposeTransaction(validatedWallet, validatedTo, value, data, expiration, executionDelay);
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

  /**
   * Approve and immediately execute a transaction in one call.
   * Only works if this approval meets the threshold and timelock has elapsed (or is 0).
   */
  async approveAndExecute(walletAddress: string, txHash: string): Promise<boolean> {
    const validatedWallet = validateAddress(walletAddress);
    const validatedHash = validateTxHash(txHash);
    return this.transaction.approveAndExecute(validatedWallet, validatedHash);
  }

  /**
   * Mark an expired transaction as expired (permissionless — anyone can call).
   */
  async expireTransaction(walletAddress: string, txHash: string): Promise<void> {
    const validatedWallet = validateAddress(walletAddress);
    const validatedHash = validateTxHash(txHash);
    return this.transaction.expireTransaction(validatedWallet, validatedHash);
  }

  /**
   * Propose setting the wallet's minimum execution delay (self-call).
   */
  async proposeSetMinExecutionDelay(walletAddress: string, delaySeconds: number): Promise<string> {
    const validatedWallet = validateAddress(walletAddress);
    const data = transactionBuilderService.buildSetMinExecutionDelay(delaySeconds);
    return this.transaction.proposeTransaction(validatedWallet, validatedWallet, BigInt(0), data);
  }

  /**
   * Propose signing a message on behalf of the wallet (EIP-1271 self-call).
   */
  async proposeSignMessage(walletAddress: string, message: string): Promise<string> {
    const validatedWallet = validateAddress(walletAddress);
    const data = transactionBuilderService.buildSignMessage(message);
    return this.transaction.proposeTransaction(validatedWallet, validatedWallet, BigInt(0), data);
  }

  /**
   * Propose unsigning a previously signed message (self-call).
   */
  async proposeUnsignMessage(walletAddress: string, message: string): Promise<string> {
    const validatedWallet = validateAddress(walletAddress);
    const data = transactionBuilderService.buildUnsignMessage(message);
    return this.transaction.proposeTransaction(validatedWallet, validatedWallet, BigInt(0), data);
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
      } catch (err) {
        console.warn('[MultisigService] getTransactionByHash indexer failed, falling back to blockchain:', err instanceof Error ? err.message : err);
      }
    }

    // Fallback to blockchain — only if wallet provider is available.
    if (!hasWalletProvider()) return null;
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
      } catch (err) {
        console.warn('[MultisigService] getPendingTransactions indexer failed, falling back to blockchain:', err instanceof Error ? err.message : err);
      }
    }

    // Fallback to blockchain — only if wallet provider is available.
    if (!hasWalletProvider()) return [];
    return this.transaction.getPendingTransactions(validatedWallet);
  }

  async getExecutedTransactions(walletAddress: string): Promise<PendingTransaction[]> {
    return this.getTransactionsByStatus(walletAddress, 'executed');
  }

  async getCancelledTransactions(walletAddress: string): Promise<PendingTransaction[]> {
    return this.getTransactionsByStatus(walletAddress, 'cancelled');
  }

  async getExpiredTransactions(walletAddress: string): Promise<PendingTransaction[]> {
    return this.getTransactionsByStatus(walletAddress, 'expired');
  }

  async getFailedTransactions(walletAddress: string): Promise<PendingTransaction[]> {
    return this.getTransactionsByStatus(walletAddress, 'failed');
  }

  private async getTransactionsByStatus(
    walletAddress: string,
    status: TransactionStatus
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

        return multisigTxs;
      } catch (err) {
        console.warn(`[MultisigService] getTransactionsByStatus(${status}) indexer failed, falling back to blockchain:`, err instanceof Error ? err.message : err);
      }
    }

    // Blockchain fallback — only if wallet provider is available.
    if (!hasWalletProvider()) return [];
    switch (status) {
      case 'executed':
        return this.transaction.getExecutedTransactions(validatedWallet);
      case 'cancelled':
        return this.transaction.getCancelledTransactions(validatedWallet);
      default:
        // expired/failed have no RPC-based fallback
        return [];
    }
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
        // Indexer returned null → wallet has no social recovery config.
        // This is a definitive answer, not an indexer failure — return empty config.
        return { guardians: [], threshold: 0, recoveryPeriod: 0 };
      } catch (error) {
        // Silently fall back to blockchain - table may not exist in indexer schema
        const errorMessage = error instanceof Error ? error.message : '';
        if (!errorMessage.includes('table not available')) {
          console.warn('Indexer recovery config failed, falling back to blockchain:', errorMessage || 'Unknown error');
        }
      }
    }

    // Fallback to blockchain - only if wallet provider is available.
    // The sharedProvider (public RPC) may be CORS-blocked and hang forever.
    if (!hasWalletProvider()) {
      return { guardians: [], threshold: 0, recoveryPeriod: 0 };
    }
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
        // Indexer returned null → wallet has no social recovery config → not a guardian.
        return false;
      } catch (err) {
        console.warn('[MultisigService] isGuardian indexer failed, falling back to blockchain:', err instanceof Error ? err.message : err);
      }
    }

    // Fallback to blockchain — only if wallet provider is available.
    if (!hasWalletProvider()) return false;
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
      } catch (err) {
        console.warn('[MultisigService] getPendingRecoveries indexer failed, falling back to blockchain:', err instanceof Error ? err.message : err);
      }
    }

    // Fallback to blockchain — only if wallet provider is available.
    if (!hasWalletProvider()) return [];
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
      } catch (err) {
        console.warn('[MultisigService] getRecoveryHistory indexer failed:', err instanceof Error ? err.message : err);
      }
    }
    return [];
  }

  async getRecoveryApprovals(walletAddress: string, recoveryHash: string): Promise<RecoveryApproval[]> {
    // Recovery approvals are only available via indexer (no blockchain fallback)
    if (await this.isIndexerAvailable()) {
      try {
        return await indexerService.module.getRecoveryApprovals(walletAddress, recoveryHash);
      } catch (err) {
        console.warn('[MultisigService] getRecoveryApprovals indexer failed:', err instanceof Error ? err.message : err);
      }
    }
    return [];
  }
}

// Singleton instance for backward compatibility
export const multisigService = new MultisigService();
