import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexerTransactionService } from './IndexerTransactionService';

const WALLET = '0x1234567890123456789012345678901234567890';
const HASH_A = '0x' + 'a'.repeat(64);
const HASH_B = '0x' + 'b'.repeat(64);

/** Records how the query was composed while still being awaitable. */
function createChain(result: { data?: unknown; error?: unknown; count?: number } = {}) {
  const final = { data: result.data ?? [], error: result.error ?? null, count: result.count ?? 0 };
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string) =>
    vi.fn((...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return chain;
    });

  const chain: Record<string, unknown> = {
    select: record('select'),
    eq: record('eq'),
    in: record('in'),
    order: record('order'),
    limit: record('limit'),
    range: record('range'),
    calls,
    then: (resolve: (v: unknown) => unknown) => resolve(final),
  };
  return chain;
}

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('../../config/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
  INDEXER_CONFIG: { ENABLED: true },
}));

const confirmation = (txHash: string, owner: string, isActive = true) => ({
  id: `${txHash}-${owner}`,
  wallet_address: WALLET.toLowerCase(),
  tx_hash: txHash,
  owner_address: owner,
  confirmed_at_block: 10,
  confirmed_at_tx: HASH_B,
  revoked_at_block: null,
  revoked_at_tx: null,
  is_active: isActive,
  created_at: '2026-01-01T00:00:00Z',
});

