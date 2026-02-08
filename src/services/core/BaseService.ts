import { JsonRpcProvider, Contract as QuaisContract } from 'quais';
import type { Contract, Signer, Provider } from '../../types';
import { NETWORK_CONFIG } from '../../config/contracts';
import QuaiVaultABI from '../../config/abi/QuaiVault.json';

/**
 * Base service class providing common functionality for all services
 */
export class BaseService {
  protected provider: Provider;
  protected signer: Signer | null = null;

  constructor(provider?: Provider) {
    this.provider = provider || new JsonRpcProvider(
      NETWORK_CONFIG.RPC_URL,
      undefined,
      { usePathing: true }
    );
  }

  /**
   * Set signer for signing transactions
   */
  setSigner(signer: Signer | null): void {
    this.signer = signer;
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
