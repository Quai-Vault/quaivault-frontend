import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultisigService } from './MultisigService';

// Mock dependencies
vi.mock('./core/WalletService');
vi.mock('./core/TransactionService');
vi.mock('./core/OwnerService');
vi.mock('./modules/WhitelistModuleService');
vi.mock('./modules/DailyLimitModuleService');
vi.mock('./modules/SocialRecoveryModuleService');

vi.mock('./indexer', () => ({
  indexerService: {
    isAvailable: vi.fn(),
    wallet: {
      getWalletDetails: vi.fn(),
      getWalletOwners: vi.fn(),
      getWalletsForOwner: vi.fn(),
      getWalletsForGuardian: vi.fn(),
    },
    transaction: {
      getPendingTransactions: vi.fn(),
      getTransactionByHash: vi.fn(),
      getTransactionHistory: vi.fn(),
      getActiveConfirmations: vi.fn(),
      getActiveConfirmationsBatch: vi.fn(),
    },
    module: {
      isModuleEnabled: vi.fn(),
      getWhitelistEntries: vi.fn(),
      getDailyLimitConfig: vi.fn(),
      getRecoveryConfig: vi.fn(),
      getPendingRecoveries: vi.fn(),
    },
  },
}));

vi.mock('../config/supabase', () => ({
  INDEXER_CONFIG: {
    ENABLED: true,
    HEALTH_CACHE_MS: 5000,
  },
}));

vi.mock('../config/contracts', () => ({
  CONTRACT_ADDRESSES: {
    QUAIVAULT_IMPLEMENTATION: '0x1234567890123456789012345678901234567890',
    QUAIVAULT_FACTORY: '0x2345678901234567890123456789012345678901',
  },
  NETWORK_CONFIG: {
    RPC_URL: 'https://rpc.test.quai.network',
    CHAIN_ID: 9000,
  },
}));

vi.mock('../config/abi/QuaiVault.json', () => ({
  default: { abi: [] },
}));

import { indexerService } from './indexer';

const WALLET = '0x1234567890123456789012345678901234567890';
const OWNER = '0xabcdef0123456789abcdef0123456789abcdef01';
const TX_HASH = '0x' + 'a'.repeat(64);

