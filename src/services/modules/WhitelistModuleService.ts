import { isAddress, getAddress } from 'quais';
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
import WhitelistModuleABI from '../../config/abi/WhitelistModule.json';

/**
 * Service for whitelist module operations
 *
 * IMPORTANT (H-2 Security Fix): Configuration functions (addToWhitelist, removeFromWhitelist,
 * batchAddToWhitelist) now require multisig approval. Use proposeAddToWhitelist(),
 * proposeRemoveFromWhitelist(), etc. to create multisig proposals. Execution functions
 * (executeToWhitelist) still work with single owner.
 */
export class WhitelistModuleService extends BaseModuleService {

  constructor(provider?: Provider, transactionService?: TransactionService) {
    super(provider, CONTRACT_ADDRESSES.WHITELIST_MODULE, WhitelistModuleABI, transactionService);
  }

  /**
   * Propose adding address to whitelist (requires multisig approval)
   * @returns Transaction hash for the multisig proposal
   */
  async proposeAddToWhitelist(
    walletAddress: string,
    address: string,
    limit: bigint
  ): Promise<string> {
    const normalizedAddress = validateAddress(address);
    return this.createModuleProposal(walletAddress, 'addToWhitelist', [walletAddress, normalizedAddress, limit]);
  }

  /**
   * Propose removing address from whitelist (requires multisig approval)
   * @returns Transaction hash for the multisig proposal
   */
  async proposeRemoveFromWhitelist(walletAddress: string, address: string): Promise<string> {
    const normalizedAddress = validateAddress(address);
    return this.createModuleProposal(walletAddress, 'removeFromWhitelist', [walletAddress, normalizedAddress]);
  }

  /**
   * Propose batch adding addresses to whitelist (requires multisig approval)
   * @returns Transaction hash for the multisig proposal
   */
  async proposeBatchAddToWhitelist(
    walletAddress: string,
    addresses: string[],
    limits: bigint[]
  ): Promise<string> {
    const normalizedAddresses = addresses.map(addr => validateAddress(addr));
    return this.createModuleProposal(walletAddress, 'batchAddToWhitelist', [walletAddress, normalizedAddresses, limits]);
  }

  /**
   * @deprecated Use proposeAddToWhitelist() instead - direct calls now require multisig approval (H-2 fix)
   */
  async addToWhitelist(
    _walletAddress: string,
    _address: string,
    _limit: bigint
  ): Promise<void> {
    this.throwDeprecationError('addToWhitelist', 'proposeAddToWhitelist');
  }

  /**
   * @deprecated Use proposeRemoveFromWhitelist() instead - direct calls now require multisig approval (H-2 fix)
   */
  async removeFromWhitelist(_walletAddress: string, _address: string): Promise<void> {
    this.throwDeprecationError('removeFromWhitelist', 'proposeRemoveFromWhitelist');
  }

  /**
   * Check if address is whitelisted
   */
  async isWhitelisted(walletAddress: string, address: string): Promise<boolean> {
    const module = this.getModuleContract();
    return await module.isWhitelisted(walletAddress, address);
  }

  /**
   * Get whitelist limit for an address
   */
  async getWhitelistLimit(walletAddress: string, address: string): Promise<bigint> {
    const module = this.getModuleContract();
    return await module.getWhitelistLimit(walletAddress, address);
  }

  /**
   * Execute a transaction to a whitelisted address without requiring approvals
   */
  async executeToWhitelist(
    walletAddress: string,
    to: string,
    value: bigint,
    data: string
  ): Promise<string> {
    const signer = this.requireSigner();
    const normalizedTo = validateAddress(to);
    const module = this.getModuleContract(signer);

    // Pre-validation: Check module is enabled first
    const wallet = this.getWalletContract(walletAddress);
    const isModuleEnabled = await wallet.isModuleEnabled(CONTRACT_ADDRESSES.WHITELIST_MODULE);
    if (!isModuleEnabled) {
      throw new Error('Whitelist module is not enabled for this wallet');
    }

    const isWhitelisted = await this.isWhitelisted(walletAddress, normalizedTo);
    if (!isWhitelisted) {
      throw new Error(`Address ${normalizedTo} is not whitelisted`);
    }

    const limit = await this.getWhitelistLimit(walletAddress, normalizedTo);
    if (limit > 0n && value > limit) {
      throw new Error(`Transaction value ${value.toString()} exceeds whitelist limit ${limit.toString()}`);
    }

    const walletBalance = await this.provider.getBalance(walletAddress);
    if (walletBalance < value) {
      throw new Error(`Insufficient balance: wallet has ${walletBalance.toString()}, trying to send ${value.toString()}`);
    }

    // Pre-validate: will throw with descriptive error if tx would revert
    await estimateGasOrThrow(
      module.executeToWhitelist,
      [walletAddress, normalizedTo, value, data],
      'execute to whitelist',
      module
    );

    let tx;
    try {
      tx = await module.executeToWhitelist(walletAddress, normalizedTo, value, data);
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
      throw new Error('Transaction reverted. Possible causes: insufficient balance or module not enabled.');
    }

    return receipt.hash;
  }

