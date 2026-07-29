import { describe, it, expect, vi } from 'vitest';
import { convertIndexerTransaction, convertIndexerTransactions, safeGetAddress } from './TransactionConverter';
import type { IndexerTransaction, Confirmation } from '../../types/database';

vi.mock('quais', () => ({
  // Checksumming here is just "uppercase the hex" — enough to prove the
  // converter routes addresses through it and falls back when it throws.
  getAddress: (addr: string) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error('bad address');
    return '0x' + addr.slice(2).toUpperCase();
  },
}));

const OWNER_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OWNER_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TO = '0xcccccccccccccccccccccccccccccccccccccccc';

const checksummed = (a: string) => '0x' + a.slice(2).toUpperCase();

function indexerTx(over: Partial<IndexerTransaction> = {}): IndexerTransaction {
  return {
    id: '1',
    wallet_address: OWNER_A,
    tx_hash: '0xhash',
    to_address: TO,
    value: '1000',
    data: '0xabcd',
    transaction_type: 'transfer',
    decoded_params: null,
    status: 'pending',
    confirmation_count: 0,
    submitted_by: OWNER_A,
    submitted_at_block: 10,
    submitted_at_tx: '0xsub',
    executed_at_block: null,
    executed_at_tx: null,
    executed_by: null,
    cancelled_at_block: null,
    cancelled_at_tx: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    expiration: 0,
    execution_delay: 0,
    approved_at: 0,
    executable_after: 0,
    is_expired: false,
    failed_return_data: null,
    ...over,
  } as IndexerTransaction;
}

function confirmation(owner: string, isActive = true): Confirmation {
  return {
    id: `c-${owner}-${isActive}`,
    wallet_address: OWNER_A,
    tx_hash: '0xhash',
    owner_address: owner,
    confirmed_at_block: 11,
    confirmed_at_tx: '0xconf',
  } as Confirmation & { is_active: boolean } as Confirmation;
}

/** Confirmations carry an is_active flag the schema exposes separately. */
const active = (owner: string) => ({ ...confirmation(owner), is_active: true }) as Confirmation;
const revoked = (owner: string) => ({ ...confirmation(owner), is_active: false }) as Confirmation;

describe('safeGetAddress', () => {
  it('checksums a well-formed address', () => {
    expect(safeGetAddress(OWNER_A)).toBe(checksummed(OWNER_A));
  });

  it('returns a malformed address unchanged rather than throwing', () => {
    expect(safeGetAddress('not-an-address')).toBe('not-an-address');
  });
});

