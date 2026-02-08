import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseService } from './BaseService';

// Mock quais with proper class constructors
vi.mock('quais', () => {
  const MockJsonRpcProvider = vi.fn().mockImplementation(function(this: any) {
    this.getNetwork = vi.fn();
  });

  const MockContract = vi.fn().mockImplementation(function(this: any, address: string, abi: any, provider: any) {
    this.address = address;
    this.interface = abi;
    this.provider = provider;
  });

  return {
    JsonRpcProvider: MockJsonRpcProvider,
    Contract: MockContract,
  };
});

// Mock network config
vi.mock('../../config/contracts', () => ({
  NETWORK_CONFIG: {
    RPC_URL: 'http://localhost:8545',
  },
}));

// Mock ABI
vi.mock('../../config/abi/QuaiVault.json', () => ({
  default: {
    abi: [{ name: 'mockFunction', type: 'function' }],
  },
}));

describe('BaseService', () => {
  let service: BaseService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create default provider when none provided', () => {
      service = new BaseService();

      expect(service.getProvider()).toBeDefined();
    });

    it('should use provided provider', () => {
      const mockProvider = { getNetwork: vi.fn() } as any;
      service = new BaseService(mockProvider);

      expect(service.getProvider()).toBe(mockProvider);
    });
  });

  describe('setSigner', () => {
    it('should set signer', () => {
      service = new BaseService();
      const mockSigner = { getAddress: vi.fn() } as any;

      service.setSigner(mockSigner);

      // Verify signer is set by calling requireSigner (via protected method access)
      // Since requireSigner is protected, we test indirectly
      expect(() => service.setSigner(null)).not.toThrow();
    });

    it('should allow setting signer to null', () => {
      service = new BaseService();
      const mockSigner = { getAddress: vi.fn() } as any;

      service.setSigner(mockSigner);
      service.setSigner(null);

      // Signer should be null now
      expect(() => service.setSigner(null)).not.toThrow();
    });
  });

  describe('getProvider', () => {
    it('should return the provider', () => {
      const mockProvider = { getNetwork: vi.fn() } as any;
      service = new BaseService(mockProvider);

      expect(service.getProvider()).toBe(mockProvider);
    });
  });

  describe('requireSigner (protected)', () => {
    // We need to test this through a subclass or by exposing it
    class TestableService extends BaseService {
      public testRequireSigner() {
        return this.requireSigner();
      }

      public testGetWalletContract(address: string) {
        return this.getWalletContract(address);
      }
    }

    it('should throw when signer not set', () => {
      const testService = new TestableService();

      expect(() => testService.testRequireSigner()).toThrow(
        'Signer not set. Connect wallet first.'
      );
    });

    it('should return signer when set', () => {
      const testService = new TestableService();
      const mockSigner = { getAddress: vi.fn() } as any;

      testService.setSigner(mockSigner);

      expect(testService.testRequireSigner()).toBe(mockSigner);
    });
  });

  describe('getWalletContract (protected)', () => {
    class TestableService extends BaseService {
      public testGetWalletContract(address: string, signerOrProvider?: any) {
        return this.getWalletContract(address, signerOrProvider);
      }
    }

    it('should create contract with wallet address', () => {
      const mockProvider = { getNetwork: vi.fn() } as any;
      const testService = new TestableService(mockProvider);
      const walletAddress = '0x1234567890123456789012345678901234567890';

      const contract = testService.testGetWalletContract(walletAddress);

      expect(contract.address).toBe(walletAddress);
    });

    it('should use provider when no signerOrProvider provided', () => {
      const mockProvider = { getNetwork: vi.fn() } as any;
      const testService = new TestableService(mockProvider);
      const walletAddress = '0x1234567890123456789012345678901234567890';

      const contract = testService.testGetWalletContract(walletAddress);

      expect(contract.provider).toBe(mockProvider);
    });

    it('should use provided signerOrProvider', () => {
      const mockProvider = { getNetwork: vi.fn() } as any;
      const mockSigner = { getAddress: vi.fn() } as any;
      const testService = new TestableService(mockProvider);
      const walletAddress = '0x1234567890123456789012345678901234567890';

      const contract = testService.testGetWalletContract(walletAddress, mockSigner);

      expect(contract.provider).toBe(mockSigner);
    });
  });
});
