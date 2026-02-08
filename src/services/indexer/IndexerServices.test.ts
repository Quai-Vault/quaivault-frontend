import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexerWalletService } from './IndexerWalletService';
import { IndexerTransactionService } from './IndexerTransactionService';
import { IndexerModuleService } from './IndexerModuleService';

// Valid test addresses
const WALLET = '0x1234567890123456789012345678901234567890';
const OWNER = '0xabcdef0123456789abcdef0123456789abcdef01';
const MODULE = '0x9876543210987654321098765432109876543210';
const TX_HASH = '0x' + 'a'.repeat(64);

// Mock supabase client
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockRange = vi.fn();
const mockSingle = vi.fn();

function createChainedMock(finalResult: any = { data: [], error: null }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(finalResult);
  // Make the chain itself thenable for queries without .single()
  chain.then = (resolve: any) => resolve(finalResult);
  return chain;
}

const mockFrom = vi.fn();

vi.mock('../../config/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
  },
  INDEXER_CONFIG: {
    ENABLED: true,
    HEALTH_CACHE_MS: 5000,
  },
}));

vi.mock('../../config/contracts', () => ({
  CONTRACT_ADDRESSES: {
    QUAIVAULT_IMPLEMENTATION: '0x1234567890123456789012345678901234567890',
  },
  NETWORK_CONFIG: {
    RPC_URL: 'https://rpc.test.quai.network',
  },
}));

// ============ IndexerWalletService ============

