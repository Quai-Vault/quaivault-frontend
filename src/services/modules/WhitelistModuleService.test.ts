import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhitelistModuleService } from './WhitelistModuleService';

// Valid test addresses (42 chars: 0x + 40 hex)
const VALID_WALLET = '0x1234567890123456789012345678901234567890';
const VALID_TARGET = '0xabcdef0123456789abcdef0123456789abcdef01';
const VALID_CALLER = '0x9876543210987654321098765432109876543210';

// Mock config
vi.mock('../../config/contracts', () => ({
  CONTRACT_ADDRESSES: {
    WHITELIST_MODULE: '0xWhitelistModule1234567890123456789012',
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
vi.mock('../../config/abi/WhitelistModule.json', () => ({
  default: { abi: [] },
}));

describe('WhitelistModuleService', () => {
  let service: WhitelistModuleService;
  let mockSigner: any;
  let mockModule: any;
  let mockWallet: any;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new WhitelistModuleService();

    mockSigner = {
      getAddress: vi.fn().mockResolvedValue(VALID_CALLER),
    };

    mockModule = {
      isWhitelisted: vi.fn().mockResolvedValue(false),
      getWhitelistLimit: vi.fn().mockResolvedValue(0n),
      addToWhitelist: Object.assign(
        vi.fn().mockResolvedValue({
          hash: '0xaddtxhash',
          wait: vi.fn().mockResolvedValue({ status: 1, gasUsed: 100000n }),
        }),
        { estimateGas: vi.fn().mockResolvedValue(100000n) }
      ),
      removeFromWhitelist: Object.assign(
        vi.fn().mockResolvedValue({
          hash: '0xremovetxhash',
          wait: vi.fn().mockResolvedValue({ status: 1, gasUsed: 80000n }),
        }),
        { estimateGas: vi.fn().mockResolvedValue(80000n) }
      ),
      executeToWhitelist: Object.assign(
        vi.fn().mockResolvedValue({
          hash: '0xexecutetxhash',
          wait: vi.fn().mockResolvedValue({ status: 1, hash: '0xexecutetxhash', gasUsed: 150000n }),
        }),
        { estimateGas: vi.fn().mockResolvedValue(150000n) }
      ),
      filters: {
        AddressWhitelisted: vi.fn().mockReturnValue({}),
        AddressRemovedFromWhitelist: vi.fn().mockReturnValue({}),
      },
      queryFilter: vi.fn().mockResolvedValue([]),
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
      const newService = new WhitelistModuleService();
      expect(newService).toBeDefined();
    });
  });

  describe('isWhitelisted', () => {
    it('should return true when address is whitelisted', async () => {
      mockModule.isWhitelisted.mockResolvedValue(true);

      const result = await service.isWhitelisted(VALID_WALLET, VALID_TARGET);

      expect(result).toBe(true);
      expect(mockModule.isWhitelisted).toHaveBeenCalledWith(VALID_WALLET, VALID_TARGET);
    });

    it('should return false when address is not whitelisted', async () => {
      mockModule.isWhitelisted.mockResolvedValue(false);

      const result = await service.isWhitelisted(VALID_WALLET, VALID_TARGET);

      expect(result).toBe(false);
    });
  });

  describe('getWhitelistLimit', () => {
    it('should return limit for whitelisted address', async () => {
      mockModule.getWhitelistLimit.mockResolvedValue(1000000000000000000n);

      const result = await service.getWhitelistLimit(VALID_WALLET, VALID_TARGET);

      expect(result).toBe(1000000000000000000n);
    });

    it('should return 0 for unlimited whitelist', async () => {
      mockModule.getWhitelistLimit.mockResolvedValue(0n);

      const result = await service.getWhitelistLimit(VALID_WALLET, VALID_TARGET);

      expect(result).toBe(0n);
    });
  });

  describe('addToWhitelist (deprecated)', () => {
    it('should throw deprecation error', async () => {
      await expect(
        service.addToWhitelist(VALID_WALLET, VALID_TARGET, 1000n)
      ).rejects.toThrow('Direct addToWhitelist calls are no longer supported');
    });
  });

  describe('removeFromWhitelist (deprecated)', () => {
    it('should throw deprecation error', async () => {
      await expect(
        service.removeFromWhitelist(VALID_WALLET, VALID_TARGET)
      ).rejects.toThrow('Direct removeFromWhitelist calls are no longer supported');
    });
  });

  describe('executeToWhitelist', () => {
    beforeEach(() => {
      service.setSigner(mockSigner);
      mockModule.isWhitelisted.mockResolvedValue(true);
      mockModule.getWhitelistLimit.mockResolvedValue(0n); // unlimited
    });

    it('should throw when signer not set', async () => {
      service.setSigner(null);

      await expect(
        service.executeToWhitelist(VALID_WALLET, VALID_TARGET, 1000n, '0x')
      ).rejects.toThrow('Signer not set');
    });

    it('should throw when target not whitelisted', async () => {
      mockModule.isWhitelisted.mockResolvedValue(false);

      await expect(
        service.executeToWhitelist(VALID_WALLET, VALID_TARGET, 1000n, '0x')
      ).rejects.toThrow('not whitelisted');
    });

    it('should throw when value exceeds limit', async () => {
      mockModule.getWhitelistLimit.mockResolvedValue(100n);

      await expect(
        service.executeToWhitelist(VALID_WALLET, VALID_TARGET, 200n, '0x')
      ).rejects.toThrow('exceeds whitelist limit');
    });

    it('should throw when insufficient balance', async () => {
      (service.getProvider() as any).getBalance.mockResolvedValue(100n);

      await expect(
        service.executeToWhitelist(VALID_WALLET, VALID_TARGET, 1000n, '0x')
      ).rejects.toThrow('Insufficient balance');
    });

    it('should execute transaction to whitelisted address', async () => {
      const result = await service.executeToWhitelist(
        VALID_WALLET,
        VALID_TARGET,
        1000n,
        '0xdata'
      );

      expect(result).toBe('0xexecutetxhash');
      expect(mockModule.executeToWhitelist).toHaveBeenCalledWith(
        VALID_WALLET,
        VALID_TARGET,
        1000n,
        '0xdata'
      );
    });
  });

  describe('canExecuteViaWhitelist', () => {
    it('should return canExecute true when all conditions met', async () => {
      mockWallet.isModuleEnabled.mockResolvedValue(true);
      mockModule.isWhitelisted.mockResolvedValue(true);
      mockModule.getWhitelistLimit.mockResolvedValue(0n);

      const result = await service.canExecuteViaWhitelist(
        VALID_WALLET,
        VALID_TARGET,
        500000000000000000n
      );

      expect(result.canExecute).toBe(true);
    });

    it('should return canExecute false for invalid address', async () => {
      const result = await service.canExecuteViaWhitelist(
        VALID_WALLET,
        'invalid',
        1000n
      );

      expect(result.canExecute).toBe(false);
      expect(result.reason).toBe('Invalid address format');
    });

    it('should return canExecute false when module not enabled', async () => {
      mockWallet.isModuleEnabled.mockResolvedValue(false);

      const result = await service.canExecuteViaWhitelist(
        VALID_WALLET,
        VALID_TARGET,
        1000n
      );

      expect(result.canExecute).toBe(false);
      expect(result.reason).toBe('Whitelist module not enabled');
    });

    it('should return canExecute false when target not whitelisted', async () => {
      mockModule.isWhitelisted.mockResolvedValue(false);

      const result = await service.canExecuteViaWhitelist(
        VALID_WALLET,
        VALID_TARGET,
        1000n
      );

      expect(result.canExecute).toBe(false);
      expect(result.reason).toBe('Address not whitelisted');
    });

    it('should return canExecute false when value exceeds limit', async () => {
      mockModule.isWhitelisted.mockResolvedValue(true);
      mockModule.getWhitelistLimit.mockResolvedValue(100n);

      const result = await service.canExecuteViaWhitelist(
        VALID_WALLET,
        VALID_TARGET,
        200n
      );

      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain('exceeds whitelist limit');
    });

    it('should return canExecute false when insufficient balance', async () => {
      mockModule.isWhitelisted.mockResolvedValue(true);
      mockModule.getWhitelistLimit.mockResolvedValue(0n);
      (service.getProvider() as any).getBalance.mockResolvedValue(100n);

      const result = await service.canExecuteViaWhitelist(
        VALID_WALLET,
        VALID_TARGET,
        1000n
      );

      expect(result.canExecute).toBe(false);
      expect(result.reason).toBe('Insufficient balance');
    });
  });

  describe('getWhitelistedAddresses', () => {
    it('should return empty array when no events', async () => {
      mockModule.queryFilter.mockResolvedValue([]);

      const result = await service.getWhitelistedAddresses(VALID_WALLET);

      expect(result).toEqual([]);
    });

    it('should return whitelisted addresses with limits', async () => {
      mockModule.queryFilter
        .mockResolvedValueOnce([
          { args: { addr: VALID_TARGET, limit: 1000n }, blockNumber: 100 },
        ])
        .mockResolvedValueOnce([]); // removal events
      mockModule.isWhitelisted.mockResolvedValue(true);
      mockModule.getWhitelistLimit.mockResolvedValue(1000n);

      const result = await service.getWhitelistedAddresses(VALID_WALLET);

      expect(result).toHaveLength(1);
      expect(result[0].address).toBe(VALID_TARGET.toLowerCase());
      expect(result[0].limit).toBe(1000n);
    });

    it('should filter out removed addresses', async () => {
      mockModule.queryFilter
        .mockResolvedValueOnce([
          { args: { addr: VALID_TARGET, limit: 1000n }, blockNumber: 100 },
        ])
        .mockResolvedValueOnce([
          { args: { addr: VALID_TARGET }, blockNumber: 200 }, // removed later
        ]);
      mockModule.isWhitelisted.mockResolvedValue(false);

      const result = await service.getWhitelistedAddresses(VALID_WALLET);

      expect(result).toHaveLength(0);
    });
  });
});
