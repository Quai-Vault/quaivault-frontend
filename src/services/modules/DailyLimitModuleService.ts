import type { Provider } from '../../types';
import { CONTRACT_ADDRESSES } from '../../config/contracts';
import { BaseModuleService } from './BaseModuleService';
import type { TransactionService } from '../core/TransactionService';
import { transactionBuilderService } from '../TransactionBuilderService';
import {
  isUserRejection,
  validateAddress,
} from '../utils/TransactionErrorHandler';
import {
  estimateGasOrThrow,
} from '../utils/GasEstimator';
import DailyLimitModuleABI from '../../config/abi/DailyLimitModule.json';

/**
 * Service for daily limit module operations
 *
 * IMPORTANT (H-2 Security Fix): Configuration functions (setDailyLimit, resetDailyLimit)
 * now require multisig approval. Use proposeSetDailyLimit() and proposeResetDailyLimit()
 * to create multisig proposals. Execution functions (executeBelowLimit) still work
 * with single owner.
 */
export class DailyLimitModuleService extends BaseModuleService {

  constructor(provider?: Provider, transactionService?: TransactionService) {
    super(provider, CONTRACT_ADDRESSES.DAILY_LIMIT_MODULE, DailyLimitModuleABI, transactionService);
  }

  /**
   * Propose setting daily spending limit (requires multisig approval)
   * @returns Transaction hash for the multisig proposal
   */
  async proposeSetDailyLimit(walletAddress: string, limit: bigint): Promise<string> {
    return this.createModuleProposal(walletAddress, 'setDailyLimit', [walletAddress, limit]);
  }

  /**
   * Propose resetting daily limit (requires multisig approval)
   * @returns Transaction hash for the multisig proposal
   */
  async proposeResetDailyLimit(walletAddress: string): Promise<string> {
    return this.createModuleProposal(walletAddress, 'resetDailyLimit', [walletAddress]);
  }

  /**
   * @deprecated Use proposeSetDailyLimit() instead - direct calls now require multisig approval (H-2 fix)
   */
  async setDailyLimit(_walletAddress: string, _limit: bigint): Promise<void> {
    this.throwDeprecationError('setDailyLimit', 'proposeSetDailyLimit');
  }

  /**
   * Get daily limit configuration
   */
  async getDailyLimit(walletAddress: string): Promise<{ limit: bigint; spent: bigint; lastReset: bigint }> {
    const module = this.getModuleContract();
    return await module.getDailyLimit(walletAddress);
  }

  /**
   * @deprecated Use proposeResetDailyLimit() instead - direct calls now require multisig approval (H-2 fix)
   */
  async resetDailyLimit(_walletAddress: string): Promise<void> {
    this.throwDeprecationError('resetDailyLimit', 'proposeResetDailyLimit');
  }

  /**
   * Get remaining daily limit
   */
  async getRemainingLimit(walletAddress: string): Promise<bigint> {
    const module = this.getModuleContract();
    return await module.getRemainingLimit(walletAddress);
  }

  /**
   * Get time until limit resets (in seconds)
   */
  async getTimeUntilReset(walletAddress: string): Promise<bigint> {
    const module = this.getModuleContract();
    return await module.getTimeUntilReset(walletAddress);
  }

  /**
   * Execute transaction below daily limit (bypasses approval requirement)
   */
  async executeBelowLimit(
    walletAddress: string,
    to: string,
    value: bigint
  ): Promise<string> {
    // Daily limit is for value transfers — zero-value calls should go through normal multisig flow
    if (value <= 0n) {
      throw new Error('Daily limit transactions must have a value greater than zero');
    }

    const signer = this.requireSigner();
    const normalizedTo = validateAddress(to);
    const module = this.getModuleContract(signer);
    const wallet = this.getWalletContract(walletAddress);

    // Check if module is enabled
    const isModuleEnabled = await wallet.isModuleEnabled(this.moduleAddress);
    if (!isModuleEnabled) {
      throw new Error('Daily limit module is not enabled for this wallet');
    }

    // Check wallet balance
    const walletBalance = await this.provider.getBalance(walletAddress);
    if (walletBalance < value) {
      throw new Error(`Insufficient balance: wallet has ${walletBalance.toString()}, trying to send ${value.toString()}`);
    }

    // Pre-validate: will throw with descriptive error if tx would revert
    await estimateGasOrThrow(
      module.executeBelowLimit,
      [walletAddress, normalizedTo, value],
      'execute below limit',
      module
    );

    let tx;
    try {
      tx = await module.executeBelowLimit(walletAddress, normalizedTo, value);
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
      throw new Error('Transaction reverted. Possible causes: exceeds daily limit, insufficient balance, or module not enabled.');
    }

    return receipt.hash;
  }

  /**
   * Check if a transaction can be executed via daily limit
   */
  async canExecuteViaDailyLimit(
    walletAddress: string,
    value: bigint
  ): Promise<{ canExecute: boolean; reason?: string }> {
    try {
      const wallet = this.getWalletContract(walletAddress);

      // Check if module is enabled
      const isModuleEnabled = await wallet.isModuleEnabled(CONTRACT_ADDRESSES.DAILY_LIMIT_MODULE);
      if (!isModuleEnabled) {
        return { canExecute: false, reason: 'Daily limit module not enabled' };
      }

      // Check if limit is configured
      const dailyLimit = await this.getDailyLimit(walletAddress);
      if (dailyLimit.limit === 0n) {
        return { canExecute: false, reason: 'Daily limit not configured' };
      }

      // Check remaining limit
      const remainingLimit = await this.getRemainingLimit(walletAddress);
      if (remainingLimit < value) {
        return {
          canExecute: false,
          reason: `Transaction value exceeds remaining daily limit of ${transactionBuilderService.formatValue(remainingLimit)} QUAI`,
        };
      }

      // Check wallet balance
      const walletBalance = await this.provider.getBalance(walletAddress);
      if (walletBalance < value) {
        return { canExecute: false, reason: 'Insufficient balance' };
      }

      return { canExecute: true };
    } catch (error) {
      return { canExecute: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
