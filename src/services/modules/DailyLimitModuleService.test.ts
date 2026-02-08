import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DailyLimitModuleService } from './DailyLimitModuleService';

// Valid test addresses (42 chars: 0x + 40 hex)
const VALID_WALLET = '0x1234567890123456789012345678901234567890';
const VALID_TARGET = '0xabcdef0123456789abcdef0123456789abcdef01';
const VALID_CALLER = '0x9876543210987654321098765432109876543210';

// Mock config
vi.mock('../../config/contracts', () => ({
  CONTRACT_ADDRESSES: {
    DAILY_LIMIT_MODULE: '0xDailyLimitModule123456789012345678901',
  },
  NETWORK_CONFIG: {
    RPC_URL: 'http://localhost:8545',
  },
}));

// Mock ABIs
vi.mock('../../config/abi/QuaiVault.json', () => ({
  default: { abi: [] },
}));
vi.mock('../../config/abi/DailyLimitModule.json', () => ({
  default: { abi: [] },
}));

// Mock TransactionBuilderService
vi.mock('../TransactionBuilderService', () => ({
  transactionBuilderService: {
    formatValue: vi.fn((value: bigint) => (Number(value) / 1e18).toString()),
  },
}));

describe('DailyLimitModuleService', () => {
  let service: DailyLimitModuleService;
  let mockSigner: any;
  let mockModule: any;
  let mockWallet: any;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new DailyLimitModuleService();

    mockSigner = {
      getAddress: vi.fn().mockResolvedValue(VALID_CALLER),
    };

    mockModule = {
      getDailyLimit: vi.fn().mockResolvedValue({
        limit: 1000000000000000000n, // 1 QUAI
        spent: 0n,
        lastReset: BigInt(Math.floor(Date.now() / 1000)),
      }),
      getRemainingLimit: vi.fn().mockResolvedValue(1000000000000000000n),
      getTimeUntilReset: vi.fn().mockResolvedValue(86400n),
      setDailyLimit: Object.assign(
        vi.fn().mockResolvedValue({
          hash: '0xsettxhash',
          wait: vi.fn().mockResolvedValue({ status: 1 }),
        }),
        { estimateGas: vi.fn().mockResolvedValue(100000n) }
      ),
      resetDailyLimit: Object.assign(
        vi.fn().mockResolvedValue({
          hash: '0xresettxhash',
          wait: vi.fn().mockResolvedValue({ status: 1 }),
        }),
        { estimateGas: vi.fn().mockResolvedValue(80000n) }
      ),
      executeBelowLimit: Object.assign(
        vi.fn().mockResolvedValue({
          hash: '0xexecutetxhash',
          wait: vi.fn().mockResolvedValue({ status: 1, hash: '0xexecutetxhash' }),
        }),
        { estimateGas: vi.fn().mockResolvedValue(150000n) }
      ),
      interface: {
        parseError: vi.fn(),
      },
    };

    mockWallet = {
      isModuleEnabled: vi.fn().mockResolvedValue(true),
      isOwner: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(service as any, 'getModuleContract').mockReturnValue(mockModule);
    vi.spyOn(service as any, 'getWalletContract').mockReturnValue(mockWallet);
    (service.getProvider() as any).getBalance = vi.fn().mockResolvedValue(10000000000000000000n);
  });

  describe('constructor', () => {
    it('should create service with default provider', () => {
      const newService = new DailyLimitModuleService();
      expect(newService).toBeDefined();
    });
  });

  describe('getDailyLimit', () => {
    it('should return daily limit info', async () => {
      mockModule.getDailyLimit.mockResolvedValue({
        limit: 2000000000000000000n,
        spent: 500000000000000000n,
        lastReset: 1234567890n,
      });

      const result = await service.getDailyLimit(VALID_WALLET);

      expect(result).toEqual({
        limit: 2000000000000000000n,
        spent: 500000000000000000n,
        lastReset: 1234567890n,
      });
      expect(mockModule.getDailyLimit).toHaveBeenCalledWith(VALID_WALLET);
    });

    it('should return zero values for unset limit', async () => {
      mockModule.getDailyLimit.mockResolvedValue({
        limit: 0n,
        spent: 0n,
        lastReset: 0n,
      });

      const result = await service.getDailyLimit(VALID_WALLET);

      expect(result.limit).toBe(0n);
      expect(result.spent).toBe(0n);
    });
  });

  describe('getRemainingLimit', () => {
    it('should return remaining limit from module', async () => {
      mockModule.getRemainingLimit.mockResolvedValue(500000000000000000n);

      const result = await service.getRemainingLimit(VALID_WALLET);

      expect(result).toBe(500000000000000000n);
      expect(mockModule.getRemainingLimit).toHaveBeenCalledWith(VALID_WALLET);
    });
  });

  describe('getTimeUntilReset', () => {
    it('should return time until reset from module', async () => {
      mockModule.getTimeUntilReset.mockResolvedValue(43200n); // 12 hours

      const result = await service.getTimeUntilReset(VALID_WALLET);

      expect(result).toBe(43200n);
    });
  });

  describe('setDailyLimit (deprecated)', () => {
    it('should throw deprecation error', async () => {
      await expect(
        service.setDailyLimit(VALID_WALLET, 1000000000000000000n)
      ).rejects.toThrow('Direct setDailyLimit calls are no longer supported');
    });
  });

  describe('resetDailyLimit (deprecated)', () => {
    it('should throw deprecation error', async () => {
      await expect(
        service.resetDailyLimit(VALID_WALLET)
      ).rejects.toThrow('Direct resetDailyLimit calls are no longer supported');
    });
  });

  describe('executeBelowLimit', () => {
    beforeEach(() => {
      service.setSigner(mockSigner);
    });

    it('should throw when signer not set', async () => {
      service.setSigner(null);

      await expect(
        service.executeBelowLimit(VALID_WALLET, VALID_TARGET, 1000n)
      ).rejects.toThrow('Signer not set');
    });

    it('should throw when insufficient balance', async () => {
      (service.getProvider() as any).getBalance.mockResolvedValue(100n);

      await expect(
        service.executeBelowLimit(VALID_WALLET, VALID_TARGET, 1000n)
      ).rejects.toThrow('Insufficient balance');
    });

    it('should execute transaction below limit', async () => {
      const result = await service.executeBelowLimit(
        VALID_WALLET,
        VALID_TARGET,
        500000000000000000n
      );

      expect(result).toBe('0xexecutetxhash');
      expect(mockModule.executeBelowLimit).toHaveBeenCalledWith(
        VALID_WALLET,
        VALID_TARGET,
        500000000000000000n
      );
    });

    it('should throw on user rejection', async () => {
      mockModule.executeBelowLimit.mockRejectedValue({ code: 'ACTION_REJECTED' });

      await expect(
        service.executeBelowLimit(VALID_WALLET, VALID_TARGET, 1000n)
      ).rejects.toThrow('Transaction was rejected by user');
    });

    it('should throw on reverted transaction', async () => {
      mockModule.executeBelowLimit.mockResolvedValue({
        wait: vi.fn().mockResolvedValue({ status: 0 }),
      });

      await expect(
        service.executeBelowLimit(VALID_WALLET, VALID_TARGET, 1000n)
      ).rejects.toThrow('reverted');
    });
  });

  describe('canExecuteViaDailyLimit', () => {
    it('should return canExecute true when all conditions met', async () => {
      mockWallet.isModuleEnabled.mockResolvedValue(true);
      mockModule.getDailyLimit.mockResolvedValue({
        limit: 1000000000000000000n,
        spent: 0n,
        lastReset: BigInt(Math.floor(Date.now() / 1000)),
      });
      mockModule.getRemainingLimit.mockResolvedValue(1000000000000000000n);

      const result = await service.canExecuteViaDailyLimit(
        VALID_WALLET,
        500000000000000000n
      );

      expect(result.canExecute).toBe(true);
    });

    it('should return canExecute false when module not enabled', async () => {
      mockWallet.isModuleEnabled.mockResolvedValue(false);

      const result = await service.canExecuteViaDailyLimit(VALID_WALLET, 1000n);

      expect(result.canExecute).toBe(false);
      expect(result.reason).toBe('Daily limit module not enabled');
    });

    it('should return canExecute false when limit not configured', async () => {
      mockModule.getDailyLimit.mockResolvedValue({
        limit: 0n,
        spent: 0n,
        lastReset: 0n,
      });

      const result = await service.canExecuteViaDailyLimit(VALID_WALLET, 1000n);

      expect(result.canExecute).toBe(false);
      expect(result.reason).toBe('Daily limit not configured');
    });

    it('should return canExecute false when value exceeds remaining limit', async () => {
      mockModule.getDailyLimit.mockResolvedValue({
        limit: 1000n,
        spent: 0n,
        lastReset: BigInt(Math.floor(Date.now() / 1000)),
      });
      mockModule.getRemainingLimit.mockResolvedValue(100n);

      const result = await service.canExecuteViaDailyLimit(VALID_WALLET, 200n);

      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain('exceeds remaining daily limit');
    });

    it('should return canExecute false when insufficient balance', async () => {
      mockModule.getDailyLimit.mockResolvedValue({
        limit: 1000000000000000000n,
        spent: 0n,
        lastReset: BigInt(Math.floor(Date.now() / 1000)),
      });
      mockModule.getRemainingLimit.mockResolvedValue(1000000000000000000n);
      (service.getProvider() as any).getBalance.mockResolvedValue(100n);

      const result = await service.canExecuteViaDailyLimit(VALID_WALLET, 1000n);

      expect(result.canExecute).toBe(false);
      expect(result.reason).toBe('Insufficient balance');
    });
  });
});
