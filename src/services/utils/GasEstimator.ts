import type { Contract } from '../../types';
import { extractErrorMessage } from './TransactionErrorHandler';

/**
 * Pre-validation utility for contract calls.
 * Simulates the transaction to catch revert errors before prompting the user to sign.
 * Gas limits are handled automatically by quais and the Pelagus wallet.
 */

/**
 * Simulate a contract call and throw a user-friendly error if it would revert.
 * Use this for pre-validation before sending transactions.
 */
export async function estimateGasOrThrow(
  contractMethod: { estimateGas: (...args: any[]) => Promise<bigint> },
  args: any[],
  operation: string,
  contract?: Contract
): Promise<bigint> {
  try {
    const estimated = await contractMethod.estimateGas(...args);
    return estimated;
  } catch (error) {
    const message = extractErrorMessage(error, contract);
    throw new Error(`Cannot ${operation}: ${message}`);
  }
}
