import { describe, it, expect } from 'vitest';
import { applyConfirmation } from './approvalUpdates';
import { canExecute } from './transactionState';
import type { PendingTransaction } from '../types';

const OWNER_A_LOWER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OWNER_A_CHECKSUM = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OWNER_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const tx = (over: Partial<PendingTransaction> = {}): PendingTransaction => ({
  hash: '0xhash',
  to: '0xto',
  value: '0',
  data: '0x',
  numApprovals: 0,
  threshold: 2,
  executed: false,
  cancelled: false,
  timestamp: 0,
  proposer: '0xproposer',
  approvals: {},
  status: 'pending',
  expiration: 0,
  executionDelay: 0,
  approvedAt: 0,
  executableAfter: 0,
  isExpired: false,
  ...over,
});

describe('applyConfirmation', () => {
  describe('approving', () => {
    it('records the approval and counts it', () => {
      const result = applyConfirmation(tx(), OWNER_A_CHECKSUM, true);

      expect(result.approvals).toEqual({ [OWNER_A_CHECKSUM]: true });
      expect(result.numApprovals).toBe(1);
    });

    it('adds alongside an existing approval from another owner', () => {
      const result = applyConfirmation(tx({ approvals: { [OWNER_B]: true } }), OWNER_A_CHECKSUM, true);

      expect(result.numApprovals).toBe(2);
    });

    it('is idempotent for the same owner', () => {
      const once = applyConfirmation(tx(), OWNER_A_CHECKSUM, true);
      const twice = applyConfirmation(once, OWNER_A_CHECKSUM, true);

      expect(twice.numApprovals).toBe(1);
    });

    // The indexer checksums addresses; the on-chain fallback lowercases them.
    // Keyed raw, one owner would occupy two entries.
    it('does not duplicate an owner already stored under another casing', () => {
      const stored = tx({ approvals: { [OWNER_A_LOWER]: true }, numApprovals: 1 });

      const result = applyConfirmation(stored, OWNER_A_CHECKSUM, true);

      expect(Object.keys(result.approvals)).toHaveLength(1);
      expect(result.numApprovals).toBe(1);
    });

    // The bug this guards: a single owner's approval satisfying a 2-of-N
    // threshold because it was counted twice.
    it('does not let one owner make a 2-of-N transaction executable', () => {
      const stored = tx({ approvals: { [OWNER_A_LOWER]: true }, threshold: 2 });

      const result = applyConfirmation(stored, OWNER_A_CHECKSUM, true);

      expect(canExecute(result)).toBe(false);
    });

    it('still becomes executable when a second owner genuinely approves', () => {
      const stored = tx({ approvals: { [OWNER_A_LOWER]: true }, threshold: 2 });

      const result = applyConfirmation(stored, OWNER_B, true);

      expect(canExecute(result)).toBe(true);
    });
  });

  describe('revoking', () => {
    it('removes the approval and decrements the count', () => {
      const stored = tx({ approvals: { [OWNER_A_CHECKSUM]: true, [OWNER_B]: true }, numApprovals: 2 });

      const result = applyConfirmation(stored, OWNER_A_CHECKSUM, false);

      expect(result.approvals).toEqual({ [OWNER_B]: true });
      expect(result.numApprovals).toBe(1);
    });

    // A revocation that misses leaves the vault showing an approval the owner
    // has withdrawn.
    it('removes an approval stored under a different casing', () => {
      const stored = tx({ approvals: { [OWNER_A_LOWER]: true }, numApprovals: 1 });

      const result = applyConfirmation(stored, OWNER_A_CHECKSUM, false);

      expect(result.approvals).toEqual({});
      expect(result.numApprovals).toBe(0);
    });

    it('drops a 2-of-N transaction back out of executable', () => {
      const stored = tx({
        approvals: { [OWNER_A_LOWER]: true, [OWNER_B]: true },
        threshold: 2,
      });
      expect(canExecute(stored)).toBe(true);

      const result = applyConfirmation(stored, OWNER_A_CHECKSUM, false);

      expect(canExecute(result)).toBe(false);
    });

    it('is a no-op for an owner who never approved', () => {
      const stored = tx({ approvals: { [OWNER_B]: true }, numApprovals: 1 });

      const result = applyConfirmation(stored, OWNER_A_CHECKSUM, false);

      expect(result.approvals).toEqual({ [OWNER_B]: true });
      expect(result.numApprovals).toBe(1);
    });

    it('leaves an empty map when the last approval goes', () => {
      const stored = tx({ approvals: { [OWNER_A_CHECKSUM]: true }, numApprovals: 1 });

      const result = applyConfirmation(stored, OWNER_A_CHECKSUM, false);

      expect(result.approvals).toEqual({});
      expect(result.numApprovals).toBe(0);
    });
  });

  it('keeps numApprovals equal to the number of true entries', () => {
    const stored = tx({ approvals: { [OWNER_B]: true }, numApprovals: 99 });

    const result = applyConfirmation(stored, OWNER_A_CHECKSUM, true);

    expect(result.numApprovals).toBe(Object.values(result.approvals).filter(Boolean).length);
  });

  it('does not mutate the transaction it was given', () => {
    const stored = tx({ approvals: { [OWNER_B]: true }, numApprovals: 1 });

    applyConfirmation(stored, OWNER_A_CHECKSUM, true);

    expect(stored.approvals).toEqual({ [OWNER_B]: true });
    expect(stored.numApprovals).toBe(1);
  });

  it('leaves every other field alone', () => {
    const stored = tx({ hash: '0xkeep', threshold: 5, executionDelay: 60 });

    const result = applyConfirmation(stored, OWNER_A_CHECKSUM, true);

    expect(result).toMatchObject({ hash: '0xkeep', threshold: 5, executionDelay: 60 });
  });
});
