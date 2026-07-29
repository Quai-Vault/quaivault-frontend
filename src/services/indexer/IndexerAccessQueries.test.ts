import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexerWalletService } from './IndexerWalletService';
import { IndexerModuleService } from './IndexerModuleService';

const WALLET = '0x1234567890123456789012345678901234567890';
const OWNER = '0xabcdef0123456789abcdef0123456789abcdef01';
const HASH = '0x' + 'a'.repeat(64);

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
    single: vi.fn().mockResolvedValue(final),
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

vi.mock('../../config/contracts', () => ({
  CONTRACT_ADDRESSES: { SOCIAL_RECOVERY_MODULE: '0x9999999999999999999999999999999999999999' },
  NETWORK_CONFIG: { RPC_URL: 'https://rpc.test' },
}));

const wallet = (address: string) => ({
  id: `w-${address}`,
  address,
  name: null,
  threshold: 2,
  owner_count: 3,
  min_execution_delay: 0,
  created_at_block: 1,
  created_at_tx: HASH,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const callsOf = (chain: Record<string, unknown>) => chain.calls as Record<string, unknown[][]>;

describe('IndexerWalletService access listings', () => {
  let service: IndexerWalletService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IndexerWalletService();
  });

  describe.each([
    ['getWalletsForOwner', 'owner_address', (s: IndexerWalletService, a: string) => s.getWalletsForOwner(a)],
    ['getWalletsForGuardian', 'guardian_address', (s: IndexerWalletService, a: string) => s.getWalletsForGuardian(a)],
  ])('%s', (_name, column, call) => {
    it('returns the joined wallets', async () => {
      mockFrom.mockReturnValue(
        createChain({ data: [{ wallet_address: WALLET, wallets: wallet(WALLET) }] })
      );

      const result = await call(service, OWNER);

      expect(result).toHaveLength(1);
      expect(result[0].address).toBe(WALLET);
    });

    // Someone removed from a vault must not keep seeing it listed.
    it('asks only for active rows', async () => {
      const chain = createChain({ data: [] });
      mockFrom.mockReturnValue(chain);

      await call(service, OWNER);

      expect(callsOf(chain).eq).toContainEqual(['is_active', true]);
      expect(callsOf(chain).eq).toContainEqual([column, OWNER.toLowerCase()]);
    });

    // One unreadable row must not cost the caller the rest of their vaults.
    it('drops a row that fails validation and keeps the others', async () => {
      mockFrom.mockReturnValue(
        createChain({
          data: [
            { wallet_address: WALLET, wallets: { address: 'malformed' } },
            { wallet_address: WALLET, wallets: wallet(WALLET) },
          ],
        })
      );

      const result = await call(service, OWNER);

      expect(result).toHaveLength(1);
    });

    it('drops rows whose join produced no wallet', async () => {
      mockFrom.mockReturnValue(
        createChain({ data: [{ wallet_address: WALLET, wallets: null }] })
      );

      expect(await call(service, OWNER)).toEqual([]);
    });

    it('returns nothing when the query yields no rows', async () => {
      mockFrom.mockReturnValue(createChain({ data: null }));

      expect(await call(service, OWNER)).toEqual([]);
    });

    it('throws when the query fails', async () => {
      mockFrom.mockReturnValue(createChain({ error: { message: 'join blew up' } }));

      await expect(call(service, OWNER)).rejects.toThrow(/join blew up/);
    });

    it('rejects a malformed address before querying', async () => {
      await expect(call(service, 'nonsense')).rejects.toThrow();
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});

describe('IndexerModuleService.getPendingRecoveries', () => {
  let service: IndexerModuleService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IndexerModuleService();
  });

  const recovery = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    wallet_address: WALLET.toLowerCase(),
    recovery_hash: HASH,
    new_owners: [OWNER],
    new_threshold: 1,
    initiator_address: OWNER,
    approval_count: 1,
    required_threshold: 2,
    execution_time: 1_700_000_000,
    expiration: 1_700_100_000,
    status: 'pending' as const,
    initiated_at_block: 5,
    initiated_at_tx: HASH,
    executed_at_block: null,
    executed_at_tx: null,
    cancelled_at_block: null,
    cancelled_at_tx: null,
    expired_at_block: null,
    expired_at_tx: null,
    invalidated_at_block: null,
    invalidated_at_tx: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  });

  // A recovery takes over the vault, so only genuinely pending ones should
  // raise the banner — a cancelled or executed one must not.
  it('asks only for pending recoveries', async () => {
    const chain = createChain({ data: [] });
    mockFrom.mockReturnValue(chain);

    await service.getPendingRecoveries(WALLET);

    expect(callsOf(chain).eq).toContainEqual(['status', 'pending']);
    expect(callsOf(chain).eq).toContainEqual(['wallet_address', WALLET.toLowerCase()]);
  });

  it('maps the row onto the shape the banner reads', async () => {
    mockFrom.mockReturnValue(createChain({ data: [recovery()] }));

    const [pending] = await service.getPendingRecoveries(WALLET);

    expect(pending).toMatchObject({
      recoveryHash: HASH,
      newOwners: [OWNER],
      newThreshold: 1,
      approvalCount: 1,
      requiredThreshold: 2,
      executionTime: 1_700_000_000,
      expiration: 1_700_100_000,
      status: 'pending',
    });
  });

  // executionTime drives the countdown; a null expiration must read as "no
  // expiry" rather than leaking null into the comparison.
  it('reports a missing expiration as zero', async () => {
    mockFrom.mockReturnValue(createChain({ data: [recovery({ expiration: null })] }));

    expect((await service.getPendingRecoveries(WALLET))[0].expiration).toBe(0);
  });

  it('returns nothing when the vault has no pending recovery', async () => {
    mockFrom.mockReturnValue(createChain({ data: [] }));

    expect(await service.getPendingRecoveries(WALLET)).toEqual([]);
  });

  it('reports a missing table distinctly from a query failure', async () => {
    mockFrom.mockReturnValue(
      createChain({ error: { code: '42P01', message: 'relation does not exist' } })
    );

    await expect(service.getPendingRecoveries(WALLET)).rejects.toThrow(/not available/);
  });

  it('throws on any other query failure', async () => {
    mockFrom.mockReturnValue(createChain({ error: { message: 'connection reset' } }));

    await expect(service.getPendingRecoveries(WALLET)).rejects.toThrow(/connection reset/);
  });
});