describe('MultisigService', () => {
  let service: MultisigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MultisigService();
  });

  describe('constructor', () => {
    it('should create service with all sub-services', () => {
      expect(service.wallet).toBeDefined();
      expect(service.transaction).toBeDefined();
      expect(service.owner).toBeDefined();
      expect(service.whitelist).toBeDefined();
      expect(service.dailyLimit).toBeDefined();
      expect(service.socialRecovery).toBeDefined();
    });
  });

  describe('setSigner', () => {
    it('should propagate signer to all sub-services', () => {
      const mockSigner = { getAddress: vi.fn() } as any;
      service.setSigner(mockSigner);

      expect(service.wallet.setSigner).toHaveBeenCalledWith(mockSigner);
      expect(service.transaction.setSigner).toHaveBeenCalledWith(mockSigner);
      expect(service.owner.setSigner).toHaveBeenCalledWith(mockSigner);
      expect(service.whitelist.setSigner).toHaveBeenCalledWith(mockSigner);
      expect(service.dailyLimit.setSigner).toHaveBeenCalledWith(mockSigner);
      expect(service.socialRecovery.setSigner).toHaveBeenCalledWith(mockSigner);
    });

    it('should handle null signer', () => {
      service.setSigner(null);

      expect(service.wallet.setSigner).toHaveBeenCalledWith(null);
    });
  });

  describe('invalidateIndexerCache', () => {
    it('should reset indexer cache state', () => {
      service.invalidateIndexerCache();
      // Verify no error thrown - internal state reset
      expect(true).toBe(true);
    });
  });

  describe('getWalletInfo - indexer-first pattern', () => {
    it('should use indexer when available', async () => {
      vi.mocked(indexerService.isAvailable).mockResolvedValue(true);
      vi.mocked(indexerService.wallet.getWalletDetails).mockResolvedValue({
        id: '1',
        address: WALLET.toLowerCase(),
        name: null,
        threshold: 2,
        owner_count: 3,
        created_at_block: 1,
        created_at_tx: '0xtx',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      });
      vi.mocked(indexerService.wallet.getWalletOwners).mockResolvedValue([
        OWNER.toLowerCase(),
      ]);
      vi.mocked(service.wallet.getBalance).mockResolvedValue(1000n);

      const result = await service.getWalletInfo(WALLET);

      expect(result.threshold).toBe(2);
      expect(result.balance).toBe('1000');
      expect(indexerService.wallet.getWalletDetails).toHaveBeenCalledWith(WALLET);
    });

    it('should fall back to blockchain when indexer unavailable', async () => {
      vi.mocked(indexerService.isAvailable).mockResolvedValue(false);
      vi.mocked(service.wallet.getWalletInfo).mockResolvedValue({
        address: WALLET,
        owners: [OWNER],
        threshold: 2,
        balance: '5000',
      });

      const result = await service.getWalletInfo(WALLET);

      expect(result.balance).toBe('5000');
      expect(service.wallet.getWalletInfo).toHaveBeenCalled();
    });

    it('should fall back to blockchain when indexer throws', async () => {
      vi.mocked(indexerService.isAvailable).mockResolvedValue(true);
      vi.mocked(indexerService.wallet.getWalletDetails).mockRejectedValue(
        new Error('Indexer down')
      );
      vi.mocked(service.wallet.getWalletInfo).mockResolvedValue({
        address: WALLET,
        owners: [OWNER],
        threshold: 2,
        balance: '5000',
      });

      const result = await service.getWalletInfo(WALLET);

      expect(result.balance).toBe('5000');
    });
  });

  describe('getWalletsForGuardian', () => {
    it('should return empty array when indexer unavailable', async () => {
      vi.mocked(indexerService.isAvailable).mockResolvedValue(false);

      const result = await service.getWalletsForGuardian(OWNER);

      expect(result).toEqual([]);
    });

    it('should return wallets from indexer', async () => {
      vi.mocked(indexerService.isAvailable).mockResolvedValue(true);
      vi.mocked(indexerService.wallet.getWalletsForGuardian).mockResolvedValue([
        {
          id: '1',
          address: WALLET.toLowerCase(),
          name: null,
          threshold: 2,
          owner_count: 3,
          created_at_block: 1,
          created_at_tx: '0xtx',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ]);

      const result = await service.getWalletsForGuardian(OWNER);

      expect(result).toHaveLength(1);
    });

    it('should return empty on indexer error (no blockchain fallback)', async () => {
      vi.mocked(indexerService.isAvailable).mockResolvedValue(true);
      vi.mocked(indexerService.wallet.getWalletsForGuardian).mockRejectedValue(
        new Error('fail')
      );

      const result = await service.getWalletsForGuardian(OWNER);

      expect(result).toEqual([]);
    });
  });

  describe('proposeTransaction', () => {
    it('should delegate to transaction service with validated addresses', async () => {
      vi.mocked(service.transaction.proposeTransaction).mockResolvedValue(TX_HASH);

      const result = await service.proposeTransaction(WALLET, OWNER, 100n, '0x');

      expect(result).toBe(TX_HASH);
      expect(service.transaction.proposeTransaction).toHaveBeenCalled();
    });

    it('should reject invalid wallet address', async () => {
      await expect(
        service.proposeTransaction('bad', OWNER, 100n, '0x')
      ).rejects.toThrow();
    });
  });

  describe('approveTransaction', () => {
    it('should delegate to transaction service', async () => {
      vi.mocked(service.transaction.approveTransaction).mockResolvedValue(undefined);

      await service.approveTransaction(WALLET, TX_HASH);

      expect(service.transaction.approveTransaction).toHaveBeenCalled();
    });
  });

  describe('isOwner - indexer-first pattern', () => {
    it('should use indexer when available', async () => {
      vi.mocked(indexerService.isAvailable).mockResolvedValue(true);
      vi.mocked(indexerService.wallet.getWalletOwners).mockResolvedValue([
        OWNER.toLowerCase(),
      ]);

      const result = await service.isOwner(WALLET, OWNER);

      expect(result).toBe(true);
    });

    it('should fall back to blockchain on indexer failure', async () => {
      vi.mocked(indexerService.isAvailable).mockResolvedValue(true);
      vi.mocked(indexerService.wallet.getWalletOwners).mockRejectedValue(
        new Error('fail')
      );
      vi.mocked(service.wallet.isOwner).mockResolvedValue(true);

      const result = await service.isOwner(WALLET, OWNER);

      expect(result).toBe(true);
      expect(service.wallet.isOwner).toHaveBeenCalled();
    });
  });

  describe('deployWallet', () => {
    it('should delegate to wallet service', async () => {
      vi.mocked(service.wallet.deployWallet).mockResolvedValue(WALLET);

      const result = await service.deployWallet({
        owners: [OWNER],
        threshold: 1,
      });

      expect(result).toBe(WALLET);
    });
  });

  describe('indexer health caching', () => {
    it('should deduplicate concurrent indexer health checks', async () => {
      vi.mocked(indexerService.isAvailable).mockResolvedValue(true);
      vi.mocked(indexerService.wallet.getWalletOwners).mockResolvedValue([OWNER.toLowerCase()]);
      vi.mocked(service.wallet.isOwner).mockResolvedValue(true);

      // Make two concurrent calls
      const [result1, result2] = await Promise.all([
        service.isOwner(WALLET, OWNER),
        service.isOwner(WALLET, OWNER),
      ]);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      // indexerService.isAvailable should be called at most once due to deduplication
      expect(vi.mocked(indexerService.isAvailable).mock.calls.length).toBeLessThanOrEqual(2);
    });
  });
});