  /**
   * Check if a transaction can be executed via whitelist
   */
  async canExecuteViaWhitelist(
    walletAddress: string,
    to: string,
    value: bigint
  ): Promise<{ canExecute: boolean; reason?: string }> {
    try {
      if (!isAddress(to)) {
        return { canExecute: false, reason: 'Invalid address format' };
      }

      const normalizedTo = getAddress(to);
      const wallet = this.getWalletContract(walletAddress);

      const isModuleEnabled = await wallet.isModuleEnabled(CONTRACT_ADDRESSES.WHITELIST_MODULE);
      if (!isModuleEnabled) {
        return { canExecute: false, reason: 'Whitelist module not enabled' };
      }

      const isWhitelisted = await this.isWhitelisted(walletAddress, normalizedTo);
      if (!isWhitelisted) {
        return { canExecute: false, reason: 'Address not whitelisted' };
      }

      const limit = await this.getWhitelistLimit(walletAddress, normalizedTo);
      if (limit > 0n && value > limit) {
        return { canExecute: false, reason: `Value exceeds whitelist limit of ${limit.toString()}` };
      }

      const walletBalance = await this.provider.getBalance(walletAddress);
      if (walletBalance < value) {
        return { canExecute: false, reason: `Insufficient balance` };
      }

      return { canExecute: true };
    } catch (error) {
      return { canExecute: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get all whitelisted addresses by querying events
   */
  async getWhitelistedAddresses(walletAddress: string): Promise<Array<{ address: string; limit: bigint }>> {
    const module = this.getModuleContract();

    // Query AddressWhitelisted events
    const filter = module.filters.AddressWhitelisted(walletAddress);
    let events: any[] = [];

    try {
      events = await module.queryFilter(filter, EVENT_QUERY_RANGE, 'latest');
    } catch (error) {
      if (error.message?.includes('exceeds maximum limit')) {
        try {
          events = await module.queryFilter(filter, EVENT_QUERY_RANGE_FALLBACK, 'latest');
        } catch {
          events = [];
        }
      }
    }

    // Query removal events
    const removalFilter = module.filters.AddressRemovedFromWhitelist(walletAddress);
    let removalEvents: any[] = [];

    try {
      removalEvents = await module.queryFilter(removalFilter, EVENT_QUERY_RANGE, 'latest');
    } catch (error) {
      if (error.message?.includes('exceeds maximum limit')) {
        try {
          removalEvents = await module.queryFilter(removalFilter, EVENT_QUERY_RANGE_FALLBACK, 'latest');
        } catch {
          removalEvents = [];
        }
      }
    }

    // Build address map
    const addressMap = new Map<string, { limit: bigint; blockNumber: number }>();
    const removedAddresses = new Map<string, number>();

    for (const event of removalEvents) {
      if (event.args?.addr) {
        const addr = event.args.addr.toLowerCase();
        const existing = removedAddresses.get(addr);
        if (!existing || event.blockNumber > existing) {
          removedAddresses.set(addr, event.blockNumber);
        }
      }
    }

    for (const event of events) {
      if (event.args?.addr) {
        const addr = event.args.addr.toLowerCase();
        const removalBlock = removedAddresses.get(addr);

        if (!removalBlock || event.blockNumber > removalBlock) {
          const existing = addressMap.get(addr);
          if (!existing || event.blockNumber > existing.blockNumber) {
            addressMap.set(addr, { limit: event.args.limit || 0n, blockNumber: event.blockNumber });
          }
        }
      }
    }

    // Verify on-chain status in batches to avoid overwhelming the RPC provider
    const result: Array<{ address: string; limit: bigint }> = [];
    const BATCH_SIZE = 5;
    const entries = Array.from(addressMap.entries());

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async ([address]) => {
          try {
            const isStillWhitelisted = await this.isWhitelisted(walletAddress, address);
            if (isStillWhitelisted) {
              const currentLimit = await this.getWhitelistLimit(walletAddress, address);
              return { address, limit: currentLimit };
            }
          } catch (error) {
            // Skip addresses that fail on-chain verification rather than adding stale data.
            console.debug(`Whitelist verification failed for ${address}:`, error instanceof Error ? error.message : 'Unknown');
          }
          return null;
        })
      );
      for (const entry of batchResults) {
        if (entry) result.push(entry);
      }
    }

    return result;
  }
}
