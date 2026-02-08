import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocialRecoveryModuleService } from './SocialRecoveryModuleService';

// Valid test addresses (42 chars: 0x + 40 hex)
const VALID_WALLET = '0x1234567890123456789012345678901234567890';
const VALID_GUARDIAN_1 = '0xabcdef0123456789abcdef0123456789abcdef01';
const VALID_GUARDIAN_2 = '0x9876543210987654321098765432109876543210';
const VALID_NEW_OWNER_1 = '0x1111111111111111111111111111111111111111';
const VALID_NEW_OWNER_2 = '0x2222222222222222222222222222222222222222';
const VALID_SIGNER = '0xfedcba0987654321fedcba0987654321fedcba09';

// Mock config
vi.mock('../../config/contracts', () => ({
  CONTRACT_ADDRESSES: {
    SOCIAL_RECOVERY_MODULE: '0xSocialRecoveryModule',
  },
  NETWORK_CONFIG: {
    RPC_URL: 'http://localhost:8545',
  },
  EVENT_QUERY_RANGE: -5000,
  EVENT_QUERY_RANGE_FALLBACK: -2000,
}));

// Mock ABIs
vi.mock('../../config/abi/QuaiVault.json', () => ({
  default: { abi: [] },
}));
vi.mock('../../config/abi/SocialRecoveryModule.json', () => ({
  default: { abi: [] },
}));

