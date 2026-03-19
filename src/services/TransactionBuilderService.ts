import { formatQuai, parseQuai, Interface } from 'quais';
import QuaiVaultABI from '../config/abi/QuaiVault.json';

// Hoisted — reuse across calls
const quaiVaultInterface = new Interface(QuaiVaultABI.abi);

export class TransactionBuilderService {
  /**
   * Parse transaction value from string
   */
  parseValue(value: string): bigint {
    try {
      // Normalize leading decimal (e.g. ".01" → "0.01") for parseQuai compatibility
      let normalized = value.trim();
      if (normalized.startsWith('.')) {
        normalized = '0' + normalized;
      }
      return parseQuai(normalized);
    } catch (error) {
      throw new Error(`Invalid value format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Format value for display
   */
  formatValue(value: bigint, decimals: number = 4): string {
    return parseFloat(formatQuai(value)).toFixed(decimals);
  }

  /**
   * Build calldata for cancelByConsensus self-call (post-approval consensus cancel)
   */
  buildCancelByConsensus(txHash: string): string {
    return quaiVaultInterface.encodeFunctionData('cancelByConsensus', [txHash]);
  }

  /**
   * Build calldata for setMinExecutionDelay self-call
   */
  buildSetMinExecutionDelay(delaySeconds: number): string {
    if (!Number.isFinite(delaySeconds) || delaySeconds < 0 || delaySeconds > 4294967295) {
      throw new Error(`Invalid delay: must be 0–4294967295 seconds (got ${delaySeconds})`);
    }
    return quaiVaultInterface.encodeFunctionData('setMinExecutionDelay', [Math.floor(delaySeconds)]);
  }

  /**
   * Build calldata for addDelegatecallTarget self-call
   */
  buildAddDelegatecallTarget(target: string): string {
    return quaiVaultInterface.encodeFunctionData('addDelegatecallTarget', [target]);
  }

  /**
   * Build calldata for removeDelegatecallTarget self-call
   */
  buildRemoveDelegatecallTarget(target: string): string {
    return quaiVaultInterface.encodeFunctionData('removeDelegatecallTarget', [target]);
  }

  /**
   * Build calldata for signMessage self-call (EIP-1271)
   */
  buildSignMessage(data: string): string {
    return quaiVaultInterface.encodeFunctionData('signMessage', [data]);
  }

  /**
   * Build calldata for unsignMessage self-call (EIP-1271)
   */
  buildUnsignMessage(data: string): string {
    return quaiVaultInterface.encodeFunctionData('unsignMessage', [data]);
  }
}

// Singleton instance
export const transactionBuilderService = new TransactionBuilderService();
