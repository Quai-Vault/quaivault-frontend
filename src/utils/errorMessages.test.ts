import { describe, it, expect } from 'vitest';
import { parseError, formatError } from './errorMessages';

describe('errorMessages', () => {
  describe('parseError', () => {
    describe('User rejection errors', () => {
      it('should detect ACTION_REJECTED code', () => {
        const error = { code: 'ACTION_REJECTED', message: '' };
        const result = parseError(error);

        expect(result.title).toBe('Transaction Cancelled');
        expect(result.message).toBe('Transaction was cancelled');
        expect(result.suggestion).toContain('cancelled');
      });

      it('should detect code 4001 (MetaMask rejection)', () => {
        const error = { code: 4001, message: '' };
        const result = parseError(error);

        expect(result.title).toBe('Transaction Cancelled');
      });

      it('should detect "rejected" in message', () => {
        const error = { message: 'User rejected the transaction' };
        const result = parseError(error);

        expect(result.title).toBe('Transaction Cancelled');
      });

      it('should detect "denied" in message', () => {
        const error = { message: 'Transaction denied by user' };
        const result = parseError(error);

        expect(result.title).toBe('Transaction Cancelled');
      });

      it('should detect "cancelled" in message', () => {
        const error = { message: 'Transaction was cancelled' };
        const result = parseError(error);

        expect(result.title).toBe('Transaction Cancelled');
      });

      it('should detect "User rejected" in message', () => {
        const error = { message: 'User rejected request' };
        const result = parseError(error);

        expect(result.title).toBe('Transaction Cancelled');
      });
    });

    describe('Insufficient funds errors', () => {
      it('should detect "insufficient funds" in message', () => {
        const error = { message: 'insufficient funds for gas' };
        const result = parseError(error);

        expect(result.title).toBe('Insufficient Funds');
        expect(result.code).toBe('INSUFFICIENT_FUNDS');
        expect(result.suggestion).toContain('QUAI');
      });

      it('should detect "insufficient balance" in message', () => {
        const error = { message: 'insufficient balance' };
        const result = parseError(error);

        expect(result.title).toBe('Insufficient Funds');
      });

      it('should detect INSUFFICIENT_FUNDS code', () => {
        const error = { code: 'INSUFFICIENT_FUNDS', message: '' };
        const result = parseError(error);

        expect(result.title).toBe('Insufficient Funds');
      });
    });

    describe('Gas estimation errors', () => {
      it('should detect "gas" in message', () => {
        const error = { message: 'cannot estimate gas' };
        const result = parseError(error);

        expect(result.title).toBe('Transaction Error');
        expect(result.code).toBe('GAS_ESTIMATION_FAILED');
      });

      it('should detect "execution reverted" in message', () => {
        const error = { message: 'execution reverted' };
        const result = parseError(error);

        expect(result.title).toBe('Transaction Error');
      });

      it('should detect UNPREDICTABLE_GAS_LIMIT code', () => {
        const error = { code: 'UNPREDICTABLE_GAS_LIMIT', message: '' };
        const result = parseError(error);

        expect(result.title).toBe('Transaction Error');
      });
    });

    describe('Network errors', () => {
      it('should detect "network" in message', () => {
        const error = { message: 'network error occurred' };
        const result = parseError(error);

        expect(result.title).toBe('Network Error');
        expect(result.code).toBe('NETWORK_ERROR');
      });

      it('should detect "connection" in message', () => {
        const error = { message: 'connection failed' };
        const result = parseError(error);

        expect(result.title).toBe('Network Error');
      });

      it('should detect NETWORK_ERROR code', () => {
        const error = { code: 'NETWORK_ERROR', message: '' };
        const result = parseError(error);

        expect(result.title).toBe('Network Error');
      });
    });

    describe('Duplicate transaction errors', () => {
      it('should detect "already exists" in message', () => {
        const error = { message: 'Transaction already exists' };
        const result = parseError(error);

        expect(result.title).toBe('Duplicate Transaction');
        expect(result.code).toBe('DUPLICATE_TRANSACTION');
      });

      it('should detect "duplicate" in message', () => {
        const error = { message: 'duplicate transaction' };
        const result = parseError(error);

        expect(result.title).toBe('Duplicate Transaction');
      });

      it('should detect reason containing "Transaction already exists"', () => {
        const error = { message: '', reason: 'Transaction already exists' };
        const result = parseError(error);

        expect(result.title).toBe('Duplicate Transaction');
      });
    });

    describe('Invalid parameter errors', () => {
      it('should show actual error message for "invalid" errors', () => {
        const error = { message: 'invalid address format' };
        const result = parseError(error);

        // Now falls through to generic handler — shows actual message instead of generic "Invalid parameters"
        expect(result.message).toBe('invalid address format');
      });

      it('should show actual error message for "Invalid" errors', () => {
        const error = { message: 'Invalid threshold' };
        const result = parseError(error);

        expect(result.message).toBe('Invalid threshold');
      });

      it('should use revert reason for errors with reason containing "Invalid"', () => {
        const error = { message: '', reason: 'Invalid owner address' };
        const result = parseError(error);

        // Reason-based errors now caught by revert reason handler
        expect(result.title).toBe('Transaction Failed');
        expect(result.message).toBe('Invalid owner address');
      });
    });

    describe('Contract revert reason', () => {
      it('should use reason when available', () => {
        const error = { message: '', reason: 'Only owner can call this function' };
        const result = parseError(error);

        expect(result.title).toBe('Transaction Failed');
        expect(result.message).toBe('Only owner can call this function');
      });
    });

    describe('Generic errors', () => {
      it('should return generic error for unknown errors', () => {
        const error = { message: 'Something went wrong' };
        const result = parseError(error);

        expect(result.title).toBe('Error');
        expect(result.message).toBe('Something went wrong');
      });

      it('should return default message for empty error', () => {
        const error = {};
        const result = parseError(error);

        expect(result.title).toBe('Error');
        expect(result.message).toBe('An unexpected error occurred');
      });
    });
  });

  describe('formatError', () => {
    it('should return formatted error message', () => {
      const error = { code: 4001 };
      const result = formatError(error);

      expect(result).toBe('Transaction was cancelled');
    });

    it('should return message for generic error', () => {
      const error = { message: 'Custom error message' };
      const result = formatError(error);

      expect(result).toBe('Custom error message');
    });
  });
});
