import { getAddress } from 'quais';
import type { Provider } from '../../types';
import { CONTRACT_ADDRESSES, EVENT_QUERY_RANGE, EVENT_QUERY_RANGE_FALLBACK } from '../../config/contracts';
import { BaseModuleService } from './BaseModuleService';
import type { TransactionService } from '../core/TransactionService';
import {
  isUserRejection,
  validateAddress,
} from '../utils/TransactionErrorHandler';
import {
  estimateGasOrThrow,
} from '../utils/GasEstimator';
import SocialRecoveryModuleABI from '../../config/abi/SocialRecoveryModule.json';

export interface RecoveryConfig {
  guardians: string[];
  threshold: bigint;
  recoveryPeriod: bigint;
}

export interface Recovery {
  newOwners: string[];
  newThreshold: bigint;
  approvalCount: bigint;
  executionTime: bigint;
  executed: boolean;
}

export interface PendingRecovery extends Recovery {
  recoveryHash: string;
}

/**
 * Service for social recovery module operations
 *
 * IMPORTANT (H-2 Security Fix): The setupRecovery function now requires multisig approval.
 * Use proposeSetupRecovery() to create a multisig proposal. Guardian operations
 * (initiateRecovery, approveRecovery, etc.) still work directly.
 */
export class SocialRecoveryModuleService extends BaseModuleService {

  constructor(provider?: Provider, transactionService?: TransactionService) {
    super(provider, CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE, SocialRecoveryModuleABI, transactionService);
  }

  /**
   * Get recovery configuration for a wallet
   */
  async getRecoveryConfig(walletAddress: string): Promise<RecoveryConfig> {
    const module = this.getModuleContract();
    try {
      const config = await module.getRecoveryConfig(walletAddress);

      // Handle both array-style (tuple) and object-style returns from quais
      // The contract returns a struct, which may come as an array [guardians, threshold, recoveryPeriod]
      // or as an object with named properties depending on quais version
      let guardians: string[];
      let threshold: bigint;
      let recoveryPeriod: bigint;

      if (Array.isArray(config)) {
        // Tuple-style: [guardians[], threshold, recoveryPeriod]
        guardians = config[0] || [];
        threshold = config[1] ?? 0n;
        recoveryPeriod = config[2] ?? 0n;
      } else {
        // Object-style: { guardians, threshold, recoveryPeriod }
        guardians = config.guardians || [];
        threshold = config.threshold ?? 0n;
        recoveryPeriod = config.recoveryPeriod ?? 0n;
      }

      // Ensure BigInt conversion (may come as number from some providers)
      return {
        guardians: Array.isArray(guardians) ? guardians : [],
        threshold: typeof threshold === 'bigint' ? threshold : BigInt(threshold || 0),
        recoveryPeriod: typeof recoveryPeriod === 'bigint' ? recoveryPeriod : BigInt(recoveryPeriod || 0),
      };
    } catch (error) {
      // If the call fails (e.g., no recovery configured), return empty config
      console.warn('getRecoveryConfig blockchain call failed, returning empty config:', error instanceof Error ? error.message : 'Unknown error');
      return {
        guardians: [],
        threshold: 0n,
        recoveryPeriod: 0n,
      };
    }
  }

  /**
   * Propose setting up recovery configuration (requires multisig approval)
   * @returns Transaction hash for the multisig proposal
   */
  async proposeSetupRecovery(
    walletAddress: string,
    guardians: string[],
    threshold: number,
    recoveryPeriodDays: number
  ): Promise<string> {
    // Validate guardians
    const normalizedGuardians = guardians.map(addr => validateAddress(addr));

    if (threshold < 1 || threshold > normalizedGuardians.length) {
      throw new Error(`Invalid threshold: must be between 1 and ${normalizedGuardians.length}`);
    }

    const recoveryPeriodSeconds = BigInt(recoveryPeriodDays) * 86400n;
    if (recoveryPeriodSeconds < 86400n) {
      throw new Error('Recovery period must be at least 1 day');
    }

    return this.createModuleProposal(walletAddress, 'setupRecovery', [
      walletAddress,
      normalizedGuardians,
      threshold,
      recoveryPeriodSeconds
    ]);
  }

  /**
   * @deprecated Use proposeSetupRecovery() instead - direct calls now require multisig approval (H-2 fix)
   */
  async setupRecovery(
    _walletAddress: string,
    _guardians: string[],
    _threshold: number,
    _recoveryPeriodDays: number
  ): Promise<void> {
    this.throwDeprecationError('setupRecovery', 'proposeSetupRecovery');
  }

  /**
   * Check if an address is a guardian for a wallet
   */
  async isGuardian(walletAddress: string, address: string): Promise<boolean> {
    const module = this.getModuleContract();
    return await module.isGuardian(walletAddress, address);
  }