describe('IndexerWalletService', () => {
  let service: IndexerWalletService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IndexerWalletService();
  });

  describe('getWalletDetails', () => {
    it('should return wallet when found', async () => {
      const walletData = {
        id: '1',
        address: WALLET.toLowerCase(),
        name: null,
        threshold: 2,
        owner_count: 3,
        created_at_block: 100,
        created_at_tx: '0xtx',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const chain = createChainedMock({ data: walletData, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await service.getWalletDetails(WALLET);

      expect(result).toBeDefined();
      expect(result?.threshold).toBe(2);
      expect(mockFrom).toHaveBeenCalledWith('wallets');
    });

    it('should return null when wallet not found (PGRST116)', async () => {
      const chain = createChainedMock({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.getWalletDetails(WALLET);

      expect(result).toBeNull();
    });

    it('should throw on other Supabase errors', async () => {
      const chain = createChainedMock({
        data: null,
        error: { code: '500', message: 'Internal server error' },
      });
      mockFrom.mockReturnValue(chain);

      await expect(service.getWalletDetails(WALLET)).rejects.toThrow('Indexer query failed');
    });

    it('should reject invalid address', async () => {
      await expect(service.getWalletDetails('bad')).rejects.toThrow();
    });
  });

  describe('getWalletOwners', () => {
    it('should return owner addresses', async () => {
      const chain = createChainedMock({
        data: [
          { owner_address: OWNER.toLowerCase() },
        ],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.getWalletOwners(WALLET);

      expect(result).toEqual([OWNER.toLowerCase()]);
    });

    it('should return empty array on null data', async () => {
      const chain = createChainedMock({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await service.getWalletOwners(WALLET);

      expect(result).toEqual([]);
    });
  });
});

// ============ IndexerTransactionService ============

describe('IndexerTransactionService', () => {
  let service: IndexerTransactionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IndexerTransactionService();
  });

  function makeTxData(overrides: Record<string, unknown> = {}) {
    return {
      id: '1',
      wallet_address: WALLET.toLowerCase(),
      tx_hash: TX_HASH,
      to_address: OWNER.toLowerCase(),
      value: '1000000000000000000',
      data: '0x',
      transaction_type: 'transfer',
      decoded_params: null,
      status: 'pending',
      confirmation_count: 1,
      submitted_by: OWNER.toLowerCase(),
      submitted_at_block: 100,
      submitted_at_tx: '0xtx',
      executed_at_block: null,
      executed_at_tx: null,
      executed_by: null,
      cancelled_at_block: null,
      cancelled_at_tx: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...overrides,
    };
  }

  describe('getPendingTransactions', () => {
    it('should return parsed transactions', async () => {
      const chain = createChainedMock({
        data: [makeTxData()],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.getPendingTransactions(WALLET);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
      expect(mockFrom).toHaveBeenCalledWith('transactions');
    });

    it('should throw on query error', async () => {
      const chain = createChainedMock({
        data: null,
        error: { message: 'Connection refused' },
      });
      mockFrom.mockReturnValue(chain);

      await expect(service.getPendingTransactions(WALLET)).rejects.toThrow(
        'Indexer query failed'
      );
    });
  });

  describe('getTransactionByHash', () => {
    it('should return transaction when found', async () => {
      const chain = createChainedMock({
        data: makeTxData(),
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.getTransactionByHash(WALLET, TX_HASH);

      expect(result).toBeDefined();
      expect(result?.tx_hash).toBe(TX_HASH);
    });

    it('should return null on not found', async () => {
      const chain = createChainedMock({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.getTransactionByHash(WALLET, TX_HASH);

      expect(result).toBeNull();
    });
  });

  describe('getActiveConfirmationsBatch', () => {
    it('should return empty map for empty hashes', async () => {
      const result = await service.getActiveConfirmationsBatch(WALLET, []);

      expect(result.size).toBe(0);
    });

    it('should group confirmations by tx_hash', async () => {
      const hash1 = '0x' + 'a'.repeat(64);
      const hash2 = '0x' + 'b'.repeat(64);

      const confirmationData = [
        {
          id: '1',
          wallet_address: WALLET.toLowerCase(),
          tx_hash: hash1,
          owner_address: OWNER.toLowerCase(),
          confirmed_at_block: 100,
          confirmed_at_tx: '0xtx1',
          revoked_at_block: null,
          revoked_at_tx: null,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: '2',
          wallet_address: WALLET.toLowerCase(),
          tx_hash: hash2,
          owner_address: OWNER.toLowerCase(),
          confirmed_at_block: 101,
          confirmed_at_tx: '0xtx2',
          revoked_at_block: null,
          revoked_at_tx: null,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ];

      const chain = createChainedMock({
        data: confirmationData,
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.getActiveConfirmationsBatch(WALLET, [hash1, hash2]);

      expect(result.size).toBe(2);
      expect(result.get(hash1)).toHaveLength(1);
      expect(result.get(hash2)).toHaveLength(1);
    });
  });
});

// ============ IndexerModuleService ============

describe('IndexerModuleService', () => {
  let service: IndexerModuleService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IndexerModuleService();
  });

  describe('isModuleEnabled', () => {
    it('should return true when module is active', async () => {
      const chain = createChainedMock({
        data: [{ is_active: true }],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.isModuleEnabled(WALLET, MODULE);

      expect(result).toBe(true);
    });

    it('should return false when no matching record', async () => {
      const chain = createChainedMock({
        data: [],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.isModuleEnabled(WALLET, MODULE);

      expect(result).toBe(false);
    });

    it('should throw on table not found error', async () => {
      const chain = createChainedMock({
        data: null,
        error: { code: '42P01', message: 'relation does not exist' },
      });
      mockFrom.mockReturnValue(chain);

      await expect(service.isModuleEnabled(WALLET, MODULE)).rejects.toThrow(
        'wallet_modules table not available'
      );
    });
  });

  describe('getDailyLimitConfig', () => {
    it('should return config when found', async () => {
      const chain = createChainedMock({
        data: {
          id: '1',
          wallet_address: WALLET.toLowerCase(),
          daily_limit: '1000000000000000000',
          spent_today: '0',
          last_reset_day: '2026-01-01',
          updated_at: '2026-01-01T00:00:00Z',
        },
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.getDailyLimitConfig(WALLET);

      expect(result).toBeDefined();
      expect(result?.limit).toBe('1000000000000000000');
      expect(result?.spent).toBe('0');
    });

    it('should return null when not found', async () => {
      const chain = createChainedMock({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.getDailyLimitConfig(WALLET);

      expect(result).toBeNull();
    });
  });

  describe('getWhitelistEntries', () => {
    it('should return mapped whitelist entries', async () => {
      const chain = createChainedMock({
        data: [
          {
            id: '1',
            wallet_address: WALLET.toLowerCase(),
            whitelisted_address: OWNER.toLowerCase(),
            limit_amount: '5000000000000000000',
            added_at_block: 100,
            added_at_tx: '0xtx',
            removed_at_block: null,
            removed_at_tx: null,
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.getWhitelistEntries(WALLET);

      expect(result).toHaveLength(1);
      expect(result[0].address).toBe(OWNER.toLowerCase());
      expect(result[0].limit).toBe('5000000000000000000');
    });
  });

  describe('getRecoveryConfig', () => {
    it('should return null when config not found', async () => {
      // getRecoveryConfig calls Promise.all with two queries
      // First call for config, second for guardians
      const configChain = createChainedMock({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      const guardiansChain = createChainedMock({
        data: [],
        error: null,
      });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? configChain : guardiansChain;
      });

      const result = await service.getRecoveryConfig(WALLET);

      expect(result).toBeNull();
    });
  });

  describe('getModuleStatuses', () => {
    it('should return status map', async () => {
      const chain = createChainedMock({
        data: [
          { module_address: MODULE.toLowerCase(), is_active: true },
        ],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const result = await service.getModuleStatuses(WALLET);

      expect(result[MODULE.toLowerCase()]).toBe(true);
    });
  });
});
