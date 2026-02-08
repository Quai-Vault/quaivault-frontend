import type { Contract, Provider, Signer } from '../../types';
import type { Transaction, PendingTransaction } from '../../types';
import { BaseService } from './BaseService';
import {
  formatTransactionError,
  validateTxHash,
  validateAddress,
  TransactionErrors,
} from '../utils/TransactionErrorHandler';
import {
  estimateGasOrThrow,
} from '../utils/GasEstimator';
import { EVENT_QUERY_RANGE, EVENT_QUERY_RANGE_FALLBACK } from '../../config/contracts';
import { ZERO_ADDRESS } from '../../utils/formatting';

/**
 * Service for transaction operations
 * Handles propose, approve, revoke, cancel, execute, and query transactions
 */
export class TransactionService extends BaseService {

  constructor(provider?: Provider) {
    super(provider);
  }

  /**
   * Propose a new transaction
   */
  async proposeTransaction(
    walletAddress: string,
    to: string,
    value: bigint,
    data: string
  ): Promise<string> {
    validateAddress(walletAddress);
    validateAddress(to);
    if (data !== '0x' && !/^0x([0-9a-fA-F]{2})*$/.test(data)) {
      throw new Error('Transaction data must be a valid hex string starting with 0x with an even number of hex characters');
    }
    const signer = this.requireSigner();
    const wallet = this.getWalletContract(walletAddress, signer);

    // Check if caller is an owner
    const callerAddress = await signer.getAddress();
    const isOwner = await wallet.isOwner(callerAddress);
    if (!isOwner) {
      throw new Error(`Address ${callerAddress} is not an owner of this wallet`);
    }

    // Pre-compute nonce and txHash once (used by both check and validate)
    const nonce = await wallet.nonce();
    const txHash = await wallet.getTransactionHash(to, value, data, nonce);

    // Check for existing transaction (returns true if cancelled overwrite)
    const isCancelledOverwrite = await this.checkExistingTransaction(wallet, to, value, data, walletAddress, txHash);

    // Determine if this is a self-call (unreliable gas estimation)
    const isSelfCall = to.toLowerCase() === walletAddress.toLowerCase();

    // Skip gas estimation for self-calls and cancelled overwrites
    if (!isSelfCall && !isCancelledOverwrite) {
      await this.validateProposalGas(wallet, to, value, data);
    }

    // Send transaction
    const txOptions = isSelfCall ? await this.buildSelfCallOptions(signer) : {};

    let tx;
    try {
      tx = await wallet.proposeTransaction(to, value, data, txOptions);
    } catch (error) {
      throw formatTransactionError(error, 'Transaction proposal failed', wallet);
    }

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('Transaction receipt not available — transaction may have been replaced');
    }

