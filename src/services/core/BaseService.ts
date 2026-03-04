import { Contract as QuaisContract } from 'quais';
import type { Contract, Signer, Provider } from '../../types';
import QuaiVaultABI from '../../config/abi/QuaiVault.json';

/**
 * Base service class providing common functionality for all services.
 *
 * Provider strategy:
 * - Starts with null provider (no wallet connected).
 * - When a signer is set, this.provider is updated to the signer's BrowserProvider.
 * - When the signer is cleared, this.provider reverts to null (or the explicit
 *   provider passed to the constructor, if any).
 * - Use requireProvider() before any read operation to fail fast when disconnected.
 */
export class BaseService {
  protected provider: Provider | null = null;
  protected signer: Signer | null = null;
  private readonly defaultProvider: Provider | null;

  constructor(provider?: Provider) {
    this.defaultProvider = provider || null;
    this.provider = this.defaultProvider;
  }

  /**
   * Set signer for signing transactions.
   * Also updates this.provider to the signer's BrowserProvider so that
   * read operations go through the wallet's RPC connection.
   */
  setSigner(signer: Signer | null): void {
    this.signer = signer;
    this.provider = (signer?.provider as Provider) || this.defaultProvider;
  }

  /**
   * Get provider (may be null if no wallet connected)
   */
  getProvider(): Provider | null {
    return this.provider;
  }

  /**
   * Get signer (throws if not set)
   */
  protected requireSigner(): Signer {
    if (!this.signer) {
      throw new Error('Signer not set. Connect wallet first.');
    }
    return this.signer;
  }

  /**
   * Get provider (throws if not set)
   */
  protected requireProvider(): Provider {
    if (!this.provider) {
      throw new Error('No provider available. Connect wallet first.');
    }
    return this.provider;
  }

  /**
   * Get wallet contract instance
   */
  protected getWalletContract(walletAddress: string, signerOrProvider?: Signer | Provider): Contract {
    return new QuaisContract(
      walletAddress,
      QuaiVaultABI.abi,
      signerOrProvider || this.requireProvider()
    ) as Contract;
  }
}
