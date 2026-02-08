import { Contract, ZeroAddress, Interface, keccak256, AbiCoder, isQuaiAddress } from 'quais';
import type { Signer, Provider } from '../../types';
import type { WalletInfo, DeploymentConfig } from '../../types';
import { CONTRACT_ADDRESSES } from '../../config/contracts';
import { BaseService } from './BaseService';

import QuaiVaultABI from '../../config/abi/QuaiVault.json';
import QuaiVaultFactoryABI from '../../config/abi/QuaiVaultFactory.json';
import QuaiVaultProxyABI from '../../config/abi/QuaiVaultProxy.json';

/**
 * Service for core wallet operations
 * Handles wallet deployment, info retrieval, and factory interactions
 */
export class WalletService extends BaseService {
  private factoryContract: Contract;

  constructor(provider?: Provider) {
    super(provider);
    this.factoryContract = new Contract(
      CONTRACT_ADDRESSES.QUAIVAULT_FACTORY,
      QuaiVaultFactoryABI.abi,
      this.provider
    );
  }

  /**
   * Override setSigner to also update factory contract
   */
  setSigner(signer: Signer | null): void {
    super.setSigner(signer);
    if (signer) {
      this.factoryContract = this.factoryContract.connect(signer) as Contract;
    } else {
      this.factoryContract = new Contract(
        CONTRACT_ADDRESSES.QUAIVAULT_FACTORY,
        QuaiVaultFactoryABI.abi,
        this.provider
      );
    }
  }

  /**
   * Get the implementation address from the factory
   */
  async getImplementationAddress(): Promise<string> {
    return await this.factoryContract.implementation();
  }

  /**
   * Verify factory configuration
   */
  async verifyFactoryConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const implAddress = await this.getImplementationAddress();

