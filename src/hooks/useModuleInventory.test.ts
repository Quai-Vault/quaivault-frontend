import { describe, expect, it } from 'vitest';
import { resolveVaultModules } from './useModuleInventory';
import type { WalletModuleInventory, WalletModuleInventoryItem } from '../types/database';
import type { DaoShipSummary, Untrusted } from '../types/daoShips';

const WALLET = '0x1111111111111111111111111111111111111111';
const DAO = '0x2222222222222222222222222222222222222222';
const UNKNOWN = '0x3333333333333333333333333333333333333333';

function indexed(moduleAddress: string, isActive: boolean): WalletModuleInventoryItem {
  return {
    moduleAddress,
    isActive,
    enabledAtBlock: 10,
    enabledAtTx: `0x${'a'.repeat(64)}`,
    disabledAtBlock: isActive ? null : 20,
    disabledAtTx: isActive ? null : `0x${'b'.repeat(64)}`,
    lastEventBlock: isActive ? 10 : 20,
    lastEventBlockHash: null,
    lastEventTx: `0x${'c'.repeat(64)}`,
    lastEventLogIndex: 1,
    executionCount: 2,
    successfulExecutionCount: 1,
    failedExecutionCount: 1,
    lastExecutionBlock: 15,
    lastExecutionTx: `0x${'d'.repeat(64)}`,
    lastExecutionLogIndex: 2,
  };
}

function inventory(modules: WalletModuleInventoryItem[]): WalletModuleInventory {
  return {
    wallet: WALLET,
    walletIndexed: true,
    walletCreatedAtBlock: 1,
    indexedThroughBlock: 30,
    lastIndexedAt: '2026-08-16T00:00:00Z',
    isSyncing: false,
    modules,
  };
}

function dao(id = DAO): Untrusted<DaoShipSummary> {
  return {
    id,
    avatar: WALLET,
    launcher_contract: '0x4444444444444444444444444444444444444444',
    new_vault: true,
    created_at: '2026-08-16T00:00:00Z',
    tx_hash: `0x${'e'.repeat(64)}`,
    name: 'My DAO',
    description: null,
    avatar_img: null,
    profile_source: 'vault',
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
  } as Untrusted<DaoShipSummary>;
}

describe('resolveVaultModules', () => {
  it('makes live state authoritative and exposes an indexer mismatch', () => {
    const [module] = resolveVaultModules({
      inventory: inventory([indexed(DAO, true)]),
      liveModules: [],
    });
    expect(module).toMatchObject({
      address: DAO,
      isActive: false,
      authority: 'live',
      hasStatusMismatch: true,
    });
  });

  it('never introduces a DAO record that was not a candidate module', () => {
    const modules = resolveVaultModules({
      inventory: inventory([indexed(UNKNOWN, true)]),
      liveModules: [UNKNOWN],
      daoDetails: [dao()],
      verifications: new Map([[DAO, {
        avatarMatches: true,
        multisendLibrary: UNKNOWN,
        delegatecallAllowed: true,
      }]]),
    });
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({ address: UNKNOWN, kind: 'unknown', dao: null });
  });

  it('labels an indexer-only match as possible, rejects a mismatch, and confirms a match', () => {
    const base = {
      inventory: inventory([indexed(DAO, true)]),
      liveModules: [DAO],
      daoDetails: [dao()],
    };
    expect(resolveVaultModules(base)[0]).toMatchObject({
      kind: 'dao-ships-unverified',
      name: 'Possible DAO Ships',
      dao: null,
    });
    expect(resolveVaultModules({
      ...base,
      verifications: new Map([[DAO, {
        avatarMatches: false,
        multisendLibrary: null,
        delegatecallAllowed: null,
      }]]),
    })[0].kind).toBe('unknown');
    expect(resolveVaultModules({
      ...base,
      verifications: new Map([[DAO, {
        avatarMatches: true,
        multisendLibrary: UNKNOWN,
        delegatecallAllowed: true,
      }]]),
    })[0]).toMatchObject({ kind: 'dao-ships', name: 'My DAO' });
  });

  it('falls back to explicitly unverified indexed status when RPC is unavailable', () => {
    expect(resolveVaultModules({ inventory: inventory([indexed(UNKNOWN, true)]) })[0])
      .toMatchObject({ isActive: true, authority: 'indexed', liveStatus: null });
  });
});
