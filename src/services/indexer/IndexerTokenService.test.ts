import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexerTokenService } from './IndexerTokenService';

const WALLET = '0x1234567890123456789012345678901234567890';
const TOKEN_A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/**
 * A supabase query chain that records the calls made against it. Every builder
 * method returns the chain, and the chain itself is thenable, so a test can
 * both await it and assert how the query was composed.
 */
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

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));

vi.mock('../../config/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  INDEXER_CONFIG: { ENABLED: true },
}));

describe('IndexerTokenService', () => {
  let service: IndexerTokenService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IndexerTokenService();
  });

  const token = (address: string) => ({
    id: `token-${address}`,
    address,
    standard: 'ERC20' as const,
    symbol: 'TST',
    name: 'Test',
    decimals: 18,
    discovered_at_block: 1,
    discovered_via: 'transfer',
    created_at: '2026-01-01T00:00:00Z',
  });

  describe('getTokensForWallet', () => {
    it('asks the server for distinct token addresses rather than every transfer', async () => {
      mockRpc.mockResolvedValue({ data: [{ token_address: TOKEN_A }], error: null });
      mockFrom.mockReturnValue(createChain({ data: [token(TOKEN_A.toLowerCase())] }));

      await service.getTokensForWallet(WALLET);

      expect(mockRpc).toHaveBeenCalledWith('get_wallet_token_addresses', {
        p_wallet_address: WALLET.toLowerCase(),
      });
    });

    // No tokens means no second query — the `in` filter would otherwise be
    // empty and the round trip wasted.
    it('short-circuits without a metadata query when the wallet holds none', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });

      expect(await service.getTokensForWallet(WALLET)).toEqual([]);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('lowercases the addresses it looks up', async () => {
      mockRpc.mockResolvedValue({ data: [{ token_address: TOKEN_A }], error: null });
      const chain = createChain({ data: [token(TOKEN_A.toLowerCase())] });
      mockFrom.mockReturnValue(chain);

      await service.getTokensForWallet(WALLET);

      expect((chain.calls as Record<string, unknown[][]>).in[0][1]).toEqual([TOKEN_A.toLowerCase()]);
    });

    it('throws when the distinct-address query fails', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc exploded' } });

      await expect(service.getTokensForWallet(WALLET)).rejects.toThrow(/rpc exploded/);
    });

    it('throws when the metadata query fails', async () => {
      mockRpc.mockResolvedValue({ data: [{ token_address: TOKEN_A }], error: null });
      mockFrom.mockReturnValue(createChain({ error: { message: 'tokens table gone' } }));

      await expect(service.getTokensForWallet(WALLET)).rejects.toThrow(/tokens table gone/);
    });

    it('rejects a malformed wallet address before querying', async () => {
      await expect(service.getTokensForWallet('not-an-address')).rejects.toThrow();
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('getTokenTransfers', () => {
    const transfer = (id: string) => ({
      id,
      token_address: TOKEN_A.toLowerCase(),
      wallet_address: WALLET.toLowerCase(),
      from_address: WALLET.toLowerCase(),
      to_address: TOKEN_B.toLowerCase(),
      value: '1',
      token_id: null,
      direction: 'outflow' as const,
      block_number: 1,
      transaction_hash: '0x' + 'a'.repeat(64),
      log_index: 0,
      created_at: '2026-01-01T00:00:00Z',
    });

    it('reports the server-side total alongside the page', async () => {
      mockFrom.mockReturnValue(createChain({ data: [transfer('1')], count: 25 }));

      const result = await service.getTokenTransfers(WALLET);

      expect(result.total).toBe(25);
      expect(result.data).toHaveLength(1);
    });

    it('reports more rows remaining when the page does not reach the total', async () => {
      mockFrom.mockReturnValue(createChain({ data: [transfer('1'), transfer('2')], count: 10 }));

      expect((await service.getTokenTransfers(WALLET)).hasMore).toBe(true);
    });

    it('reports no more rows on the final page', async () => {
      mockFrom.mockReturnValue(createChain({ data: [transfer('1')], count: 3 }));

      expect((await service.getTokenTransfers(WALLET, { offset: 2 })).hasMore).toBe(false);
    });

    it('requests the range the offset and limit describe', async () => {
      const chain = createChain({ data: [], count: 0 });
      mockFrom.mockReturnValue(chain);

      await service.getTokenTransfers(WALLET, { offset: 20, limit: 10 });

      expect((chain.calls as Record<string, unknown[][]>).range[0]).toEqual([20, 29]);
    });

    // An unbounded limit would let a caller pull the whole table in one query.
    it('clamps an oversized limit', async () => {
      const chain = createChain({ data: [], count: 0 });
      mockFrom.mockReturnValue(chain);

      await service.getTokenTransfers(WALLET, { limit: 100_000 });

      const [start, end] = (chain.calls as Record<string, unknown[][]>).range[0] as number[];
      expect(end - start + 1).toBeLessThan(100_000);
    });

    it('filters by token when one is given', async () => {
      const chain = createChain({ data: [], count: 0 });
      mockFrom.mockReturnValue(chain);

      await service.getTokenTransfers(WALLET, { tokenAddress: TOKEN_A });

      const eqCalls = (chain.calls as Record<string, unknown[][]>).eq;
      expect(eqCalls).toContainEqual(['token_address', TOKEN_A.toLowerCase()]);
    });

    it('does not filter by token when none is given', async () => {
      const chain = createChain({ data: [], count: 0 });
      mockFrom.mockReturnValue(chain);

      await service.getTokenTransfers(WALLET);

      const eqCalls = (chain.calls as Record<string, unknown[][]>).eq;
      expect(eqCalls.some(([column]) => column === 'token_address')).toBe(false);
    });

    it('throws when the query fails', async () => {
      mockFrom.mockReturnValue(createChain({ error: { message: 'transfers gone' } }));

      await expect(service.getTokenTransfers(WALLET)).rejects.toThrow(/transfers gone/);
    });
  });

  describe('getTokensByAddresses', () => {
    it('returns a map keyed by lowercase address', async () => {
      mockFrom.mockReturnValue(createChain({ data: [token(TOKEN_A.toLowerCase())] }));

      const result = await service.getTokensByAddresses([TOKEN_A]);

      expect(result.get(TOKEN_A.toLowerCase())).toMatchObject({ symbol: 'TST' });
    });

    it('returns an empty map without querying for an empty list', async () => {
      expect((await service.getTokensByAddresses([])).size).toBe(0);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('looks up every address in one query', async () => {
      const chain = createChain({ data: [] });
      mockFrom.mockReturnValue(chain);

      await service.getTokensByAddresses([TOKEN_A, TOKEN_B]);

      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect((chain.calls as Record<string, unknown[][]>).in[0][1]).toEqual([
        TOKEN_A.toLowerCase(),
        TOKEN_B.toLowerCase(),
      ]);
    });

    // Unlike the other reads this one degrades rather than throwing: it feeds
    // display enrichment, so a failure should leave names blank, not break the
    // screen.
    it('degrades to an empty map instead of throwing', async () => {
      mockFrom.mockReturnValue(createChain({ error: { message: 'lookup failed' } }));

      await expect(service.getTokensByAddresses([TOKEN_A])).resolves.toEqual(new Map());
    });
  });
});
