import { describe, it, expect, vi } from 'vitest';
import {
  isUserRejection,
  decodeErrorData,
  extractErrorMessage,
  formatTransactionError,
  checkReceiptStatus,
  validateTxHash,
  validateAddress,
  TransactionErrors,
} from './TransactionErrorHandler';

describe('TransactionErrorHandler', () => {
  describe('isUserRejection', () => {
    it('should return true for ACTION_REJECTED code', () => {
      const error = { code: 'ACTION_REJECTED', message: '' };
      expect(isUserRejection(error)).toBe(true);
    });

    it('should return true for code 4001 (MetaMask rejection)', () => {
      const error = { code: 4001, message: '' };
      expect(isUserRejection(error)).toBe(true);
    });

    it('should return true when message contains "rejected"', () => {
      const error = { message: 'User rejected the transaction' };
      expect(isUserRejection(error)).toBe(true);
    });

    it('should return true when message contains "denied"', () => {
      const error = { message: 'Transaction denied by user' };
      expect(isUserRejection(error)).toBe(true);
    });

    it('should return true when message contains "cancelled"', () => {
      const error = { message: 'Transaction was cancelled' };
      expect(isUserRejection(error)).toBe(true);
    });

    it('should be case insensitive for message checks', () => {
      const error = { message: 'User REJECTED the request' };
      expect(isUserRejection(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      const error = { code: 'UNKNOWN_ERROR', message: 'Something went wrong' };
      expect(isUserRejection(error)).toBe(false);
    });

    it('should return false for empty error', () => {
      const error = {};
      expect(isUserRejection(error)).toBe(false);
    });
  });

  describe('decodeErrorData', () => {
    it('should return null for empty error data', () => {
      const mockContract = { interface: { parseError: vi.fn() } } as any;
      expect(decodeErrorData(mockContract, '')).toBeNull();
    });

    it('should return null for "0x" error data', () => {
      const mockContract = { interface: { parseError: vi.fn() } } as any;
      expect(decodeErrorData(mockContract, '0x')).toBeNull();
    });

    it('should decode standard Error(string) revert', () => {
      const mockContract = {
        interface: {
          parseError: vi.fn().mockReturnValue({
            name: 'Error',
            args: ['Not an owner'],
          }),
        },
      } as any;

      const result = decodeErrorData(mockContract, '0x08c379a0...');
      expect(result).toBe('Not an owner');
    });

    it('should decode custom error with args', () => {
      const mockContract = {
        interface: {
          parseError: vi.fn().mockReturnValue({
            name: 'InsufficientBalance',
            args: ['100', '50'],
          }),
        },
      } as any;

      const result = decodeErrorData(mockContract, '0xcustom...');
      expect(result).toBe('InsufficientBalance - 100, 50');
    });

    it('should decode custom error without args', () => {
      const mockContract = {
        interface: {
          parseError: vi.fn().mockReturnValue({
            name: 'Unauthorized',
            args: [],
          }),
        },
      } as any;

      const result = decodeErrorData(mockContract, '0xcustom...');
      expect(result).toBe('Unauthorized');
    });

    it('should return null when parsing fails', () => {
      const mockContract = {
        interface: {
          parseError: vi.fn().mockImplementation(() => {
            throw new Error('Cannot parse');
          }),
        },
      } as any;

      const result = decodeErrorData(mockContract, '0xshort');
      expect(result).toBeNull();
    });
  });

  describe('extractErrorMessage', () => {
    it('should return reason when available', () => {
      const error = { reason: 'Insufficient funds', message: 'Error' };
      expect(extractErrorMessage(error)).toBe('Insufficient funds');
    });

    it('should decode error data when contract provided', () => {
      const mockContract = {
        interface: {
          parseError: vi.fn().mockReturnValue({
            name: 'Error',
            args: ['Custom error'],
          }),
        },
      } as any;

      const error = { data: '0xerror...' };
      expect(extractErrorMessage(error, mockContract)).toBe('Custom error');
    });

    it('should fall back to message', () => {
      const error = { message: 'Something went wrong' };
      expect(extractErrorMessage(error)).toBe('Something went wrong');
    });

    it('should return "Unknown error" when nothing available', () => {
      const error = {};
      expect(extractErrorMessage(error)).toBe('Unknown error');
    });

    it('should prioritize reason over decoded data', () => {
      const mockContract = {
        interface: {
          parseError: vi.fn().mockReturnValue({
            name: 'Error',
            args: ['Decoded error'],
          }),
        },
      } as any;

      const error = { reason: 'Reason error', data: '0xerror...' };
      expect(extractErrorMessage(error, mockContract)).toBe('Reason error');
    });
  });

  describe('formatTransactionError', () => {
    it('should return user rejection error for rejected transactions', () => {
      const error = { code: 'ACTION_REJECTED' };
      const result = formatTransactionError(error, 'approve transaction');

      expect(result.message).toBe('Transaction was rejected by user');
    });

    it('should include operation in error message', () => {
      const error = { message: 'Insufficient balance' };
      const result = formatTransactionError(error, 'execute transaction');

      expect(result.message).toBe('execute transaction: Insufficient balance');
    });

    it('should decode error with contract', () => {
      const mockContract = {
        interface: {
          parseError: vi.fn().mockReturnValue({
            name: 'Error',
            args: ['Not authorized'],
          }),
        },
      } as any;

      const error = { data: '0xerror...' };
      const result = formatTransactionError(error, 'add owner', mockContract);

      expect(result.message).toBe('add owner: Not authorized');
    });
  });

  describe('checkReceiptStatus', () => {
    it('should not throw for successful receipt', () => {
      const receipt = { status: 1 };
      expect(() => checkReceiptStatus(receipt, 'execute')).not.toThrow();
    });

    it('should throw for reverted receipt', () => {
      const receipt = { status: 0 };
      expect(() => checkReceiptStatus(receipt, 'execute')).toThrow('execute reverted.');
    });

    it('should include additional context in error', () => {
      const receipt = { status: 0 };
      expect(() =>
        checkReceiptStatus(receipt, 'execute', 'Check approvals.')
      ).toThrow('execute reverted. Check approvals.');
    });

    it('should not throw for null receipt', () => {
      expect(() => checkReceiptStatus(null, 'execute')).not.toThrow();
    });

    it('should not throw for receipt without status', () => {
      const receipt = { gasUsed: 100000n };
      expect(() => checkReceiptStatus(receipt, 'execute')).not.toThrow();
    });
  });

  describe('validateTxHash', () => {
    it('should accept valid 66-character hash with 0x prefix', () => {
      const hash = '0x' + 'a'.repeat(64);
      expect(validateTxHash(hash)).toBe(hash);
    });

    it('should add 0x prefix if missing', () => {
      const hash = 'a'.repeat(64);
      expect(validateTxHash(hash)).toBe('0x' + hash);
    });

    it('should throw for hash with wrong length', () => {
      const shortHash = '0x' + 'a'.repeat(32);
      expect(() => validateTxHash(shortHash)).toThrow('Invalid transaction hash length');
    });

    it('should include actual length in error message', () => {
      const shortHash = '0x' + 'a'.repeat(32);
      expect(() => validateTxHash(shortHash)).toThrow('34');
    });

    it('should throw for hash with non-hex characters', () => {
      const invalidHash = '0x' + 'Z'.repeat(64);
      expect(() => validateTxHash(invalidHash)).toThrow('non-hex characters');
    });
  });

  describe('validateAddress', () => {
    it('should accept valid address and return normalized version', () => {
      // Use a valid address format that quais recognizes
      const address = '0x0000000000000000000000000000000000000001';
      const result = validateAddress(address);
      expect(result.length).toBe(42);
      expect(result.startsWith('0x')).toBe(true);
    });

    it('should normalize lowercase address', () => {
      const address = '0x0000000000000000000000000000000000000001';
      const result = validateAddress(address.toLowerCase());
      // Should return normalized version
      expect(result.length).toBe(42);
      expect(result.startsWith('0x')).toBe(true);
    });

    it('should throw for address with wrong length', () => {
      const shortAddress = '0x1234';
      expect(() => validateAddress(shortAddress)).toThrow('Invalid address length');
    });

    it('should throw for address without 0x prefix', () => {
      const address = '0000000000000000000000000000000000000001';
      expect(() => validateAddress(address)).toThrow('Invalid address length');
    });

    it('should trim whitespace and validate', () => {
      // Whitespace is trimmed first, then length check
      const address = '  0x1234  ';
      expect(() => validateAddress(address)).toThrow('Invalid address length');
    });

    it('should throw for invalid hex characters', () => {
      const invalidAddress = '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG';
      expect(() => validateAddress(invalidAddress)).toThrow('Invalid Quai address format');
    });
  });

  describe('TransactionErrors', () => {
    it('should have predefined error messages', () => {
      expect(TransactionErrors.NOT_OWNER).toBe('Only wallet owners can perform this action');
      expect(TransactionErrors.TX_NOT_FOUND).toBe('Transaction does not exist');
      expect(TransactionErrors.TX_ALREADY_EXECUTED).toBe('Transaction has already been executed');
      expect(TransactionErrors.TX_CANCELLED).toBe('Transaction has been cancelled');
      expect(TransactionErrors.ALREADY_APPROVED).toBe('You have already approved this transaction');
      expect(TransactionErrors.NOT_APPROVED).toBe('You have not approved this transaction');
      expect(TransactionErrors.SIGNER_NOT_SET).toBe('Signer not set. Connect wallet first.');
    });

    it('should generate dynamic error messages', () => {
      expect(TransactionErrors.NOT_ENOUGH_APPROVALS(1, 2)).toBe(
        'Not enough approvals: 1 / 2 required'
      );
      expect(TransactionErrors.INVALID_ADDRESS('0xinvalid')).toBe(
        'Invalid address format: 0xinvalid'
      );
      expect(TransactionErrors.INVALID_HASH_LENGTH(32)).toBe(
        'Invalid transaction hash length: 32 (expected 66)'
      );
    });
  });
});
