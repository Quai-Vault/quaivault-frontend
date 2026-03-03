import { Contract as QuaisContract } from 'quais';
import type { Contract, Signer, Provider } from '../../types';
import { sharedProvider } from '../../config/provider';
import QuaiVaultABI from '../../config/abi/QuaiVault.json';

/**
 * Base service class providing common functionality for all services.
 *
 * Provider strategy:
 * - When a signer is set, this.provider is updated to the signer's BrowserProvider
 *   (routes reads through the wallet extension's own RPC, works even if the
 *   public RPC is down).
 * - When the signer is cleared, this.provider reverts to sharedProvider.
 */
export class BaseService {
  protected provider: Provider;
  protected signer: Signer | null = null;
  private readonly defaultProvider: Provider;

  constructor(provider?: Provider) {
    this.defaultProvider = provider || sharedProvider;
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
   * Get provider
   */
  getProvider(): Provider {
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
   * Get wallet contract instance
   */
  protected getWalletContract(walletAddress: string, signerOrProvider?: Signer | Provider): Contract {
    return new QuaisContract(
      walletAddress,
      QuaiVaultABI.abi,
      signerOrProvider || this.provider
    ) as Contract;
  }
}
