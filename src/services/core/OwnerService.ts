import type { Contract, Provider, Signer } from '../../types';
import { BaseService } from './BaseService';
import { TransactionService } from './TransactionService';
import { validateAddress } from '../utils/TransactionErrorHandler';

/**
 * Service for owner and module management
 * Handles addOwner, removeOwner, changeThreshold, enableModule, disableModule
 *
 * Note: These operations require multisig approval, so they create proposals
 */
export class OwnerService extends BaseService {
  private transactionService: TransactionService;

  constructor(provider?: Provider, transactionService?: TransactionService) {
    super(provider);
    this.transactionService = transactionService || new TransactionService(provider);
  }

  /**
   * Sync signer with transaction service
   */
  setSigner(signer: Signer | null): void {
    super.setSigner(signer);
    this.transactionService.setSigner(signer);
  }

  /**
   * Add a new owner to the wallet
   * @returns Transaction hash of the proposed transaction
   */
  async addOwner(walletAddress: string, newOwner: string): Promise<string> {
    this.requireSigner();

    const normalizedOwner = validateAddress(newOwner);
    const wallet = this.getWalletContract(walletAddress);

    // Check if already an owner
    const isAlreadyOwner = await wallet.isOwner(normalizedOwner);
    if (isAlreadyOwner) {
      throw new Error('Address is already an owner');
    }

    // Check for pending addOwner transaction
    await this.checkPendingAddOwner(walletAddress, normalizedOwner, wallet);

    // Encode addOwner function call
    const data = wallet.interface.encodeFunctionData('addOwner', [normalizedOwner]);

    // Propose transaction to wallet itself (self-call)
    return this.transactionService.proposeTransaction(walletAddress, walletAddress, 0n, data);
  }

  /**
   * Remove an owner from the wallet
   * @returns Transaction hash of the proposed transaction
   */
  async removeOwner(walletAddress: string, owner: string): Promise<string> {
    this.requireSigner();

    const normalizedOwner = validateAddress(owner);
    const wallet = this.getWalletContract(walletAddress);

    // Validate owner exists and threshold constraint
    const [isOwner, owners, threshold] = await Promise.all([
      wallet.isOwner(normalizedOwner),
      wallet.getOwners(),
      wallet.threshold(),
    ]);

    if (!isOwner) {
      throw new Error('Address is not an owner');
    }

    const currentOwnerCount = owners.length;
    const newOwnerCount = currentOwnerCount - 1;
    const currentThreshold = Number(threshold);

    if (newOwnerCount < currentThreshold) {
      throw new Error(
        `Cannot remove owner: would reduce owners to ${newOwnerCount}, but threshold is ${currentThreshold}. ` +
        `Lower the threshold first (to ${newOwnerCount} or less) or add more owners.`
      );
    }

    // Encode removeOwner function call
    const data = wallet.interface.encodeFunctionData('removeOwner', [normalizedOwner]);

    return this.transactionService.proposeTransaction(walletAddress, walletAddress, 0n, data);
  }

  /**
   * Change the approval threshold
   * @returns Transaction hash of the proposed transaction
   */
  async changeThreshold(walletAddress: string, newThreshold: number): Promise<string> {
    this.requireSigner();

    if (newThreshold < 1) {
      throw new Error('Threshold must be at least 1');
    }

    const wallet = this.getWalletContract(walletAddress);
    const owners = await wallet.getOwners();

    if (newThreshold > owners.length) {
      throw new Error(`Threshold cannot exceed number of owners (${owners.length})`);
    }

    // Encode changeThreshold function call
    const data = wallet.interface.encodeFunctionData('changeThreshold', [newThreshold]);

    return this.transactionService.proposeTransaction(walletAddress, walletAddress, 0n, data);
  }

  /**
   * Enable a module
   * @returns Transaction hash of the proposed transaction
   */
  async enableModule(walletAddress: string, moduleAddress: string): Promise<string> {
    this.requireSigner();

    const normalizedModule = validateAddress(moduleAddress);
    const wallet = this.getWalletContract(walletAddress);

    // Check if module is already enabled
    const isEnabled = await wallet.isModuleEnabled(normalizedModule);
    if (isEnabled) {
      throw new Error('Module is already enabled');
    }

    // Encode enableModule function call
    const data = wallet.interface.encodeFunctionData('enableModule', [normalizedModule]);

    return this.transactionService.proposeTransaction(walletAddress, walletAddress, 0n, data);
  }