describe('SocialRecoveryModuleService', () => {
  let service: SocialRecoveryModuleService;
  let mockSigner: any;
  let mockModule: any;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new SocialRecoveryModuleService();

    mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0xSignerAddress'),
    };

    mockModule = {
      getRecoveryConfig: vi.fn().mockResolvedValue({
        guardians: ['0xGuardian1', '0xGuardian2'],
        threshold: 2n,
        recoveryPeriod: 86400n, // 1 day
      }),
      isGuardian: vi.fn().mockResolvedValue(true),
      getRecovery: vi.fn().mockResolvedValue({
        newOwners: ['0xNewOwner1'],
        newThreshold: 1n,
        approvalCount: 1n,
        executionTime: BigInt(Math.floor(Date.now() / 1000) + 86400),
        executed: false,
      }),
      getRecoveryHashForCurrentNonce: vi.fn().mockResolvedValue('0xrecoveryhash'),
      recoveryApprovals: vi.fn().mockResolvedValue(false),
      setupRecovery: Object.assign(
        vi.fn().mockResolvedValue({
          hash: '0xsetuptxhash',
          wait: vi.fn().mockResolvedValue({ status: 1 }),
        }),
        { estimateGas: vi.fn().mockResolvedValue(200000n) }
      ),
      initiateRecovery: Object.assign(
        vi.fn().mockResolvedValue({
          hash: '0xinitiatetxhash',
          wait: vi.fn().mockResolvedValue({
            status: 1,
            logs: [{ fragment: { name: 'RecoveryInitiated' } }],
          }),
        }),
        { estimateGas: vi.fn().mockResolvedValue(150000n) }
      ),
      approveRecovery: Object.assign(
        vi.fn().mockResolvedValue({
          hash: '0xapprovetxhash',
          wait: vi.fn().mockResolvedValue({ status: 1 }),
        }),
        { estimateGas: vi.fn().mockResolvedValue(100000n) }
      ),
      executeRecovery: Object.assign(
        vi.fn().mockResolvedValue({
          hash: '0xexecutetxhash',
          wait: vi.fn().mockResolvedValue({ status: 1 }),
        }),
        { estimateGas: vi.fn().mockResolvedValue(300000n) }
      ),
      cancelRecovery: Object.assign(
        vi.fn().mockResolvedValue({
          hash: '0xcanceltxhash',
          wait: vi.fn().mockResolvedValue({ status: 1 }),
        }),
        { estimateGas: vi.fn().mockResolvedValue(80000n) }
      ),
      filters: {
        RecoveryInitiated: vi.fn().mockReturnValue({}),
      },
      queryFilter: vi.fn().mockResolvedValue([]),
      interface: {
        parseLog: vi.fn().mockReturnValue({
          name: 'RecoveryInitiated',
          args: { recoveryHash: '0xrecoveryhash' },
        }),
        parseError: vi.fn(),
      },
    };

    vi.spyOn(service as any, 'getModuleContract').mockReturnValue(mockModule);
  });

  describe('constructor', () => {
    it('should create service with default provider', () => {
      const newService = new SocialRecoveryModuleService();
      expect(newService).toBeDefined();
    });
  });

  describe('getRecoveryConfig', () => {
    it('should return recovery configuration', async () => {
      const result = await service.getRecoveryConfig('0xWallet');

      expect(result).toEqual({
        guardians: ['0xGuardian1', '0xGuardian2'],
        threshold: 2n,
        recoveryPeriod: 86400n,
      });
      expect(mockModule.getRecoveryConfig).toHaveBeenCalledWith('0xWallet');
    });

    it('should handle empty guardians array', async () => {
      mockModule.getRecoveryConfig.mockResolvedValue({
        guardians: [],
        threshold: 0n,
        recoveryPeriod: 0n,
      });

      const result = await service.getRecoveryConfig('0xWallet');

      expect(result.guardians).toEqual([]);
      expect(result.threshold).toBe(0n);
    });
  });

  describe('setupRecovery (deprecated)', () => {
    it('should throw deprecation error', async () => {
      await expect(
        service.setupRecovery(
          '0xWallet',
          ['0x0000000000000000000000000000000000000001'],
          1,
          1
        )
      ).rejects.toThrow('Direct setupRecovery calls are no longer supported');
    });
  });

  describe('isGuardian', () => {
    it('should return true when address is guardian', async () => {
      mockModule.isGuardian.mockResolvedValue(true);

      const result = await service.isGuardian('0xWallet', '0xGuardian');

      expect(result).toBe(true);
      expect(mockModule.isGuardian).toHaveBeenCalledWith('0xWallet', '0xGuardian');
    });

    it('should return false when address is not guardian', async () => {
      mockModule.isGuardian.mockResolvedValue(false);

      const result = await service.isGuardian('0xWallet', '0xNotGuardian');

      expect(result).toBe(false);
    });
  });

  describe('getRecoveryHash', () => {
    it('should return recovery hash for given parameters', async () => {
      mockModule.getRecoveryHashForCurrentNonce.mockResolvedValue('0xhash123');

      const result = await service.getRecoveryHash(
        VALID_WALLET,
        [VALID_NEW_OWNER_1, VALID_NEW_OWNER_2],
        2
      );

      expect(result).toBe('0xhash123');
    });
  });

  describe('getRecovery', () => {
    it('should return recovery details', async () => {
      mockModule.getRecovery.mockResolvedValue({
        newOwners: ['0xNewOwner1', '0xNewOwner2'],
        newThreshold: 2n,
        approvalCount: 1n,
        executionTime: 1234567890n,
        executed: false,
      });

      const result = await service.getRecovery('0xWallet', '0xhash');

      expect(result).toEqual({
        newOwners: ['0xNewOwner1', '0xNewOwner2'],
        newThreshold: 2n,
        approvalCount: 1n,
        executionTime: 1234567890n,
        executed: false,
      });
    });
  });

  describe('hasApprovedRecovery', () => {
    it('should return true when guardian has approved', async () => {
      mockModule.recoveryApprovals.mockResolvedValue(true);
      mockModule.getRecovery.mockResolvedValue({
        executionTime: BigInt(Math.floor(Date.now() / 1000) + 86400),
        executed: false,
        approvalCount: 1n,
      });

      const result = await service.hasApprovedRecovery('0xWallet', '0xhash', '0xGuardian');

      expect(result).toBe(true);
    });

    it('should return false when recovery is cancelled', async () => {
      mockModule.getRecovery.mockResolvedValue({
        executionTime: 0n,
        executed: false,
      });

      const result = await service.hasApprovedRecovery('0xWallet', '0xhash', '0xGuardian');

      expect(result).toBe(false);
    });

    it('should return false when recovery is executed', async () => {
      mockModule.getRecovery.mockResolvedValue({
        executionTime: 1234567890n,
        executed: true,
      });

      const result = await service.hasApprovedRecovery('0xWallet', '0xhash', '0xGuardian');

      expect(result).toBe(false);
    });
  });

  describe('initiateRecovery', () => {
    beforeEach(() => {
      service.setSigner(mockSigner);
    });

    it('should throw when signer not set', async () => {
      service.setSigner(null);

      await expect(
        service.initiateRecovery(
          '0xWallet',
          ['0x0000000000000000000000000000000000000001'],
          1
        )
      ).rejects.toThrow('Signer not set');
    });

    it('should throw for empty new owners', async () => {
      await expect(service.initiateRecovery('0xWallet', [], 1)).rejects.toThrow(
        'At least one new owner is required'
      );
    });

    it('should throw for invalid threshold', async () => {
      await expect(
        service.initiateRecovery(
          '0xWallet',
          ['0x0000000000000000000000000000000000000001'],
          0
        )
      ).rejects.toThrow('Invalid threshold');
    });

    it('should throw when threshold exceeds new owner count', async () => {
      await expect(
        service.initiateRecovery(
          '0xWallet',
          ['0x0000000000000000000000000000000000000001'],
          2
        )
      ).rejects.toThrow('Invalid threshold');
    });

    it('should initiate recovery and return hash', async () => {
      const result = await service.initiateRecovery(
        '0xWallet',
        ['0x0000000000000000000000000000000000000001'],
        1
      );

      expect(result).toBe('0xrecoveryhash');
      expect(mockModule.initiateRecovery).toHaveBeenCalled();
    });

    it('should throw on user rejection', async () => {
      mockModule.initiateRecovery.mockRejectedValue({ code: 'ACTION_REJECTED' });

      await expect(
        service.initiateRecovery(
          '0xWallet',
          ['0x0000000000000000000000000000000000000001'],
          1
        )
      ).rejects.toThrow('Transaction was rejected by user');
    });
  });

  describe('approveRecovery', () => {
    beforeEach(() => {
      service.setSigner(mockSigner);
    });

    it('should throw when signer not set', async () => {
      service.setSigner(null);

      await expect(service.approveRecovery('0xWallet', '0xhash')).rejects.toThrow(
        'Signer not set'
      );
    });

    it('should throw when recovery is cancelled', async () => {
      mockModule.getRecovery.mockResolvedValue({
        executionTime: 0n,
        executed: false,
      });

      await expect(service.approveRecovery('0xWallet', '0xhash')).rejects.toThrow(
        'cancelled or does not exist'
      );
    });

    it('should continue to gas estimation when recovery is executed (error caught by gas estimation)', async () => {
      // Note: The service's pre-validation catches "executed" errors but doesn't re-throw them
      // The gas estimation will fail instead
      mockModule.getRecovery.mockResolvedValue({
        executionTime: 1234567890n,
        executed: true,
      });
      mockModule.approveRecovery.estimateGas.mockRejectedValue({ reason: 'Recovery already executed' });

      await expect(service.approveRecovery('0xWallet', '0xhash')).rejects.toThrow();
    });

    it('should throw when already approved', async () => {
      mockModule.getRecovery.mockResolvedValue({
        executionTime: BigInt(Math.floor(Date.now() / 1000) + 86400),
        executed: false,
      });
      mockModule.recoveryApprovals.mockResolvedValue(true);

      await expect(service.approveRecovery('0xWallet', '0xhash')).rejects.toThrow(
        'already approved'
      );
    });

    it('should approve recovery', async () => {
      mockModule.getRecovery.mockResolvedValue({
        executionTime: BigInt(Math.floor(Date.now() / 1000) + 86400),
        executed: false,
      });
      mockModule.recoveryApprovals.mockResolvedValue(false);

      await service.approveRecovery('0xWallet', '0xhash');

      expect(mockModule.approveRecovery).toHaveBeenCalledWith(
        '0xWallet',
        '0xhash'
      );
    });
  });

  describe('executeRecovery', () => {
    beforeEach(() => {
      service.setSigner(mockSigner);
    });

    it('should throw when signer not set', async () => {
      service.setSigner(null);

      await expect(service.executeRecovery('0xWallet', '0xhash')).rejects.toThrow(
        'Signer not set'
      );
    });

    it('should execute recovery', async () => {
      await service.executeRecovery('0xWallet', '0xhash');

      expect(mockModule.executeRecovery).toHaveBeenCalledWith(
        '0xWallet',
        '0xhash'
      );
    });

    it('should throw on user rejection', async () => {
      mockModule.executeRecovery.mockRejectedValue({ code: 'ACTION_REJECTED' });

      await expect(service.executeRecovery('0xWallet', '0xhash')).rejects.toThrow(
        'Transaction was rejected by user'
      );
    });

    it('should throw on reverted transaction', async () => {
      mockModule.executeRecovery.mockResolvedValue({
        wait: vi.fn().mockResolvedValue({ status: 0 }),
      });

      await expect(service.executeRecovery('0xWallet', '0xhash')).rejects.toThrow(
        'reverted'
      );
    });
  });

  describe('cancelRecovery', () => {
    beforeEach(() => {
      service.setSigner(mockSigner);
    });

    it('should throw when signer not set', async () => {
      service.setSigner(null);

      await expect(service.cancelRecovery('0xWallet', '0xhash')).rejects.toThrow(
        'Signer not set'
      );
    });

    it('should cancel recovery', async () => {
      await service.cancelRecovery('0xWallet', '0xhash');

      expect(mockModule.cancelRecovery).toHaveBeenCalledWith(
        '0xWallet',
        '0xhash'
      );
    });

    it('should throw on user rejection', async () => {
      mockModule.cancelRecovery.mockRejectedValue({ code: 'ACTION_REJECTED' });

      await expect(service.cancelRecovery('0xWallet', '0xhash')).rejects.toThrow(
        'Transaction was rejected by user'
      );
    });
  });

  describe('getPendingRecoveries', () => {
    it('should return empty array when no events', async () => {
      mockModule.queryFilter.mockResolvedValue([]);

      const result = await service.getPendingRecoveries('0xWallet');

      expect(result).toEqual([]);
    });

    it('should return pending recoveries', async () => {
      mockModule.queryFilter.mockResolvedValue([
        { args: { recoveryHash: '0xhash1' } },
        { args: { recoveryHash: '0xhash2' } },
      ]);
      mockModule.getRecovery
        .mockResolvedValueOnce({
          newOwners: ['0xOwner1'],
          newThreshold: 1n,
          approvalCount: 1n,
          executionTime: BigInt(Math.floor(Date.now() / 1000) + 86400),
          executed: false,
        })
        .mockResolvedValueOnce({
          newOwners: ['0xOwner2'],
          newThreshold: 1n,
          approvalCount: 2n,
          executionTime: BigInt(Math.floor(Date.now() / 1000) + 86400),
          executed: false,
        });

      const result = await service.getPendingRecoveries('0xWallet');

      expect(result).toHaveLength(2);
      expect(result[0].recoveryHash).toBe('0xhash1');
      expect(result[1].recoveryHash).toBe('0xhash2');
    });

    it('should filter out cancelled recoveries', async () => {
      mockModule.queryFilter.mockResolvedValue([{ args: { recoveryHash: '0xhash1' } }]);
      mockModule.getRecovery.mockResolvedValue({
        newOwners: [],
        newThreshold: 0n,
        approvalCount: 0n,
        executionTime: 0n, // Cancelled
        executed: false,
      });

      const result = await service.getPendingRecoveries('0xWallet');

      expect(result).toHaveLength(0);
    });

    it('should filter out executed recoveries', async () => {
      mockModule.queryFilter.mockResolvedValue([{ args: { recoveryHash: '0xhash1' } }]);
      mockModule.getRecovery.mockResolvedValue({
        newOwners: ['0xOwner'],
        newThreshold: 1n,
        approvalCount: 2n,
        executionTime: 1234567890n,
        executed: true,
      });

      const result = await service.getPendingRecoveries('0xWallet');

      expect(result).toHaveLength(0);
    });

    it('should deduplicate recovery hashes', async () => {
      mockModule.queryFilter.mockResolvedValue([
        { args: { recoveryHash: '0xhash1' } },
        { args: { recoveryHash: '0xhash1' } }, // Duplicate
      ]);
      mockModule.getRecovery.mockResolvedValue({
        newOwners: ['0xOwner1'],
        newThreshold: 1n,
        approvalCount: 1n,
        executionTime: BigInt(Math.floor(Date.now() / 1000) + 86400),
        executed: false,
      });

      const result = await service.getPendingRecoveries('0xWallet');

      expect(result).toHaveLength(1);
    });

    it('should handle query filter errors gracefully', async () => {
      mockModule.queryFilter.mockRejectedValue(new Error('exceeds maximum limit'));

      const result = await service.getPendingRecoveries('0xWallet');

      // Should return empty array on error
      expect(result).toEqual([]);
    });
  });
});