  /**
   * Check if an address has approved a recovery
   */
  async hasApprovedRecovery(walletAddress: string, recoveryHash: string, address: string): Promise<boolean> {
    const module = this.getModuleContract();

    let recovery;
    try {
      recovery = await this.getRecovery(walletAddress, recoveryHash);

      if (recovery.executionTime === 0n) {
        return false;
      }
      if (recovery.executed) {
        return false;
      }
    } catch (error) {
      console.warn('Could not verify recovery state:', error);
      return false;
    }

    try {
      const hasApproved = await module.recoveryApprovals(walletAddress, recoveryHash, address);

      // Check for stale approvals using already-fetched recovery
      if (hasApproved && recovery.approvalCount === 0n) {
        console.warn('Stale approval detected');
        return false;
      }

      return hasApproved;
    } catch (error) {
      console.error('Error checking approval status:', error);
      return false;
    }
  }

  /**
   * Get recovery hash for given parameters with current nonce
   */
  async getRecoveryHash(
    walletAddress: string,
    newOwners: string[],
    newThreshold: number
  ): Promise<string> {
    const module = this.getModuleContract();
    const normalizedOwners = newOwners.map(addr => getAddress(addr));
    return await module.getRecoveryHashForCurrentNonce(walletAddress, normalizedOwners, newThreshold);
  }

  /**
   * Get recovery details
   */
  async getRecovery(walletAddress: string, recoveryHash: string): Promise<Recovery> {
    const module = this.getModuleContract();
    const recovery = await module.getRecovery(walletAddress, recoveryHash);
    return {
      newOwners: recovery.newOwners || [],
      newThreshold: recovery.newThreshold || 0n,
      approvalCount: recovery.approvalCount || 0n,
      executionTime: recovery.executionTime || 0n,
      executed: recovery.executed || false,
    };
  }

  /**
   * Initiate recovery (guardians only)
   */
  async initiateRecovery(
    walletAddress: string,
    newOwners: string[],
    newThreshold: number
  ): Promise<string> {
    const signer = this.requireSigner();
    const signerAddress = await signer.getAddress();

    // Pre-check: verify the signer is a guardian before attempting transaction
    const isGuardian = await this.isGuardian(walletAddress, signerAddress);
    if (!isGuardian) {
      throw new Error('Only guardians can initiate recovery. You are not a guardian for this wallet.');
    }

    const normalizedOwners = newOwners.map(addr => validateAddress(addr));

    if (normalizedOwners.length === 0) {
      throw new Error('At least one new owner is required');
    }
    if (newThreshold < 1 || newThreshold > normalizedOwners.length) {
      throw new Error(`Invalid threshold: must be between 1 and ${normalizedOwners.length}`);
    }

    const module = this.getModuleContract(signer);

    await estimateGasOrThrow(
      module.initiateRecovery,
      [walletAddress, normalizedOwners, newThreshold],
      'initiate recovery',
      module
    );

    let tx;
    try {
      tx = await module.initiateRecovery(walletAddress, normalizedOwners, newThreshold);
    } catch (error) {
      if (isUserRejection(error)) {
        throw new Error('Transaction was rejected by user');
      }
      throw error;
    }

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('Transaction receipt not available — transaction may have been replaced');
    }
    if (receipt.status === 0) {
      throw new Error('Transaction reverted');
    }