  /**
   * Disable a module
   * @returns Transaction hash of the proposed transaction
   */
  async disableModule(walletAddress: string, moduleAddress: string): Promise<string> {
    this.requireSigner();

    const normalizedModule = validateAddress(moduleAddress);
    const wallet = this.getWalletContract(walletAddress);

    // Check if module is enabled
    const isEnabled = await wallet.isModuleEnabled(normalizedModule);
    if (!isEnabled) {
      throw new Error('Module is not enabled');
    }

    // Block if there's already a pending disableModule proposal
    await this.checkPendingDisableModule(walletAddress, wallet);

    // Find previous module in linked list for Zodiac disableModule(prevModule, module)
    const prevModule = await this.findPrevModule(wallet, normalizedModule);

    // Encode disableModule function call
    const data = wallet.interface.encodeFunctionData('disableModule', [prevModule, normalizedModule]);

    return this.transactionService.proposeTransaction(walletAddress, walletAddress, 0n, data);
  }

  // ============ Private Helper Methods ============

  /**
   * Find the previous module in the Zodiac linked list
   * Required for disableModule(prevModule, module) call
   */
  private async findPrevModule(wallet: Contract, moduleAddress: string): Promise<string> {
    const SENTINEL = '0x0000000000000000000000000000000000000001';
    const modules: string[] = Array.from(await wallet.getModules()).map(String);
    const idx = modules.findIndex(
      (a: string) => a.toLowerCase() === moduleAddress.toLowerCase()
    );
    if (idx === -1) {
      throw new Error('Module not found in enabled module list');
    }
    return idx === 0 ? SENTINEL : modules[idx - 1];
  }

  /**
   * Check for pending disableModule transaction
   * Only one disableModule can be pending at a time because the linked-list
   * prevModule argument becomes stale when another module is disabled first.
   */
  private async checkPendingDisableModule(
    walletAddress: string,
    wallet: Contract
  ): Promise<void> {
    try {
      const pendingTxs = await this.transactionService.getPendingTransactions(walletAddress);
      const disableModuleFn = wallet.interface.getFunction('disableModule');
      if (!disableModuleFn) return; // ABI doesn't include this function
      const disableModuleSelector = disableModuleFn.selector;

      for (const tx of pendingTxs) {
        if (
          tx.to.toLowerCase() === walletAddress.toLowerCase() &&
          tx.data.startsWith(disableModuleSelector)
        ) {
          // Decode to get the module being disabled for a helpful message
          try {
            const decoded = wallet.interface.decodeFunctionData('disableModule', tx.data);
            const pendingModule = decoded[1]; // second arg is the module address
            const shortModule = `${String(pendingModule).slice(0, 6)}...${String(pendingModule).slice(-4)}`;
            throw new Error(
              `A module disable proposal is already pending (module: ${shortModule}). ` +
              `Execute or cancel it before proposing another module disable, ` +
              `as the linked-list order may change.`
            );
          } catch (e) {
            if (e instanceof Error && e.message.includes('already pending')) {
              throw e;
            }
            // Decoding failed but selector matched - still block it
            throw new Error(
              `A module disable proposal is already pending. ` +
              `Execute or cancel it before proposing another module disable.`
            );
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message?.includes('already pending')) {
        throw error;
      }
      // If we can't check pending transactions, allow the proposal to proceed
    }
  }

  /**
   * Check for pending addOwner transaction for this address
   */
  private async checkPendingAddOwner(
    walletAddress: string,
    normalizedOwner: string,
    wallet: Contract
  ): Promise<void> {
    try {
      const pendingTxs = await this.transactionService.getPendingTransactions(walletAddress);
      const addOwnerFn = wallet.interface.getFunction('addOwner');
      if (!addOwnerFn) return; // ABI doesn't include this function
      const addOwnerSelector = addOwnerFn.selector;

      for (const tx of pendingTxs) {
        if (
          tx.to.toLowerCase() === walletAddress.toLowerCase() &&
          tx.data.startsWith(addOwnerSelector)
        ) {
          let decoded;
          try {
            decoded = wallet.interface.decodeFunctionData('addOwner', tx.data);
          } catch {
            // Decoding failed, skip this transaction
            continue;
          }
          const pendingOwner = decoded[0];
          if (pendingOwner.toLowerCase() === normalizedOwner.toLowerCase()) {
            throw new Error(
              `A transaction to add ${normalizedOwner} is already pending. ` +
              `Transaction hash: ${tx.hash.slice(0, 10)}...`
            );
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message?.includes('already pending')) {
        throw error;
      }
      // Continue - no pending transaction found
    }
  }
}
