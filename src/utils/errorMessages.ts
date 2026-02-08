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
export function parseError(error: any): ErrorInfo {
  // Guard against null/undefined/primitive input
  if (!error || typeof error !== 'object') {
    return {
      message: typeof error === 'string' ? error : 'An unexpected error occurred',
      title: 'Error',
      suggestion: 'Please try again. If the problem persists, check your connection and wallet settings.',
    };
  }

  // User rejection
  if (
    error.code === 'ACTION_REJECTED' ||
    error.code === 4001 ||
    (error.message && (
      error.message.includes('rejected') ||
      error.message.includes('denied') ||
      error.message.includes('cancelled') ||
      error.message.includes('User rejected')
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
    error.message?.includes('insufficient funds') ||
    error.message?.includes('insufficient balance') ||
    error.code === 'INSUFFICIENT_FUNDS'
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
    error.message?.includes('cannot estimate gas') ||
    error.message?.includes('gas required exceeds') ||
    error.message?.includes('out of gas') ||
    error.message?.includes('execution reverted') ||
    error.code === 'UNPREDICTABLE_GAS_LIMIT'
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
    error.message?.includes('network') ||
    error.message?.includes('connection') ||
    error.code === 'NETWORK_ERROR'
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
    error.message?.includes('already exists') ||
    error.message?.includes('duplicate') ||
    error.reason?.includes('Transaction already exists')
  ) {
    return {
      message: 'This transaction already exists',
      title: 'Duplicate Transaction',
      suggestion: 'A transaction with these parameters has already been proposed. Check your pending transactions.',
      code: 'DUPLICATE_TRANSACTION',
    };
  }

  // Try to decode revert reason (check before broad "invalid" match)
  if (error.reason) {
    return {
      message: error.reason,
      title: 'Transaction Failed',
      suggestion: 'The transaction was rejected by the smart contract. Check the error message above for details.',
    };
  }

  // Generic error
  return {
    message: error.message || 'An unexpected error occurred',
    title: 'Error',
    suggestion: 'Please try again. If the problem persists, check your connection and wallet settings.',
  };
}

/**
 * Format error for display in UI
 */
export function formatError(error: any): string {
  const errorInfo = parseError(error);
  return errorInfo.message;
}