    // Extract recovery hash from event
    const recoveryHash = this.extractRecoveryHashFromReceipt(receipt, module);
    return recoveryHash;
  }

  /**
   * Approve recovery (guardians only)
   */
  async approveRecovery(walletAddress: string, recoveryHash: string): Promise<void> {
    const signer = this.requireSigner();
    const module = this.getModuleContract(signer);
    const signerAddress = await signer.getAddress();

    // Pre-validation
    try {
      const recovery = await this.getRecovery(walletAddress, recoveryHash);
      if (recovery.executionTime === 0n) {
        throw new Error('Recovery has been cancelled or does not exist');
      }
      if (recovery.executed) {
        throw new Error('Recovery has already been executed');
      }

      const hasApproved = await module.recoveryApprovals(walletAddress, recoveryHash, signerAddress);
      if (hasApproved) {
        throw new Error('You have already approved this recovery');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : '';
      if (errMsg.includes('cancelled') || errMsg.includes('already approved') || errMsg.includes('already been executed')) {
        throw error;
      }
      // Log unexpected pre-validation errors (e.g., RPC failures) for diagnostics
      console.warn('approveRecovery pre-validation failed:', errMsg || 'Unknown error');
    }

    await estimateGasOrThrow(
      module.approveRecovery,
      [walletAddress, recoveryHash],
      'approve recovery',
      module
    );

    let tx;
    try {
      tx = await module.approveRecovery(walletAddress, recoveryHash);
    } catch (error) {
      if (isUserRejection(error)) {
        throw new Error('Transaction was rejected by user');
      }
      throw error;
    }

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('Transaction receipt not available — transaction may have been replaced');
    }
    if (receipt.status === 0) {
      throw new Error('Transaction reverted');
    }
  }

  /**
   * Execute recovery (anyone, once conditions met)
   */
  async executeRecovery(walletAddress: string, recoveryHash: string): Promise<void> {
    const signer = this.requireSigner();
    const module = this.getModuleContract(signer);

    await estimateGasOrThrow(
      module.executeRecovery,
      [walletAddress, recoveryHash],
      'execute recovery',
      module
    );

    let tx;
    try {
      tx = await module.executeRecovery(walletAddress, recoveryHash);
    } catch (error) {
      if (isUserRejection(error)) {
        throw new Error('Transaction was rejected by user');
      }
      throw error;
    }

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('Transaction receipt not available — transaction may have been replaced');
    }
    if (receipt.status === 0) {
      throw new Error('Transaction reverted');
    }
  }

  /**
   * Cancel recovery (owners only)
   */
  async cancelRecovery(walletAddress: string, recoveryHash: string): Promise<void> {
    const signer = this.requireSigner();
    const module = this.getModuleContract(signer);

    await estimateGasOrThrow(
      module.cancelRecovery,
      [walletAddress, recoveryHash],
      'cancel recovery',
      module
    );

    let tx;
    try {
      tx = await module.cancelRecovery(walletAddress, recoveryHash);
    } catch (error) {
      if (isUserRejection(error)) {
        throw new Error('Transaction was rejected by user');
      }
      throw error;
    }

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('Transaction receipt not available — transaction may have been replaced');
    }
    if (receipt.status === 0) {
      throw new Error('Transaction reverted');
    }
  }

  /**
   * Revoke recovery approval (guardians only)
   * Allows guardians to change their mind before recovery is executed
   */
  async revokeRecoveryApproval(walletAddress: string, recoveryHash: string): Promise<void> {
    const signer = this.requireSigner();
    const module = this.getModuleContract(signer);
    const signerAddress = await signer.getAddress();

    // Pre-validation
    const recovery = await this.getRecovery(walletAddress, recoveryHash);
    if (recovery.executionTime === 0n) {
      throw new Error('Recovery has been cancelled or does not exist');
    }
    if (recovery.executed) {
      throw new Error('Recovery has already been executed');
    }

    const hasApproved = await module.recoveryApprovals(walletAddress, recoveryHash, signerAddress);
    if (!hasApproved) {
      throw new Error('You have not approved this recovery');
    }

    await estimateGasOrThrow(
      module.revokeRecoveryApproval,
      [walletAddress, recoveryHash],
      'revoke recovery approval',
      module
    );

    let tx;
    try {
      tx = await module.revokeRecoveryApproval(walletAddress, recoveryHash);
    } catch (error) {
      if (isUserRejection(error)) {
        throw new Error('Transaction was rejected by user');
      }
      throw error;
    }

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('Transaction receipt not available — transaction may have been replaced');
    }
    if (receipt.status === 0) {
      throw new Error('Transaction reverted');
    }
  }

  /**
   * Get all pending recoveries
   */
  async getPendingRecoveries(walletAddress: string): Promise<PendingRecovery[]> {
    const module = this.getModuleContract();

    // Query RecoveryInitiated events
    const filter = module.filters.RecoveryInitiated(walletAddress);
    let events: any[] = [];

    try {
      events = await module.queryFilter(filter, EVENT_QUERY_RANGE, 'latest');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : '';
      if (errMsg.includes('exceeds maximum limit')) {
        try {
          events = await module.queryFilter(filter, EVENT_QUERY_RANGE_FALLBACK, 'latest');
        } catch {
          events = [];
        }
      }
    }

    const recoveries: PendingRecovery[] = [];
    const seenHashes = new Set<string>();

    for (const event of events) {
      const recoveryHash = event.args?.recoveryHash;
      if (!recoveryHash) continue;

      const hashLower = recoveryHash.toLowerCase();
      if (seenHashes.has(hashLower)) continue;

      try {
        const recovery = await this.getRecovery(walletAddress, recoveryHash);

        // Skip cancelled or executed
        if (recovery.executionTime === 0n || recovery.executed) continue;

        seenHashes.add(hashLower);
        recoveries.push({
          recoveryHash,
          ...recovery,
        });
      } catch (error) {
        console.error(`Error fetching recovery ${recoveryHash}:`, error);
      }
    }

    return recoveries;
  }

  // ============ Private Helper Methods ============

  /**
   * Extract recovery hash from receipt
   */
  private extractRecoveryHashFromReceipt(receipt: any, module: Contract): string {
    if (receipt.logs) {
      for (const log of receipt.logs) {
        try {
          const parsedLog = module.interface.parseLog(log);
          if (parsedLog?.name === 'RecoveryInitiated' && parsedLog.args?.recoveryHash) {
            return parsedLog.args.recoveryHash;
          }
        } catch {
          continue;
        }
      }
    }

    throw new Error('Could not extract recovery hash from transaction events');
  }
}