    // Extract transaction hash from event
    return this.extractTxHashFromReceipt(receipt, wallet);
  }

  /**
   * Approve a transaction
   */
  async approveTransaction(walletAddress: string, txHash: string): Promise<void> {
    validateAddress(walletAddress);
    const signer = this.requireSigner();
    const normalizedHash = validateTxHash(txHash);
    const wallet = this.getWalletContract(walletAddress, signer);

    const tx = await wallet.approveTransaction(normalizedHash);
    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('Transaction receipt not available — transaction may have been replaced');
    }
    if (receipt.status === 0) {
      throw new Error('Approve transaction reverted');
    }
  }

  /**
   * Revoke approval for a transaction
   */
  async revokeApproval(walletAddress: string, txHash: string): Promise<void> {
    validateAddress(walletAddress);
    const signer = this.requireSigner();
    const normalizedHash = validateTxHash(txHash);
    const wallet = this.getWalletContract(walletAddress, signer);
    const signerAddress = await signer.getAddress();

    // Pre-validation
    await this.validateRevokeApproval(wallet, normalizedHash, signerAddress);

    const nonce = await this.provider.getTransactionCount(signerAddress, 'pending');
    const tx = await wallet.revokeApproval(normalizedHash, { nonce });

    const receipt = await tx.wait();

    if (receipt?.status === 0) {
      throw new Error('Revoke approval transaction reverted');
    }

    // Verify on-chain
    const stillApproved = await wallet.approvals(normalizedHash, signerAddress);
    if (stillApproved) {
      throw new Error('Approval revocation may have failed - approval still exists on-chain');
    }
  }

  /**
   * Cancel a pending transaction
   */
  async cancelTransaction(walletAddress: string, txHash: string): Promise<void> {
    validateAddress(walletAddress);
    const signer = this.requireSigner();
    const normalizedHash = validateTxHash(txHash);
    const wallet = this.getWalletContract(walletAddress, signer);
    const callerAddress = await signer.getAddress();

    // Validate cancellation
    await this.validateCancelTransaction(wallet, normalizedHash, callerAddress);

    // Pre-validate: will throw with descriptive error if tx would revert
    await estimateGasOrThrow(
      wallet.cancelTransaction,
      [normalizedHash],
      'cancel transaction',
      wallet
    );

    const tx = await wallet.cancelTransaction(normalizedHash);
    const receipt = await tx.wait();

    // Verify on-chain
    const verifyTx = await wallet.transactions(normalizedHash);
    if (!verifyTx.cancelled) {
      if (receipt?.status === 0) {
        throw new Error('Transaction cancellation failed (reverted)');
      }
    }
  }

  /**
   * Execute a transaction
   */
  async executeTransaction(walletAddress: string, txHash: string): Promise<void> {
    validateAddress(walletAddress);
    const signer = this.requireSigner();
    const normalizedHash = validateTxHash(txHash);
    const wallet = this.getWalletContract(walletAddress, signer);

    // Pre-validation
    await this.validateExecuteTransaction(wallet, normalizedHash, walletAddress);

    let tx;
    try {
      tx = await wallet.executeTransaction(normalizedHash);
    } catch (error) {
      throw formatTransactionError(error, 'Transaction execution failed', wallet);
    }

    const receipt = await tx.wait();

    if (receipt?.status === 0) {
      throw new Error('Transaction execution reverted');
    }
  }

  /**
   * Approve and execute a transaction atomically
   * Prevents frontrunning by combining approval and execution in a single transaction.
   *
   * Race condition note: Between our pre-validation read and the on-chain execution,
   * another owner could approve/execute/cancel the same transaction. The contract's
   * own checks will revert in that case, and the revert reason is surfaced to the user
   * via `formatTransactionError`. This is an inherent limitation of approve-then-execute
   * patterns — the pre-validation minimises gas waste but cannot fully eliminate races.
   *
   * @returns true if executed, false if only approved (threshold not yet met)
   */
  async approveAndExecute(walletAddress: string, txHash: string): Promise<boolean> {
    validateAddress(walletAddress);
    const signer = this.requireSigner();
    const normalizedHash = validateTxHash(txHash);
    const wallet = this.getWalletContract(walletAddress, signer);
    const signerAddress = await signer.getAddress();

    // Pre-validation — read on-chain state to give the user a clear error before
    // prompting wallet signature.  These reads are point-in-time snapshots; state
    // may change before the transaction is mined (see race condition note above).
    const [txDetails, threshold, isOwner, hasApproved] = await Promise.all([
      wallet.transactions(normalizedHash),
      wallet.threshold(),
      wallet.isOwner(signerAddress),
      wallet.approvals(normalizedHash, signerAddress),
    ]);

    if (txDetails.to.toLowerCase() === ZERO_ADDRESS) {
      throw new Error(TransactionErrors.TX_NOT_FOUND);
    }
    if (!isOwner) {
      throw new Error(TransactionErrors.NOT_OWNER);
    }
    if (txDetails.executed) {
      throw new Error(TransactionErrors.TX_ALREADY_EXECUTED);
    }
    if (txDetails.cancelled) {
      throw new Error('Transaction has been cancelled');
    }
    if (hasApproved) {
      throw new Error('You have already approved this transaction');
    }

    // Pre-validate: simulate the transaction to catch reverts before prompting user to sign.
    // This also narrows the race window by catching concurrent state changes early.
    await estimateGasOrThrow(
      wallet.approveAndExecute,
      [normalizedHash],
      'approve and execute',
      wallet
    );

    let tx;
    try {
      tx = await wallet.approveAndExecute(normalizedHash);
    } catch (error) {
      throw formatTransactionError(error, 'Approve and execute failed', wallet);
    }

    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error('Transaction receipt not available — transaction may have been replaced');
    }

    if (receipt.status === 0) {
      throw new Error('Transaction reverted');
    }

    // Check if transaction was executed by looking for TransactionExecuted event
    for (const log of receipt.logs || []) {
      try {
        const parsed = wallet.interface.parseLog(log);
        if (parsed?.name === 'TransactionExecuted' && parsed.args?.txHash === normalizedHash) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  /**
   * Get transaction details
   */
  async getTransaction(walletAddress: string, txHash: string): Promise<Transaction> {
    const wallet = this.getWalletContract(walletAddress);
    const tx = await wallet.transactions(txHash);

    return {
      to: tx.to,
      value: tx.value,
      data: tx.data,
      executed: tx.executed,
      numApprovals: tx.numApprovals,
      timestamp: tx.timestamp,
    };
  }

  /**
   * Get a specific transaction by hash
   */
  async getTransactionByHash(walletAddress: string, txHash: string): Promise<PendingTransaction | null> {
    try {
      const wallet = this.getWalletContract(walletAddress);
      const [owners, threshold, tx] = await Promise.all([
        wallet.getOwners(),
        wallet.threshold(),
        wallet.transactions(txHash),
      ]);

      if (tx.to.toLowerCase() === ZERO_ADDRESS) {
        return null;
      }

      const approvals = await this.getApprovalsForTransaction(wallet, txHash, owners);

      return {
        hash: txHash,
        to: tx.to,
        value: tx.value.toString(),
        data: tx.data,
        numApprovals: Number(tx.numApprovals),
        threshold: Number(threshold),
        executed: tx.executed,
        cancelled: tx.cancelled || false,
        timestamp: Number(tx.timestamp),
        proposer: tx.proposer || '',
        approvals,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get pending transactions for a wallet
   */
  async getPendingTransactions(walletAddress: string): Promise<PendingTransaction[]> {
    return this.getTransactionsByFilter(walletAddress, 'TransactionProposed', tx => !tx.executed && !tx.cancelled);
  }

  /**
   * Get executed transactions for a wallet
   */
  async getExecutedTransactions(walletAddress: string): Promise<PendingTransaction[]> {
    return this.getTransactionsByFilter(walletAddress, 'TransactionExecuted', tx => tx.executed);
  }

  /**
   * Get cancelled transactions for a wallet
   */
  async getCancelledTransactions(walletAddress: string): Promise<PendingTransaction[]> {
    return this.getTransactionsByFilter(walletAddress, 'TransactionCancelled', tx => tx.cancelled);
  }

  // ============ Private Helper Methods ============

  /**
   * Check for existing transaction with same parameters.
   * Returns true if the existing tx is cancelled (overwrite OK, skip gas estimation).
   */
  private async checkExistingTransaction(
    wallet: Contract,
    to: string,
    value: bigint,
    data: string,
    walletAddress: string,
    txHash: string
  ): Promise<boolean> {
    try {
      const existingTx = await wallet.transactions(txHash);

      if (existingTx.to.toLowerCase() !== ZERO_ADDRESS) {
        if (existingTx.cancelled) {
          // Transaction exists but is cancelled - re-proposing will overwrite it
          return true;
        } else if (existingTx.executed) {
          throw new Error('This transaction was already executed');
        } else {
          const txDetails = await this.getTransactionByHash(walletAddress, txHash);
          throw new Error(
            `A transaction with these parameters already exists (hash: ${txHash}). ` +
            `It has ${txDetails?.numApprovals || 0}/${txDetails?.threshold || 0} approvals.`
          );
        }
      }
    } catch (error) {
      if (error.message?.includes('already exists') || error.message?.includes('already executed')) {
        throw error;
      }
      // Transaction doesn't exist yet — log unexpected errors for diagnostics
      if (error.message && !error.message.includes('revert') && !error.message.includes('missing revert data')) {
        console.warn('checkExistingTransaction unexpected error:', error.message);
      }
    }
    return false;
  }

  /**
   * Validate gas estimation for proposal
   */
  private async validateProposalGas(
    wallet: Contract,
    to: string,
    value: bigint,
    data: string,
  ): Promise<void> {
    try {
      await wallet.proposeTransaction.estimateGas(to, value, data);
    } catch (error) {
      if (error.reason && !error.reason.includes('missing revert data')) {
        throw new Error(`Transaction proposal would fail: ${error.reason}`);
      }
    }
  }

  /**
   * Build options for self-call transactions
   */
  private async buildSelfCallOptions(signer: Signer): Promise<{ nonce?: number }> {
    const txOptions: { nonce?: number } = {};

    try {
      const callerAddress = await signer.getAddress();
      const currentNonce = await this.provider.getTransactionCount(callerAddress, 'pending');
      txOptions.nonce = currentNonce;
    } catch {
      // Use default nonce if explicit nonce fails
    }

    return txOptions;
  }

  /**
   * Extract transaction hash from proposal receipt
   */
  private extractTxHashFromReceipt(
    receipt: { logs: Array<{ fragment?: { name: string }; args?: Record<string, string>; topics?: string[]; data: string }> },
    wallet: Contract
  ): string {
    // Method 1: Check fragment name
    const event = receipt.logs.find((log) => log.fragment?.name === 'TransactionProposed');
    if (event?.args?.txHash) {
      return event.args.txHash;
    }

    // Method 2: Parse logs using interface
    for (const log of receipt.logs) {
      try {
        const parsed = wallet.interface.parseLog(log);
        if (parsed?.name === 'TransactionProposed' && parsed.args?.txHash) {
          return parsed.args.txHash;
        }
      } catch {
        continue;
      }
    }

    throw new Error('Transaction proposal event not found');
  }

  /**
   * Validate revoke approval preconditions
   */
  private async validateRevokeApproval(
    wallet: Contract,
    txHash: string,
    signerAddress: string
  ): Promise<void> {
    const txDetails = await wallet.transactions(txHash);
    if (txDetails.to.toLowerCase() === ZERO_ADDRESS) {
      throw new Error(TransactionErrors.TX_NOT_FOUND);
    }
    if (txDetails.executed) {
      throw new Error('Cannot revoke approval for an executed transaction');
    }
    if (txDetails.cancelled) {
      throw new Error('Cannot revoke approval for a cancelled transaction');
    }

    const hasApproved = await wallet.approvals(txHash, signerAddress);
    if (!hasApproved) {
      throw new Error(TransactionErrors.NOT_APPROVED);
    }
  }

  /**
   * Validate cancel transaction preconditions
   */
  private async validateCancelTransaction(
    wallet: Contract,
    txHash: string,
    callerAddress: string
  ): Promise<void> {
    const [txDetails, threshold, isOwner] = await Promise.all([
      wallet.transactions(txHash),
      wallet.threshold(),
      wallet.isOwner(callerAddress),
    ]);

    if (txDetails.to.toLowerCase() === ZERO_ADDRESS) {
      throw new Error(TransactionErrors.TX_NOT_FOUND);
    }
    if (txDetails.executed) {
      throw new Error('Cannot cancel an executed transaction');
    }
    if (txDetails.cancelled) {
      throw new Error('Transaction has already been cancelled');
    }
    if (!isOwner) {
      throw new Error(TransactionErrors.NOT_OWNER);
    }

    const isProposer = txDetails.proposer?.toLowerCase() === callerAddress.toLowerCase();
    if (!isProposer) {
      const currentApprovals = Number(txDetails.numApprovals);
      const requiredThreshold = Number(threshold);
      if (currentApprovals < requiredThreshold) {
        throw new Error(
          `Only the proposer can cancel immediately. To cancel as non-proposer, ` +
          `needs ${requiredThreshold} approvals (has ${currentApprovals})`
        );
      }
    }
  }

  /**
   * Validate execute transaction preconditions
   */
  private async validateExecuteTransaction(
    wallet: Contract,
    txHash: string,
    walletAddress: string
  ): Promise<any> {
    const [txDetails, threshold] = await Promise.all([
      wallet.transactions(txHash),
      wallet.threshold(),
    ]);
    if (txDetails.to.toLowerCase() === ZERO_ADDRESS) {
      throw new Error(TransactionErrors.TX_NOT_FOUND);
    }
    if (txDetails.executed) {
      throw new Error(TransactionErrors.TX_ALREADY_EXECUTED);
    }
    if (txDetails.cancelled) {
      throw new Error('Transaction has been cancelled and cannot be executed');
    }
    if (txDetails.numApprovals < threshold) {
      throw new Error(TransactionErrors.NOT_ENOUGH_APPROVALS(
        Number(txDetails.numApprovals),
        Number(threshold)
      ));
    }

    // Check removeOwner constraints for self-calls
    if (txDetails.to.toLowerCase() === walletAddress.toLowerCase() && txDetails.data !== '0x') {
      await this.validateSelfCallConstraints(wallet, txDetails);
    }

    return txDetails;
  }

  /**
   * Validate self-call constraints (owner management, module management)
   */
  private async validateSelfCallConstraints(wallet: Contract, txDetails: any): Promise<void> {
    try {
      const decoded = wallet.interface.parseTransaction({ data: txDetails.data });
      if (decoded?.name === 'removeOwner') {
        const owners = await wallet.getOwners();
        const threshold = await wallet.threshold();
        if (owners.length - 1 < Number(threshold)) {
          throw new Error(
            `Cannot remove owner: would reduce owners to ${owners.length - 1}, ` +
            `but threshold is ${threshold}. Lower the threshold first.`
          );
        }
      } else if (decoded?.name === 'disableModule') {
        await this.validateDisableModulePrevModule(wallet, decoded.args);
      }
    } catch (error) {
      if (error.message?.includes('Cannot remove owner') ||
          error.message?.includes('module disable proposal is outdated')) {
        throw error;
      }
    }
  }

  /**
   * Validate that the prevModule in a disableModule call is still correct.
   * The Zodiac module linked list changes when modules are added/removed,
   * so a proposal's baked-in prevModule can become stale.
   */
  private async validateDisableModulePrevModule(wallet: Contract, args: any): Promise<void> {
    const SENTINEL = '0x0000000000000000000000000000000000000001';
    const prevModule = String(args[0]);
    const moduleToDisable = String(args[1]);

    try {
      const modules: string[] = Array.from(await wallet.getModules()).map(String);

      // Check if the module is still enabled
      const idx = modules.findIndex(
        (a: string) => a.toLowerCase() === moduleToDisable.toLowerCase()
      );
      if (idx === -1) {
        throw new Error(
          `This module disable proposal is outdated: the module is no longer enabled. ` +
          `Cancel this proposal.`
        );
      }

      // Check if prevModule is still the correct predecessor
      const expectedPrev = idx === 0 ? SENTINEL : modules[idx - 1];
      if (expectedPrev.toLowerCase() !== prevModule.toLowerCase()) {
        throw new Error(
          `This module disable proposal is outdated because the module list changed ` +
          `since it was created. Cancel this proposal and create a new one.`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('outdated')) {
        throw error;
      }
      // If we can't verify, let execution proceed (it will fail on-chain with a revert)
    }
  }

  /**
   * Get approvals for each owner
   * Uses Promise.all for parallel fetching instead of sequential loop
   */
  private async getApprovalsForTransaction(
    wallet: Contract,
    txHash: string,
    owners: string[]
  ): Promise<{ [owner: string]: boolean }> {
    const approvalResults = await Promise.all(
      owners.map(async (owner) => {
        const approved = await wallet.approvals(txHash, owner);
        return { owner: owner.toLowerCase(), approved };
      })
    );

    const approvals: { [owner: string]: boolean } = {};
    for (const { owner, approved } of approvalResults) {
      approvals[owner] = approved;
    }
    return approvals;
  }

  /**
   * Get transactions by event filter
   */
  private async getTransactionsByFilter(
    walletAddress: string,
    eventName: string,
    filterFn: (tx: any) => boolean
  ): Promise<PendingTransaction[]> {
    const wallet = this.getWalletContract(walletAddress);
    const [owners, threshold] = await Promise.all([
      wallet.getOwners(),
      wallet.threshold(),
    ]);

    const filter = wallet.filters[eventName]();
    let events: any[] = [];

    try {
      events = await wallet.queryFilter(filter, EVENT_QUERY_RANGE, 'latest');
    } catch (error) {
      if (error.message?.includes('exceeds maximum limit')) {
        try {
          events = await wallet.queryFilter(filter, EVENT_QUERY_RANGE_FALLBACK, 'latest');
        } catch {
          events = [];
        }
      }
    }

    const transactions: PendingTransaction[] = [];
    const seenHashes = new Set<string>();

    // Deduplicate event hashes
    const uniqueEvents: { txHash: string; proposer: string }[] = [];
    for (const event of events) {
      if (!('args' in event)) continue;
      const txHash = event.args.txHash;
      if (!txHash || seenHashes.has(txHash.toLowerCase())) continue;
      seenHashes.add(txHash.toLowerCase());
      uniqueEvents.push({ txHash, proposer: event.args.proposer || '' });
    }

    // Batch-fetch transaction details in parallel
    const BATCH_SIZE = 10;
    for (let i = 0; i < uniqueEvents.length; i += BATCH_SIZE) {
      const batch = uniqueEvents.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async ({ txHash, proposer }) => {
          const tx = await wallet.transactions(txHash);
          if (!filterFn(tx)) return null;

          const approvals = await this.getApprovalsForTransaction(wallet, txHash, owners);
          return {
            hash: txHash,
            to: tx.to,
            value: tx.value.toString(),
            data: tx.data,
            numApprovals: Number(tx.numApprovals),
            threshold: Number(threshold),
            executed: tx.executed,
            cancelled: tx.cancelled || false,
            timestamp: Number(tx.timestamp),
            proposer: tx.proposer || proposer,
            approvals,
          } as PendingTransaction;
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          transactions.push(result.value);
        }
      }
    }

    transactions.sort((a, b) => b.timestamp - a.timestamp);
    return transactions;
  }
}