describe('convertIndexerTransaction', () => {
  describe('approvals', () => {
    it('records an active confirmation', () => {
      const result = convertIndexerTransaction(indexerTx(), 2, [active(OWNER_A)]);

      expect(result.approvals).toEqual({ [checksummed(OWNER_A)]: true });
    });

    // Revoked confirmations must not count — this map is what decides whether
    // the UI offers Execute.
    it('excludes a revoked confirmation', () => {
      const result = convertIndexerTransaction(indexerTx(), 2, [
        active(OWNER_A),
        revoked(OWNER_B),
      ]);

      expect(result.approvals).toEqual({ [checksummed(OWNER_A)]: true });
    });

    it('yields an empty map when every confirmation was revoked', () => {
      const result = convertIndexerTransaction(indexerTx(), 2, [
        revoked(OWNER_A),
        revoked(OWNER_B),
      ]);

      expect(result.approvals).toEqual({});
    });

    it('checksums approver addresses so comparisons match on-chain data', () => {
      const result = convertIndexerTransaction(indexerTx(), 2, [active(OWNER_A)]);

      expect(Object.keys(result.approvals)[0]).toBe(checksummed(OWNER_A));
    });
  });

  describe('numApprovals', () => {
    // The confirmation records are authoritative when we have them; the live
    // subscription handler already recomputes from them rather than trusting
    // the denormalised count, and both paths need to agree.
    it('counts the active confirmations it was given', () => {
      const result = convertIndexerTransaction(indexerTx({ confirmation_count: 2 }), 3, [
        active(OWNER_A),
      ]);

      expect(result.numApprovals).toBe(1);
    });

    it('reports zero once every confirmation is revoked, whatever the count says', () => {
      const result = convertIndexerTransaction(indexerTx({ confirmation_count: 2 }), 3, [
        revoked(OWNER_A),
        revoked(OWNER_B),
      ]);

      expect(result.numApprovals).toBe(0);
    });

    // With no records the caller simply did not fetch them, so the indexer's
    // count is the only thing to go on.
    it("uses the indexer's count when no confirmations were supplied", () => {
      const result = convertIndexerTransaction(indexerTx({ confirmation_count: 2 }), 3);

      expect(result.numApprovals).toBe(2);
    });

    it('reports zero when neither records nor a usable count exist', () => {
      const result = convertIndexerTransaction(
        indexerTx({ confirmation_count: undefined as unknown as number }),
        3,
      );

      expect(result.numApprovals).toBe(0);
    });

    it('never disagrees with its own approvals map', () => {
      const result = convertIndexerTransaction(indexerTx({ confirmation_count: 7 }), 3, [
        active(OWNER_A),
        revoked(OWNER_B),
      ]);

      expect(result.numApprovals).toBe(Object.keys(result.approvals).length);
    });
  });

  describe('status', () => {
    it.each(['pending', 'executed', 'cancelled', 'expired', 'failed'] as const)(
      'passes %s through',
      (status) => {
        expect(convertIndexerTransaction(indexerTx({ status }), 2).status).toBe(status);
      }
    );

    it('defaults an unrecognised status to pending', () => {
      const result = convertIndexerTransaction(
        indexerTx({ status: 'nonsense' as IndexerTransaction['status'] }),
        2,
      );

      expect(result.status).toBe('pending');
    });

    it('derives the executed and cancelled flags from the status', () => {
      expect(convertIndexerTransaction(indexerTx({ status: 'executed' }), 2).executed).toBe(true);
      expect(convertIndexerTransaction(indexerTx({ status: 'cancelled' }), 2).cancelled).toBe(true);

      const pending = convertIndexerTransaction(indexerTx(), 2);
      expect(pending.executed).toBe(false);
      expect(pending.cancelled).toBe(false);
    });
  });

  describe('lifecycle fields', () => {
    it('carries the timelock and expiry values through', () => {
      const result = convertIndexerTransaction(
        indexerTx({
          expiration: 1_700_000_000,
          execution_delay: 600,
          approved_at: 1_699_999_000,
          executable_after: 1_699_999_600,
          is_expired: true,
        }),
        2,
      );

      expect(result).toMatchObject({
        expiration: 1_700_000_000,
        executionDelay: 600,
        approvedAt: 1_699_999_000,
        executableAfter: 1_699_999_600,
        isExpired: true,
      });
    });

    // These feed the execute/expire decisions, so a null must land on the
    // conservative default rather than undefined.
    it('defaults absent lifecycle values to zero and false', () => {
      const result = convertIndexerTransaction(
        indexerTx({
          expiration: null as unknown as number,
          execution_delay: null as unknown as number,
          approved_at: null as unknown as number,
          executable_after: null as unknown as number,
          is_expired: null as unknown as boolean,
        }),
        2,
      );

      expect(result).toMatchObject({
        expiration: 0,
        executionDelay: 0,
        approvedAt: 0,
        executableAfter: 0,
        isExpired: false,
      });
    });
  });

  describe('other fields', () => {
    it('uses the wallet threshold, which transactions do not store', () => {
      expect(convertIndexerTransaction(indexerTx(), 5).threshold).toBe(5);
    });

    it('defaults null calldata to 0x', () => {
      expect(convertIndexerTransaction(indexerTx({ data: null }), 2).data).toBe('0x');
    });

    it('converts the creation time to seconds', () => {
      const result = convertIndexerTransaction(
        indexerTx({ created_at: '2026-01-01T00:00:00Z' }),
        2,
      );

      expect(result.timestamp).toBe(Date.parse('2026-01-01T00:00:00Z') / 1000);
    });

    it('leaves executedBy undefined when nothing executed it', () => {
      expect(convertIndexerTransaction(indexerTx(), 2).executedBy).toBeUndefined();
    });

    it('checksums executedBy when present', () => {
      const result = convertIndexerTransaction(indexerTx({ executed_by: OWNER_B }), 2);

      expect(result.executedBy).toBe(checksummed(OWNER_B));
    });
  });
});

describe('convertIndexerTransactions', () => {
  it('fetches confirmations per transaction and converts each', async () => {
    const getConfirmations = vi.fn(async (hash: string) =>
      hash === '0xone' ? [active(OWNER_A)] : []
    );

    const result = await convertIndexerTransactions(
      [indexerTx({ tx_hash: '0xone' }), indexerTx({ tx_hash: '0xtwo' })],
      2,
      getConfirmations,
    );

    expect(getConfirmations).toHaveBeenCalledTimes(2);
    expect(result[0].approvals).toEqual({ [checksummed(OWNER_A)]: true });
    expect(result[1].approvals).toEqual({});
  });

  it('returns an empty list for no transactions', async () => {
    expect(await convertIndexerTransactions([], 2, vi.fn())).toEqual([]);
  });
});
