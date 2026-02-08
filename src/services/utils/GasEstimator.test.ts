import { describe, it, expect, vi } from 'vitest';
import { estimateGasOrThrow } from './GasEstimator';

describe('GasEstimator', () => {
  describe('estimateGasOrThrow', () => {
    it('should return estimated gas on success', async () => {
      const mockMethod = {
        estimateGas: vi.fn().mockResolvedValue(150000n),
      };

      const result = await estimateGasOrThrow(mockMethod, [], 'execute');

      expect(result).toBe(150000n);
    });

    it('should throw user-friendly error on failure', async () => {
      const mockMethod = {
        estimateGas: vi.fn().mockRejectedValue({ reason: 'Not an owner' }),
      };

      await expect(estimateGasOrThrow(mockMethod, [], 'approve transaction')).rejects.toThrow(
        'Cannot approve transaction: Not an owner'
      );
    });

    it('should extract error message from contract', async () => {
      const mockContract = {
        interface: {
          parseError: vi.fn().mockReturnValue({
            name: 'Error',
            args: ['Insufficient balance'],
          }),
        },
      } as any;

      const mockMethod = {
        estimateGas: vi.fn().mockRejectedValue({ data: '0xerror...' }),
      };

      await expect(
        estimateGasOrThrow(mockMethod, [], 'execute', mockContract)
      ).rejects.toThrow('Cannot execute: Insufficient balance');
    });

    it('should pass arguments to estimateGas', async () => {
      const mockMethod = {
        estimateGas: vi.fn().mockResolvedValue(100000n),
      };

      await estimateGasOrThrow(mockMethod, ['0xaddr', 100n], 'send');

      expect(mockMethod.estimateGas).toHaveBeenCalledWith('0xaddr', 100n);
    });
  });
});
