import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletService } from './WalletService';

// Mock quais
vi.mock('quais', () => {
  const MockContract = vi.fn().mockImplementation(function(this: any, address: string, abi: any, provider: any) {
    this.address = address;
    this.interface = abi;
    this.provider = provider;
    this.connect = vi.fn().mockReturnValue(this);
    this.implementation = vi.fn();
    this.createWallet = vi.fn().mockResolvedValue({ hash: '0xtxhash', wait: vi.fn().mockResolvedValue({ status: 1, logs: [] }) });
    this.registerWallet = vi.fn().mockResolvedValue({ hash: '0xtxhash', wait: vi.fn() });
    this.getWalletsByCreator = vi.fn();
    this.getOwners = vi.fn();
    this.threshold = vi.fn();
    this.isOwner = vi.fn();
    this.isModuleEnabled = vi.fn();
  });

  const MockJsonRpcProvider = vi.fn().mockImplementation(function(this: any) {
    this.getNetwork = vi.fn();
    this.getCode = vi.fn();
    this.getBalance = vi.fn();
  });

  const MockInterface = vi.fn().mockImplementation(function(this: any) {
    this.encodeFunctionData = vi.fn().mockReturnValue('0xencoded');
    this.parseLog = vi.fn();
  });

  // Counter to produce a valid address on the 2nd call
  let saltCallCount = 0;

  return {
    Contract: MockContract,
    JsonRpcProvider: MockJsonRpcProvider,
    Interface: MockInterface,
    ZeroAddress: '0x0000000000000000000000000000000000000000',
    keccak256: vi.fn().mockReturnValue('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'),
    solidityPacked: vi.fn().mockReturnValue('0xpacked'),
    getCreate2Address: vi.fn().mockImplementation(() => {
      saltCallCount++;
      // Return a valid 0x00-prefixed address on first call
      return '0x00abcdef1234567890abcdef1234567890abcdef';
    }),
    isAddress: vi.fn((address: string) => /^0x[a-fA-F0-9]{40}$/.test(address)),
    isQuaiAddress: vi.fn().mockReturnValue(true),
    randomBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
    hexlify: vi.fn().mockReturnValue('0x0000000000000000000000000000000000000000000000000000000000000001'),
    AbiCoder: {
      defaultAbiCoder: vi.fn().mockReturnValue({
        encode: vi.fn().mockReturnValue('0xencodedargs'),
      }),
    },
  };
});

// Mock config
vi.mock('../../config/contracts', () => ({
  CONTRACT_ADDRESSES: {
    QUAIVAULT_FACTORY: '0xQuaiVaultFactory',
    QUAIVAULT_IMPLEMENTATION: '0xImplementation',
  },
  NETWORK_CONFIG: {
    RPC_URL: 'http://localhost:8545',
  },
}));

// Mock ABIs
vi.mock('../../config/abi/QuaiVault.json', () => ({
  default: { abi: [] },
}));
vi.mock('../../config/abi/QuaiVaultFactory.json', () => ({
  default: { abi: [] },
}));
vi.mock('../../config/abi/QuaiVaultProxy.json', () => ({
  default: {
    abi: [],
    bytecode: '0x1234',
    deployedBytecode: '0x5678',
  },
}));

