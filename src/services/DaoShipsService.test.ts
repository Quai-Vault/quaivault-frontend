import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  state: {
    last_block_number: 123,
    last_indexed_at: new Date().toISOString(),
    chain_id: 9000,
    is_syncing: false,
    requires_full_reindex: false,
  },
  daoResults: [] as unknown[],
  chunks: [] as string[][],
}));

vi.mock('../config/daoShips', () => ({
  daoShipsSupabase: { from: (...args: unknown[]) => mocks.from(...args) },
  DAO_SHIPS_CONFIG: {
    ENABLED: true,
    NETWORK_SCHEMA: 'testnet',
    EXPECTED_CHAIN_ID: 9000,
    APP_BASE_URL: 'https://testnet.daoships.org',
    STALE_AFTER_MS: 600_000,
    QUERY_CHUNK_SIZE: 25,
  },
}));
vi.mock('../config/provider', () => ({ getActiveProvider: () => ({ network: 'test' }) }));

import { DaoShipsService, toDaoShipDisplay } from './DaoShipsService';
import type { DaoShipSummary, Untrusted } from '../types/daoShips';
import { Contract } from 'quais';

const WALLET = '0x1111111111111111111111111111111111111111';
const DAO = '0x2222222222222222222222222222222222222222';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: DAO,
    avatar: WALLET,
    launcher_contract: '0x3333333333333333333333333333333333333333',
    new_vault: true,
    created_at: '2026-08-16T00:00:00Z',
    updated_at: '2026-08-16T00:00:00Z',
    tx_hash: `0x${'a'.repeat(64)}`,
    name: 'Example DAO',
    description: 'A treasury',
    avatar_img: null,
    profile_source: 'vault',
    share_token_name: 'Shares',
    share_token_symbol: 'SHARE',
    loot_token_name: 'Loot',
    loot_token_symbol: 'LOOT',
    voting_period: 100,
    grace_period: 50,
    proposal_offering: '0',
    quorum_percent: '1000',
    sponsor_threshold: '1',
    min_retention_percent: '0',
    default_expiry_window: 1000,
    active_member_count: '3',
    proposal_count: '4',
    total_shares: '10',
    total_loot: '2',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = {
    last_block_number: 123,
    last_indexed_at: new Date().toISOString(),
    chain_id: 9000,
    is_syncing: false,
    requires_full_reindex: false,
  };
  mocks.daoResults = [row()];
  mocks.chunks = [];

  mocks.from.mockImplementation((table: string) => {
    if (table === 'ds_indexer_state') {
      const stateChain = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn(),
      };
      stateChain.select.mockReturnValue(stateChain);
      stateChain.eq.mockReturnValue(stateChain);
      stateChain.maybeSingle.mockResolvedValue({ data: mocks.state, error: null });
      return stateChain;
    }

    const daoChain = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
    };
    daoChain.select.mockReturnValue(daoChain);
    daoChain.in.mockImplementation((_column: string, values: string[]) => {
      mocks.chunks.push(values);
      return daoChain;
    });
    daoChain.eq.mockImplementation(() => Promise.resolve({
      data: mocks.chunks.length === 1 ? mocks.daoResults : [],
      error: null,
    }));
    return daoChain;
  });
});

describe('DaoShipsService', () => {
  it('queries DAO identities by candidate module IDs in bounded chunks', async () => {
    const addresses = Array.from({ length: 30 }, (_, index) =>
      `0x${(index + 1).toString(16).padStart(40, '0')}`
    );
    addresses[1] = DAO;

    const result = await new DaoShipsService().getDaoDetailsForModules(WALLET, addresses);

    expect(mocks.from).toHaveBeenCalledWith('ds_indexer_state');
    expect(mocks.from).toHaveBeenCalledTimes(3);
    expect(mocks.chunks.map((chunk) => chunk.length)).toEqual([25, 5]);
    expect(result.details).toHaveLength(1);
  });

  it('rejects a DAO indexer on a different chain before querying details', async () => {
    mocks.state.chain_id = 9;
    await expect(new DaoShipsService().getDaoDetailsForModules(WALLET, [DAO]))
      .rejects.toThrow('chain mismatch');
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('rejects details while the DAO indexer requires a full reindex', async () => {
    mocks.state.requires_full_reindex = true;
    await expect(new DaoShipsService().getDaoDetailsForModules(WALLET, [DAO]))
      .rejects.toThrow('requires a full reindex');
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('isolates malformed DAO rows instead of failing the whole module panel', async () => {
    mocks.daoResults = [row(), row({ id: 'malformed' })];
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await new DaoShipsService().getDaoDetailsForModules(WALLET, [DAO]);
    expect(result.details).toHaveLength(1);
    expect(warning).toHaveBeenCalledWith(
      '[DaoShipsService] Ignoring malformed DAO row:',
      expect.any(String)
    );
  });

  it('rejects DAO identity when the module reports a different avatar', async () => {
    const multisendLibrary = vi.fn();
    vi.mocked(Contract).mockImplementationOnce(function () {
      return {
        avatar: vi.fn().mockResolvedValue('0x9999999999999999999999999999999999999999'),
        multisendLibrary,
      } as never;
    });

    await expect(new DaoShipsService().verifyDaoShip(WALLET, DAO)).resolves.toEqual({
      avatarMatches: false,
      multisendLibrary: null,
      delegatecallAllowed: null,
    });
    expect(multisendLibrary).not.toHaveBeenCalled();
  });

  it('checks the DAO multisend dependency against the vault allowlist', async () => {
    const multisend = '0x5555555555555555555555555555555555555555';
    vi.mocked(Contract)
      .mockImplementationOnce(function () {
        return {
          avatar: vi.fn().mockResolvedValue(WALLET),
          multisendLibrary: vi.fn().mockResolvedValue(multisend),
        } as never;
      })
      .mockImplementationOnce(function () {
        return { delegatecallAllowed: vi.fn().mockResolvedValue(true) } as never;
      });

    await expect(new DaoShipsService().verifyDaoShip(WALLET, DAO)).resolves.toEqual({
      avatarMatches: true,
      multisendLibrary: multisend,
      delegatecallAllowed: true,
    });
  });
});

describe('toDaoShipDisplay', () => {
  it('strips bidi controls and rejects arbitrary profile image hosts', () => {
    const unsafe = row({
      name: 'Treasury\u202egpj.exe',
      description: 'hello\u0000world',
      avatar_img: 'https://attacker.example/avatar.svg',
    }) as unknown as Untrusted<DaoShipSummary>;
    expect(toDaoShipDisplay(unsafe)).toMatchObject({
      name: 'Treasurygpj.exe',
      description: 'helloworld',
      avatarUrl: null,
    });
  });

  it('normalizes IPFS profile images onto the allowlisted gateway', () => {
    const profile = row({ avatar_img: 'ipfs://bafybeigdyrzt/image.png' }) as unknown as Untrusted<DaoShipSummary>;
    expect(toDaoShipDisplay(profile).avatarUrl)
      .toBe('https://ipfs.qu.ai/ipfs/bafybeigdyrzt/image.png');
  });
});
