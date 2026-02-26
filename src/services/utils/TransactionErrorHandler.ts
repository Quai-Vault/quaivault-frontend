import { AbiCoder, isQuaiAddress, getAddress } from 'quais';
import type { Contract } from '../../types';

/**
 * Transaction error handler utility
 * Provides reusable error decoding and messaging for blockchain transactions
 */

/**
 * Safely cast error to an object with optional error properties
 * Prevents runtime errors from invalid error objects
 */
function safeErrorObject(error: unknown): { code?: string | number; message?: string; reason?: string; data?: string } {
  if (error === null || error === undefined) {
    return {};
  }
  if (typeof error === 'object') {
    return error as { code?: string | number; message?: string; reason?: string; data?: string };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  return {};
}

/**
 * Sanitize error message to remove potentially sensitive blockchain data
 * while keeping it informative for users
 */
function sanitizeErrorMessage(message: string): string {
  // Remove hex data that might be in error messages (contract state, etc.)
  let sanitized = message.replace(/0x[a-fA-F0-9]{40,}/g, '[address]');

  // Remove very long hex strings that might be calldata
  sanitized = sanitized.replace(/0x[a-fA-F0-9]{64,}/g, '[data]');

  // Truncate very long messages
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200) + '...';
  }

  return sanitized;
}

/**
 * Check if an error indicates user rejection
 */
export function isUserRejection(error: unknown): boolean {
  const errObj = safeErrorObject(error);
  if (errObj.code === 'ACTION_REJECTED' || errObj.code === 4001) {
    return true;
  }
  if (errObj.message) {
    const message = errObj.message.toLowerCase();
    return message.includes('rejected') ||
           message.includes('denied') ||
           message.includes('cancelled');
  }
  return false;
}

/**
 * Decode error data using contract interface
 */
export function decodeErrorData(contract: Contract, errorData: string): string | null {
  if (!errorData || errorData === '0x') {
    return null;
  }

  try {
    const decoded = contract.interface.parseError(errorData);
    if (decoded) {
      if (decoded.name === 'Error' && decoded.args && decoded.args.length > 0) {
        return decoded.args[0].toString();
      }
      let message = decoded.name;
      if (decoded.args && decoded.args.length > 0) {
        message += ` - ${decoded.args.map((arg: unknown) => String(arg)).join(', ')}`;
      }
      return message;
    }
  } catch {
    // Try to decode as a plain string error message
    if (errorData.length > 138) {
      try {
        const errorString = AbiCoder.defaultAbiCoder().decode(
          ['string'],
          '0x' + errorData.slice(138)
        )[0];
        if (errorString) {
          return errorString;
        }
      } catch {
        // Decoding failed
      }
    }
  }

  return null;
}

/**
 * Extract error message from various error formats
 * Returns a sanitized message safe for display to users
 */
export function extractErrorMessage(error: unknown, contract?: Contract): string {
  const errObj = safeErrorObject(error);

  // Check for explicit reason
  if (errObj.reason) {
    return sanitizeErrorMessage(errObj.reason);
  }

  // Try to decode error data
  if (errObj.data && contract) {
    const decoded = decodeErrorData(contract, errObj.data);
    if (decoded) {
      return sanitizeErrorMessage(decoded);
    }
  }

  // Fall back to message
  if (errObj.message) {
    return sanitizeErrorMessage(errObj.message);
  }

  return 'Unknown error';
}

/**
 * Format error for user display with context
 */
export function formatTransactionError(
  error: unknown,
  operation: string,
  contract?: Contract
): Error {
  if (isUserRejection(error)) {
    return new Error('Transaction was rejected by user');
  }

  const message = extractErrorMessage(error, contract);
  return new Error(`${operation}: ${message}`);
}

/**
 * Check receipt status and throw if reverted
 */
export function checkReceiptStatus(
  receipt: unknown,
  operation: string,
  additionalContext?: string
): void {
  if (receipt !== null && typeof receipt === 'object' && 'status' in receipt && receipt.status === 0) {
    const context = additionalContext ? ` ${additionalContext}` : '';
    throw new Error(`${operation} reverted.${context}`);
  }
}

/**
 * Common transaction state error messages
 */
export const TransactionErrors = {
  NOT_OWNER: 'Only wallet owners can perform this action',
  TX_NOT_FOUND: 'Transaction does not exist',
  TX_ALREADY_EXECUTED: 'Transaction has already been executed',
  TX_CANCELLED: 'Transaction has been cancelled',
  NOT_ENOUGH_APPROVALS: (current: number, required: number) =>
    `Not enough approvals: ${current} / ${required} required`,
  ALREADY_APPROVED: 'You have already approved this transaction',
  NOT_APPROVED: 'You have not approved this transaction',
  SIGNER_NOT_SET: 'Signer not set. Connect wallet first.',
  INVALID_ADDRESS: (addr: string) => `Invalid address format: ${addr}`,
  INVALID_HASH_LENGTH: (length: number) =>
    `Invalid transaction hash length: ${length} (expected 66)`,
} as const;

/**
 * Validate transaction hash format
 */
export function validateTxHash(txHash: string): string {
  let normalized = txHash;
  if (!normalized.startsWith('0x')) {
    normalized = '0x' + normalized;
  }
  if (normalized.length !== 66) {
    throw new Error(TransactionErrors.INVALID_HASH_LENGTH(normalized.length));
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`Invalid transaction hash format: contains non-hex characters`);
  }
  return normalized;
}

/**
 * Validate address format using quais
 */
export function validateAddress(address: string): string {
  const trimmed = address.trim();

  if (trimmed.length !== 42) {
    throw new Error(
      `Invalid address length: expected 42 characters, got ${trimmed.length}. ` +
      `Addresses must be 0x followed by exactly 40 hex characters.`
    );
  }

  if (!isQuaiAddress(trimmed)) {
    throw new Error(
      `Invalid Quai address format: "${trimmed}". ` +
      `Must be a valid Quai Network address (0x + 40 hex characters with valid shard prefix).`
    );
  }

  try {
    return getAddress(trimmed);
  } catch (error) {
    throw new Error(
      `Invalid address format: "${trimmed}". ` +
      `${error instanceof Error ? error.message : 'Address validation failed'}`
    );
  }
}