describe('WalletService', () => {
  let service: WalletService;
  let mockSigner: any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WalletService();
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0xSignerAddress'),
    };
  });

  describe('constructor', () => {
    it('should create service with default provider', () => {
      const newService = new WalletService();
      expect(newService).toBeDefined();
    });

    it('should create service with custom provider', () => {
      const customProvider = { getNetwork: vi.fn() } as any;
      const newService = new WalletService(customProvider);
      expect(newService.getProvider()).toBe(customProvider);
    });
  });

  describe('setSigner', () => {
    it('should set signer and update factory contract', () => {
      service.setSigner(mockSigner);
      // Factory contract should be connected with signer
      expect(service.getFactoryContract().connect).toHaveBeenCalledWith(mockSigner);
    });

    it('should reset factory contract when signer is null', () => {
      service.setSigner(mockSigner);
      service.setSigner(null);
      // New contract should be created without signer
      expect(service.getFactoryContract()).toBeDefined();
    });
  });

  describe('getImplementationAddress', () => {
    it('should call factory implementation method', async () => {
      const mockAddress = '0xImplementationAddress';
      service.getFactoryContract().implementation.mockResolvedValue(mockAddress);

      const result = await service.getImplementationAddress();

      expect(result).toBe(mockAddress);
      expect(service.getFactoryContract().implementation).toHaveBeenCalled();
    });
  });

  describe('verifyFactoryConfig', () => {
    it('should return valid when implementation is set and has code', async () => {
      const factory = service.getFactoryContract();
      factory.implementation.mockResolvedValue('0xValidImplementation');
      (service.getProvider() as any).getCode = vi.fn().mockResolvedValue('0x1234');

      const result = await service.verifyFactoryConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error when implementation is zero address', async () => {
      const factory = service.getFactoryContract();
      factory.implementation.mockResolvedValue('0x0000000000000000000000000000000000000000');

      const result = await service.verifyFactoryConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Implementation address is not set');
    });

    it('should return error when implementation has no code', async () => {
      const factory = service.getFactoryContract();
      factory.implementation.mockResolvedValue('0xValidImplementation');
      (service.getProvider() as any).getCode = vi.fn().mockResolvedValue('0x');

      const result = await service.verifyFactoryConfig();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('has no code');
    });

    it('should return error when factory call fails', async () => {
      const factory = service.getFactoryContract();
      factory.implementation.mockRejectedValue(new Error('Network error'));

      const result = await service.verifyFactoryConfig();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Failed to verify');
    });
  });

  describe('deployWallet', () => {
    it('should throw when signer not set', async () => {
      const config = { owners: ['0x1234'], threshold: 1 };

      await expect(service.deployWallet(config)).rejects.toThrow('Signer not set');
    });

    it('should throw when config is missing', async () => {
      service.setSigner(mockSigner);

      await expect(service.deployWallet(null as any)).rejects.toThrow('Deployment config is required');
    });

    it('should throw when owners is not an array', async () => {
      service.setSigner(mockSigner);
      const config = { owners: 'invalid' as any, threshold: 1 };

      await expect(service.deployWallet(config)).rejects.toThrow('Owners must be an array');
    });

    it('should throw when owners is empty', async () => {
      service.setSigner(mockSigner);
      const config = { owners: [], threshold: 1 };

      await expect(service.deployWallet(config)).rejects.toThrow('At least one owner is required');
    });

    it('should throw when threshold is invalid', async () => {
      service.setSigner(mockSigner);
      const config = { owners: ['0xabcdef0123456789abcdef0123456789abcdef01'], threshold: 0 };

      await expect(service.deployWallet(config)).rejects.toThrow('Invalid threshold');
    });

    it('should throw when threshold exceeds owner count', async () => {
      service.setSigner(mockSigner);
      const config = { owners: ['0xabcdef0123456789abcdef0123456789abcdef01'], threshold: 2 };

      await expect(service.deployWallet(config)).rejects.toThrow('Invalid threshold');
    });
  });

  describe('getWalletInfo', () => {
    it('should return wallet info with owners, threshold, and balance', async () => {
      const walletAddress = '0xWalletAddress';
      const mockOwners = ['0xOwner1', '0xOwner2'];
      const mockThreshold = 2n;
      const mockBalance = 1000000000000000000n;

      // Create a mock wallet contract
      const mockWallet = {
        getOwners: vi.fn().mockResolvedValue(mockOwners),
        threshold: vi.fn().mockResolvedValue(mockThreshold),
      };

      // Mock getWalletContract to return our mock
      vi.spyOn(service as any, 'getWalletContract').mockReturnValue(mockWallet);
      (service.getProvider() as any).getBalance = vi.fn().mockResolvedValue(mockBalance);

      const result = await service.getWalletInfo(walletAddress);

      expect(result).toEqual({
        address: walletAddress,
        owners: mockOwners,
        threshold: 2,
        balance: mockBalance.toString(),
      });
    });

    it('should throw when wallet contract call fails', async () => {
      const walletAddress = '0xWalletAddress';
      const mockWallet = {
        getOwners: vi.fn().mockRejectedValue(new Error('Contract error')),
        threshold: vi.fn(),
      };

      vi.spyOn(service as any, 'getWalletContract').mockReturnValue(mockWallet);

      await expect(service.getWalletInfo(walletAddress)).rejects.toThrow();
    });
  });

  describe('getWalletsForOwner', () => {
    it('should return list of wallet addresses', async () => {
      const ownerAddress = '0xOwnerAddress';
      const mockWallets = ['0xWallet1', '0xWallet2'];
      service.getFactoryContract().getWalletsByCreator.mockResolvedValue(mockWallets);

      const result = await service.getWalletsForOwner(ownerAddress);

      expect(result).toEqual(mockWallets);
      expect(service.getFactoryContract().getWalletsByCreator).toHaveBeenCalledWith(ownerAddress);
    });

    it('should throw when factory call fails', async () => {
      service.getFactoryContract().getWalletsByCreator.mockRejectedValue(new Error('Network error'));

      await expect(service.getWalletsForOwner('0xOwner')).rejects.toThrow();
    });
  });

  describe('isOwner', () => {
    it('should return true when address is owner', async () => {
      const mockWallet = {
        isOwner: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(service as any, 'getWalletContract').mockReturnValue(mockWallet);

      const result = await service.isOwner('0xWallet', '0xOwner');

      expect(result).toBe(true);
      expect(mockWallet.isOwner).toHaveBeenCalledWith('0xOwner');
    });

    it('should return false when address is not owner', async () => {
      const mockWallet = {
        isOwner: vi.fn().mockResolvedValue(false),
      };
      vi.spyOn(service as any, 'getWalletContract').mockReturnValue(mockWallet);

      const result = await service.isOwner('0xWallet', '0xNotOwner');

      expect(result).toBe(false);
    });
  });

  describe('isModuleEnabled', () => {
    it('should return true when module is enabled', async () => {
      const mockWallet = {
        isModuleEnabled: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(service as any, 'getWalletContract').mockReturnValue(mockWallet);

      const result = await service.isModuleEnabled('0xWallet', '0xModule');

      expect(result).toBe(true);
      expect(mockWallet.isModuleEnabled).toHaveBeenCalledWith('0xModule');
    });

    it('should return false when module is not enabled', async () => {
      const mockWallet = {
        isModuleEnabled: vi.fn().mockResolvedValue(false),
      };
      vi.spyOn(service as any, 'getWalletContract').mockReturnValue(mockWallet);

      const result = await service.isModuleEnabled('0xWallet', '0xModule');

      expect(result).toBe(false);
    });
  });

  describe('getFactoryContract', () => {
    it('should return factory contract', () => {
      const factory = service.getFactoryContract();
      expect(factory).toBeDefined();
    });
  });

  describe('extractWalletAddressFromReceipt', () => {
    it('should extract wallet address from WalletCreated event', () => {
      const mockReceipt = {
        logs: [
          {
            topics: ['0xevent1'],
            data: '0x',
          },
        ],
      };

      const factory = service.getFactoryContract();
      factory.interface = {
        parseLog: vi.fn().mockReturnValue({
          name: 'WalletCreated',
          args: { wallet: '0xNewWallet' },
        }),
      };

      const result = service.extractWalletAddressFromReceipt(mockReceipt);

      expect(result).toBe('0xNewWallet');
    });

    it('should throw when event not found', () => {
      const mockReceipt = {
        logs: [],
      };

      expect(() => service.extractWalletAddressFromReceipt(mockReceipt)).toThrow(
        'Wallet creation event not found'
      );
    });

    it('should throw when wallet address not in event', () => {
      const mockReceipt = {
        logs: [
          {
            topics: ['0xevent1'],
            data: '0x',
          },
        ],
      };

      const factory = service.getFactoryContract();
      factory.interface = {
        parseLog: vi.fn().mockReturnValue({
          name: 'WalletCreated',
          args: {},
        }),
      };

      expect(() => service.extractWalletAddressFromReceipt(mockReceipt)).toThrow(
        'Failed to get wallet address from event'
      );
    });
  });
});
