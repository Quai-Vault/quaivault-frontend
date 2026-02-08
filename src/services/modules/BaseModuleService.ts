import { Contract as QuaisContract, Interface } from 'quais';
import type { Contract, Signer, Provider } from '../../types';
import { BaseService } from '../core/BaseService';
import { TransactionService } from '../core/TransactionService';

/**
 * Base service class for all module services
 * Provides common functionality for module operations including:
 * - Contract instance creation
 * - ABI management
 * - Proposal creation for multisig-controlled configuration
 */
export abstract class BaseModuleService extends BaseService {
  protected readonly moduleAddress: string;
  protected readonly moduleAbi: any;
  private transactionService?: TransactionService;

  constructor(provider: Provider | undefined, moduleAddress: string, moduleAbi: any, transactionService?: TransactionService) {
    super(provider);
    this.moduleAddress = moduleAddress;
    // Handle both array and { abi: [...] } formats
    this.moduleAbi = Array.isArray(moduleAbi) ? moduleAbi : moduleAbi.abi;
    this.transactionService = transactionService;
  }

  /**
   * Get module contract instance
   */
  protected getModuleContract(signerOrProvider?: Signer | Provider): Contract {
    return new QuaisContract(
      this.moduleAddress,
      this.moduleAbi,
      signerOrProvider || this.provider
    ) as Contract;
  }

  /**
   * Get module ABI for encoding function calls
   */
  protected getModuleAbi(): any[] {
    return this.moduleAbi;
  }

  /**
   * Create a multisig proposal to call a module function
   * This is the standard pattern for H-2 security fix: module configuration
   * requires multisig approval, so we create proposals instead of direct calls
   *
   * @param walletAddress - The multisig wallet address
   * @param functionName - The module function to call
   * @param args - Arguments for the function
   * @returns Transaction hash for the multisig proposal
   */
  protected async createModuleProposal(
    walletAddress: string,
    functionName: string,
    args: any[]
  ): Promise<string> {
    const signer = this.requireSigner();
    let txService = this.transactionService;
    if (!txService) {
      txService = new TransactionService(this.provider);
    }
    txService.setSigner(signer);

    // Encode the function call
    const iface = new Interface(this.moduleAbi);
    const data = iface.encodeFunctionData(functionName, args);

    // Propose through multisig
    return txService.proposeTransaction(
      walletAddress,
      this.moduleAddress,
      0n,
      data
    );
  }

  /**
   * Helper to throw deprecation error for direct calls that now require multisig
   * Used for H-2 security fix: configuration methods are now proposal-based
   *
   * @param methodName - The deprecated method name
   * @param newMethodName - The new proposal method to use instead
   */
  protected throwDeprecationError(methodName: string, newMethodName: string): never {
    throw new Error(
      `Direct ${methodName} calls are no longer supported. ` +
      `Use ${newMethodName}() to create a multisig proposal.`
    );
  }
}
