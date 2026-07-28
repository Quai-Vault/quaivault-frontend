/**
 * Utility functions for user-friendly error messages
 */

export interface ErrorInfo {
  message: string;
  title?: string;
  suggestion?: string;
  code?: string;
}

/**
 * Parse blockchain error and return user-friendly message
 */
export function parseError(error: unknown): ErrorInfo {
  // Guard against null/undefined/primitive input
  if (!error || typeof error !== 'object') {
    return {
      message: typeof error === 'string' ? error : 'An unexpected error occurred',
      title: 'Error',
      suggestion: 'Please try again. If the problem persists, check your connection and wallet settings.',
    };
  }

  // Past the guard this is an object of unknown shape. Probe the fields that
  // wallets and RPC layers actually set rather than typing it as `any`.
  const err = error as {
    code?: string | number;
    message?: string;
    reason?: string;
    shortMessage?: string;
  };

  // User rejection
  if (
    err.code === 'ACTION_REJECTED' ||
    err.code === 4001 ||
    (err.message && (
      err.message.includes('rejected') ||
      err.message.includes('denied') ||
      err.message.includes('cancelled') ||
      err.message.includes('User rejected')
    ))
  ) {
    return {
      message: 'Transaction was cancelled',
      title: 'Transaction Cancelled',
      suggestion: 'You cancelled the transaction in your wallet. No changes were made.',
    };
  }

  // Insufficient funds
  if (
    err.message?.includes('insufficient funds') ||
    err.message?.includes('insufficient balance') ||
    err.code === 'INSUFFICIENT_FUNDS'
  ) {
    return {
      message: 'Insufficient funds for this transaction',
      title: 'Insufficient Funds',
      suggestion: 'Make sure you have enough QUAI in your wallet to cover the transaction amount and gas fees.',
      code: 'INSUFFICIENT_FUNDS',
    };
  }

  // Gas estimation failed — use specific patterns to avoid false positives
  if (
    err.message?.includes('cannot estimate gas') ||
    err.message?.includes('gas required exceeds') ||
    err.message?.includes('out of gas') ||
    err.message?.includes('execution reverted') ||
    err.code === 'UNPREDICTABLE_GAS_LIMIT'
  ) {
    return {
      message: 'Transaction would fail',
      title: 'Transaction Error',
      suggestion: 'This transaction cannot be executed. It may be invalid, already executed, or the contract may reject it.',
      code: 'GAS_ESTIMATION_FAILED',
    };
  }

  // Network error
  if (
    err.message?.includes('network') ||
    err.message?.includes('connection') ||
    err.code === 'NETWORK_ERROR'
  ) {
    return {
      message: 'Network connection error',
      title: 'Network Error',
      suggestion: 'Please check your internet connection and try again. If the problem persists, the network may be experiencing issues.',
      code: 'NETWORK_ERROR',
    };
  }

  // Transaction already exists
  if (
    err.message?.includes('already exists') ||
    err.message?.includes('duplicate') ||
    err.reason?.includes('Transaction already exists')
  ) {
    return {
      message: 'This transaction already exists',
      title: 'Duplicate Transaction',
      suggestion: 'A transaction with these parameters has already been proposed. Check your pending transactions.',
      code: 'DUPLICATE_TRANSACTION',
    };
  }

  // Try to decode revert reason (check before broad "invalid" match)
  if (err.reason) {
    return {
      message: err.reason,
      title: 'Transaction Failed',
      suggestion: 'The transaction was rejected by the smart contract. Check the error message above for details.',
    };
  }

  // Generic error
  return {
    message: err.message || 'An unexpected error occurred',
    title: 'Error',
    suggestion: 'Please try again. If the problem persists, check your connection and wallet settings.',
  };
}

/**
 * Format error for display in UI
 */
export function formatError(error: unknown): string {
  const errorInfo = parseError(error);
  return errorInfo.message;
}