const transaction = (id: string, status = 'executed') => ({
  id,
  wallet_address: WALLET.toLowerCase(),
  tx_hash: HASH_A,
  to_address: WALLET.toLowerCase(),
  value: '0',
  data: '0x',
  transaction_type: 'transfer',
  decoded_params: null,
  status,
  confirmation_count: 1,
  submitted_by: WALLET.toLowerCase(),
  submitted_at_block: 1,
  submitted_at_tx: HASH_B,
  executed_at_block: null,
  executed_at_tx: null,
  executed_by: null,
  cancelled_at_block: null,
  cancelled_at_tx: null,
  expiration: 0,
  execution_delay: 0,
  approved_at: 0,
  executable_after: 0,
  is_expired: false,
  failed_return_data: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const callsOf = (chain: Record<string, unknown>) => chain.calls as Record<string, unknown[][]>;

describe('IndexerTransactionService queries', () => {
  let service: IndexerTransactionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IndexerTransactionService();
  });

  describe('getActiveConfirmations', () => {
    it('asks only for active confirmations of that transaction', async () => {
      const chain = createChain({ data: [confirmation(HASH_A, WALLET)] });
      mockFrom.mockReturnValue(chain);

      await service.getActiveConfirmations(WALLET, HASH_A);

      const eq = callsOf(chain).eq;
      expect(eq).toContainEqual(['tx_hash', HASH_A]);
      expect(eq).toContainEqual(['is_active', true]);
      expect(eq).toContainEqual(['wallet_address', WALLET.toLowerCase()]);
    });

    it('orders oldest first, so approval order is stable', async () => {
      const chain = createChain({ data: [] });
      mockFrom.mockReturnValue(chain);

      await service.getActiveConfirmations(WALLET, HASH_A);

      expect(callsOf(chain).order[0]).toEqual(['created_at', { ascending: true }]);
    });

    it('throws when the query fails', async () => {
      mockFrom.mockReturnValue(createChain({ error: { message: 'confirmations gone' } }));

      await expect(service.getActiveConfirmations(WALLET, HASH_A)).rejects.toThrow(
        /confirmations gone/
      );
    });

    it('rejects a malformed hash before querying', async () => {
      await expect(service.getActiveConfirmations(WALLET, '0xtooshort')).rejects.toThrow();
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('getConfirmationsByTxHash', () => {
    // Unlike getActiveConfirmations, this one deliberately includes revoked
    // rows — it is the audit view, not the approval count.
    it('does not filter out revoked confirmations', async () => {
      const chain = createChain({ data: [confirmation(HASH_A, WALLET, false)] });
      mockFrom.mockReturnValue(chain);

      const result = await service.getConfirmationsByTxHash(WALLET, HASH_A);

      expect(callsOf(chain).eq.some(([column]) => column === 'is_active')).toBe(false);
      expect(result[0].is_active).toBe(false);
    });
  });

  describe('getActiveConfirmationsBatch', () => {
    it('returns an empty map without querying for no hashes', async () => {
      expect((await service.getActiveConfirmationsBatch(WALLET, [])).size).toBe(0);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('fetches every hash in one query rather than one each', async () => {
      const chain = createChain({ data: [] });
      mockFrom.mockReturnValue(chain);

      await service.getActiveConfirmationsBatch(WALLET, [HASH_A, HASH_B]);

      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(callsOf(chain).in[0]).toEqual(['tx_hash', [HASH_A, HASH_B]]);
    });

    it('groups confirmations under the transaction they belong to', async () => {
      mockFrom.mockReturnValue(
        createChain({
          data: [confirmation(HASH_A, '0xowner1'), confirmation(HASH_B, '0xowner2')],
        })
      );

      const result = await service.getActiveConfirmationsBatch(WALLET, [HASH_A, HASH_B]);

      expect(result.get(HASH_A)).toHaveLength(1);
      expect(result.get(HASH_B)).toHaveLength(1);
    });

    // Callers index the result by the hash they passed and treat a miss as
    // "no approvals", so every requested hash needs an entry even when the
    // transaction has none.
    it('includes an empty entry for a transaction with no confirmations', async () => {
      mockFrom.mockReturnValue(createChain({ data: [confirmation(HASH_A, '0xowner1')] }));

      const result = await service.getActiveConfirmationsBatch(WALLET, [HASH_A, HASH_B]);

      expect(result.get(HASH_B)).toEqual([]);
    });

    // The map has to be keyed by exactly what the caller handed over.
    // Validation normalises a missing 0x prefix, so grouping by the returned
    // hash while seeding by the original would leave the caller reading an
    // empty entry and concluding nobody had approved.
    it('keys the result by the hashes it was given, not the normalised ones', async () => {
      const bare = 'a'.repeat(64);
      mockFrom.mockReturnValue(createChain({ data: [confirmation(HASH_A, '0xowner1')] }));

      const result = await service.getActiveConfirmationsBatch(WALLET, [bare]);

      expect(result.get(bare)).toHaveLength(1);
    });

    it('throws when the query fails', async () => {
      mockFrom.mockReturnValue(createChain({ error: { message: 'batch failed' } }));

      await expect(service.getActiveConfirmationsBatch(WALLET, [HASH_A])).rejects.toThrow(
        /batch failed/
      );
    });
  });

  describe('getTransactionHistory', () => {
    it('asks only for finished transactions', async () => {
      const chain = createChain({ data: [], count: 0 });
      mockFrom.mockReturnValue(chain);

      await service.getTransactionHistory(WALLET);

      expect(callsOf(chain).in[0]).toEqual([
        'status',
        ['executed', 'cancelled', 'expired', 'failed'],
      ]);
    });

    it('orders newest first', async () => {
      const chain = createChain({ data: [], count: 0 });
      mockFrom.mockReturnValue(chain);

      await service.getTransactionHistory(WALLET);

      expect(callsOf(chain).order[0]).toEqual(['created_at', { ascending: false }]);
    });

    it('reports the server-side total alongside the page', async () => {
      mockFrom.mockReturnValue(createChain({ data: [transaction('1')], count: 40 }));

      const result = await service.getTransactionHistory(WALLET);

      expect(result.total).toBe(40);
      expect(result.hasMore).toBe(true);
    });

    it('reports no more rows once the offset plus page reaches the total', async () => {
      mockFrom.mockReturnValue(createChain({ data: [transaction('1')], count: 3 }));

      expect((await service.getTransactionHistory(WALLET, { offset: 2 })).hasMore).toBe(false);
    });

    it('requests the range the offset and limit describe', async () => {
      const chain = createChain({ data: [], count: 0 });
      mockFrom.mockReturnValue(chain);

      await service.getTransactionHistory(WALLET, { offset: 50, limit: 25 });

      expect(callsOf(chain).range[0]).toEqual([50, 74]);
    });

    it('clamps an oversized page rather than fetching the table', async () => {
      const chain = createChain({ data: [], count: 0 });
      mockFrom.mockReturnValue(chain);

      await service.getTransactionHistory(WALLET, { limit: 100_000 });

      const [start, end] = callsOf(chain).range[0] as number[];
      expect(end - start + 1).toBeLessThan(100_000);
    });

    it('throws when the query fails', async () => {
      mockFrom.mockReturnValue(createChain({ error: { message: 'history gone' } }));

      await expect(service.getTransactionHistory(WALLET)).rejects.toThrow(/history gone/);
    });
  });
});