      if (!implAddress || implAddress === ZeroAddress) {
        errors.push('Implementation address is not set');
      } else {
        const code = await this.provider.getCode(implAddress);
        if (code === '0x') {
          errors.push(`Implementation contract at ${implAddress} has no code`);
        }
      }
    } catch (error) {
      errors.push('Failed to verify factory configuration: ' +
        (error instanceof Error ? error.message : 'Unknown error'));
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Deploy a new QuaiVault via factory CREATE2 (single transaction).
   * Mines a salt first to produce a valid shard-prefixed Quai address.
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
    const signer = this.requireSigner();

    if (!config) {
      throw new Error('Deployment config is required');
    }

    const { owners, threshold } = config;

    // Validate inputs
    if (!owners || !Array.isArray(owners)) {
      throw new Error('Owners must be an array');
    }
    if (owners.length === 0) {
      throw new Error('At least one owner is required');
    }
    for (const owner of owners) {
      if (!isQuaiAddress(owner)) {
        throw new Error(`Invalid owner address: ${owner}`);
      }
    }
    if (threshold === undefined || threshold === null || !Number.isInteger(threshold) || threshold < 1 || threshold > owners.length) {
      throw new Error(`Invalid threshold: ${threshold} (must be an integer between 1 and ${owners.length})`);
    }

    try {
      // Step 1: Mine for a valid CREATE2 salt
      onProgress?.({ step: 'mining', message: 'Mining for a valid wallet address...' });

      const signerAddress = await signer.getAddress();
      const { salt, expectedAddress } = await this.mineSalt(
        signerAddress,
        owners,
        threshold,
        (attempts) => {
          onProgress?.({
            step: 'mining',
            miningAttempts: attempts,
            message: `Mining for a valid wallet address... (${attempts.toLocaleString()} attempts)`,
          });
        }
      );

      onProgress?.({
        step: 'mining',
        expectedAddress,
        message: `Found valid address: ${expectedAddress}`,
      });

      // Step 2: Create wallet via factory (single transaction)
      onProgress?.({
        step: 'deploying',
        expectedAddress,
        message: 'Please approve the transaction in your wallet',
      });

      const tx = await this.factoryContract.createWallet(owners, threshold, salt);
      const txHash = tx.hash;

      onProgress?.({
        step: 'deploying_waiting',
        txHash,
        expectedAddress,
        message: 'Waiting for transaction confirmation...',
      });

      const receipt = await tx.wait();

      if (receipt?.status !== 1) {
        throw new Error('Transaction failed');
      }

      // Parse WalletCreated event to get the actual address
      const walletAddress = this.extractWalletAddressFromReceipt(receipt);

      onProgress?.({
        step: 'success',
        txHash,
        walletAddress,
        message: 'Wallet created successfully!',
      });

      return walletAddress;
    } catch (error) {
      console.error('Deployment error:', error instanceof Error ? error.message : 'Unknown error');

      const ethersError = error as { code?: string; reason?: string; message?: string };
      if (ethersError.code === 'CALL_EXCEPTION') {
        throw new Error('Deployment failed: ' + (ethersError.reason || ethersError.message || 'Unknown error'));
      }
      throw error;
    }
  }

  /**
   * Mine for a CREATE2 salt that produces a valid Quai address on the sender's shard.
   * Runs in a Web Worker to avoid blocking the UI thread.
   *
   * The factory computes: fullSalt = keccak256(abi.encodePacked(msg.sender, userSalt))
   * Then deploys via CREATE2 with that fullSalt.
   */
  private async mineSalt(
    senderAddress: string,
    owners: string[],
    threshold: number,
    onProgress?: (attempts: number) => void
  ): Promise<{ salt: string; expectedAddress: string }> {
    const MAX_ATTEMPTS = 100_000;
    const factoryAddress = CONTRACT_ADDRESSES.QUAIVAULT_FACTORY;
    const implementation = CONTRACT_ADDRESSES.QUAIVAULT_IMPLEMENTATION;

    // Derive target prefix from sender's address (same shard)
    const targetPrefix = senderAddress.substring(0, 4).toLowerCase();

    // Compute initData exactly as the factory does
    const vaultIface = new Interface(QuaiVaultABI.abi);
    const initData = vaultIface.encodeFunctionData('initialize', [owners, threshold]);

    // Compute the full bytecode hash (proxy creation code + constructor args)
    const encodedArgs = AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes'],
      [implementation, initData]
    );
    const fullBytecode = QuaiVaultProxyABI.bytecode + encodedArgs.slice(2);
    const bytecodeHash = keccak256(fullBytecode);

    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL('./saltMiner.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          onProgress?.(msg.attempts);
        } else if (msg.type === 'result') {
          worker.terminate();
          resolve({ salt: msg.salt, expectedAddress: msg.expectedAddress });
        } else if (msg.type === 'error') {
          worker.terminate();
          reject(new Error(msg.message));
        }
      };

      worker.onerror = (error) => {
        worker.terminate();
        reject(new Error(`Salt mining worker error: ${error.message}`));
      };

      worker.postMessage({
        factoryAddress,
        bytecodeHash,
        senderAddress,
        targetPrefix,
        maxAttempts: MAX_ATTEMPTS,
      });
    });
  }

  /**
   * Get wallet information
   */
  async getWalletInfo(walletAddress: string): Promise<WalletInfo> {
    const wallet = this.getWalletContract(walletAddress);

    const [owners, threshold, balance] = await Promise.all([
      wallet.getOwners(),
      wallet.threshold(),
      this.provider.getBalance(walletAddress),
    ]);

    return {
      address: walletAddress,
      owners: Array.from(owners).map(address => String(address)),
      threshold: Number(threshold),
      balance: balance.toString(),
    };
  }

  /**
   * Get all wallets for an owner address
   */
  async getWalletsForOwner(ownerAddress: string): Promise<string[]> {
    const wallets = await this.factoryContract.getWalletsByCreator(ownerAddress);
    return Array.from(wallets).map(address => String(address));
  }

  /**
   * Check if an address is an owner of the wallet
   */
  async isOwner(walletAddress: string, address: string): Promise<boolean> {
    const wallet = this.getWalletContract(walletAddress);
    return await wallet.isOwner(address);
  }

  /**
   * Check if a module is enabled
   */
  async isModuleEnabled(walletAddress: string, moduleAddress: string): Promise<boolean> {
    const wallet = this.getWalletContract(walletAddress);
    return await wallet.isModuleEnabled(moduleAddress);
  }

  /**
   * Get the balance of a wallet address
   */
  async getBalance(walletAddress: string): Promise<bigint> {
    return await this.provider.getBalance(walletAddress);
  }

  /**
   * Get factory contract (for use by other services)
   */
  getFactoryContract(): Contract {
    return this.factoryContract;
  }

  /**
   * Extract wallet address from deployment receipt
   */
  extractWalletAddressFromReceipt(receipt: { logs: Array<{ topics: string[]; data: string; address?: string }> }): string {
    const event = receipt.logs.find((log: { topics: string[]; data: string; address?: string }) => {
      try {
        const parsed = this.factoryContract.interface.parseLog(log);
        return parsed?.name === 'WalletCreated';
      } catch {
        return false;
      }
    });

    if (!event) {
      throw new Error('Wallet creation event not found');
    }

    const parsedEvent = this.factoryContract.interface.parseLog(event);
    const walletAddress = parsedEvent?.args.wallet;

    if (!walletAddress) {
      throw new Error('Failed to get wallet address from event');
    }

    return walletAddress;
  }
}
