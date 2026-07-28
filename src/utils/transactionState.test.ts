import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  canApprove,
  canExecute,
  canRevoke,
  canProposerCancel,
  canConsensusCancel,
  canExpire,
  isTimelocked,
  wouldMeetThreshold,
  canApproveAndExecute,
  getDisplayStatus,
  timelockSecondsRemaining,
  expirationSecondsRemaining,
} from './transactionState';
import type { PendingTransaction } from '../types';

const NOW_SECONDS = 1_700_000_000;
const OWNER = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa';
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PROPOSER = '0xcccccccccccccccccccccccccccccccccccccccc';

function tx(overrides: Partial<PendingTransaction> = {}): PendingTransaction {
  return {
    hash: '0xhash',
    to: OTHER,
    value: '0',
    data: '0x',
    numApprovals: 0,
    threshold: 2,
    executed: false,
    cancelled: false,
    timestamp: NOW_SECONDS - 1000,
    proposer: PROPOSER,
    approvals: {},
    status: 'pending',
    expiration: 0,
    executionDelay: 0,
    approvedAt: 0,
    executableAfter: 0,
    isExpired: false,
    ...overrides,
  };
}

describe('transactionState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_SECONDS * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('canApprove', () => {
    it('allows an owner who has not approved a pending transaction', () => {
      expect(canApprove(tx(), OWNER)).toBe(true);
    });

    it('refuses when the owner has already approved', () => {
      expect(canApprove(tx({ approvals: { [OWNER]: true } }), OWNER)).toBe(false);
    });

    // Approvals arrive checksummed from the indexer and lowercase from chain.
    it('matches the approver regardless of address casing', () => {
      const approvals = { [OWNER.toLowerCase()]: true };

      expect(canApprove(tx({ approvals }), OWNER.toUpperCase().replace('0X', '0x'))).toBe(false);
    });

    it('ignores a revoked approval recorded as false', () => {
      expect(canApprove(tx({ approvals: { [OWNER]: false } }), OWNER)).toBe(true);
    });

    it.each(['executed', 'cancelled', 'expired', 'failed'] as const)(
      'refuses a %s transaction',
      (status) => {
        expect(canApprove(tx({ status }), OWNER)).toBe(false);
      }
    );

    it('refuses once past the expiration timestamp', () => {
      expect(canApprove(tx({ expiration: NOW_SECONDS - 1 }), OWNER)).toBe(false);
    });

    it('refuses when the indexer has flagged it expired', () => {
      expect(canApprove(tx({ isExpired: true }), OWNER)).toBe(false);
    });
  });

  describe('canExecute', () => {
    it('allows once the approval count reaches the threshold', () => {
      expect(canExecute(tx({ approvals: { [OWNER]: true, [OTHER]: true } }))).toBe(true);
    });

    it('refuses below the threshold', () => {
      expect(canExecute(tx({ approvals: { [OWNER]: true } }))).toBe(false);
    });

    it('falls back to numApprovals when the approvals map is empty', () => {
      expect(canExecute(tx({ approvals: {}, numApprovals: 2 }))).toBe(true);
    });

    it('prefers the approvals map over a stale numApprovals', () => {
      // The map is the authoritative source; a stale higher count must not
      // unlock execution.
      expect(canExecute(tx({ approvals: { [OWNER]: true }, numApprovals: 5 }))).toBe(false);
    });

    // A populated map whose entries are all false means the approvals were
    // revoked — not that the map is unloaded. Falling back to the indexer's
    // count here offers an Execute that reverts on chain.
    it('refuses once every approval has been revoked', () => {
      const allRevoked = tx({
        approvals: { [OWNER]: false, [OTHER]: false },
        numApprovals: 2,
      });

      expect(canExecute(allRevoked)).toBe(false);
      expect(getDisplayStatus(allRevoked)).toBe('Pending');
    });

    describe('with a timelock', () => {
      const timelocked = (over: Partial<PendingTransaction> = {}) =>
        tx({
          approvals: { [OWNER]: true, [OTHER]: true },
          executionDelay: 600,
          approvedAt: NOW_SECONDS - 100,
          ...over,
        });

      it('refuses while the delay has not elapsed', () => {
        expect(canExecute(timelocked())).toBe(false);
      });

      it('allows once the delay has elapsed', () => {
        expect(canExecute(timelocked({ approvedAt: NOW_SECONDS - 601 }))).toBe(true);
      });

      // approvedAt is 0 until the threshold is indexed; executing then would
      // sidestep the delay entirely.
      it('refuses while approvedAt is still unset', () => {
        expect(canExecute(timelocked({ approvedAt: 0 }))).toBe(false);
      });
    });

    it('refuses an expired transaction even at threshold', () => {
      expect(
        canExecute(tx({ approvals: { [OWNER]: true, [OTHER]: true }, isExpired: true }))
      ).toBe(false);
    });
  });

  describe('canRevoke', () => {
    it('allows an owner who has approved', () => {
      expect(canRevoke(tx({ approvals: { [OWNER]: true } }), OWNER)).toBe(true);
    });

    it('refuses an owner who has not', () => {
      expect(canRevoke(tx(), OWNER)).toBe(false);
    });

    it('refuses once expired', () => {
      expect(canRevoke(tx({ approvals: { [OWNER]: true }, isExpired: true }), OWNER)).toBe(false);
    });
  });

  describe('canProposerCancel', () => {
    it('allows the proposer before the threshold was ever met', () => {
      expect(canProposerCancel(tx(), PROPOSER)).toBe(true);
    });

    it('refuses anyone else', () => {
      expect(canProposerCancel(tx(), OWNER)).toBe(false);
    });

    // The contract reverts with CannotCancelApprovedTransaction once approvedAt
    // is set, and it is never cleared — even if approvals are later revoked.
    it('refuses the proposer once approvedAt is set', () => {
      expect(canProposerCancel(tx({ approvedAt: NOW_SECONDS - 10 }), PROPOSER)).toBe(false);
    });

    it('still refuses after approvals are revoked, since approvedAt sticks', () => {
      expect(
        canProposerCancel(tx({ approvedAt: NOW_SECONDS - 10, approvals: {} }), PROPOSER)
      ).toBe(false);
    });
  });

  describe('canConsensusCancel', () => {
    it('is offered to a non-proposer owner', () => {
      expect(canConsensusCancel(tx(), OWNER)).toBe(true);
    });

    it('is not offered to the proposer who can still cancel directly', () => {
      expect(canConsensusCancel(tx(), PROPOSER)).toBe(false);
    });

    it('is offered to the proposer once direct cancel is blocked', () => {
      expect(canConsensusCancel(tx({ approvedAt: NOW_SECONDS - 10 }), PROPOSER)).toBe(true);
    });

    it('refuses a transaction that is no longer pending', () => {
      expect(canConsensusCancel(tx({ status: 'executed' }), OWNER)).toBe(false);
    });
  });

  describe('canExpire', () => {
    it('allows once past the expiration', () => {
      expect(canExpire(tx({ expiration: NOW_SECONDS - 1 }))).toBe(true);
    });

    it('refuses before the expiration', () => {
      expect(canExpire(tx({ expiration: NOW_SECONDS + 1 }))).toBe(false);
    });

    it('refuses when no expiration is set', () => {
      expect(canExpire(tx({ expiration: 0 }))).toBe(false);
    });
  });

  describe('isTimelocked', () => {
    it('is true while an approved delay has not elapsed', () => {
      expect(isTimelocked(tx({ executionDelay: 600, approvedAt: NOW_SECONDS - 100 }))).toBe(true);
    });

    it('is false once elapsed', () => {
      expect(isTimelocked(tx({ executionDelay: 600, approvedAt: NOW_SECONDS - 601 }))).toBe(false);
    });

    it('is false without a delay', () => {
      expect(isTimelocked(tx({ executionDelay: 0, approvedAt: NOW_SECONDS - 100 }))).toBe(false);
    });
  });

  describe('approve and execute in one step', () => {
    it('is offered when this approval would meet the threshold', () => {
      expect(wouldMeetThreshold(tx({ approvals: { [OTHER]: true } }))).toBe(true);
      expect(canApproveAndExecute(tx({ approvals: { [OTHER]: true } }), OWNER)).toBe(true);
    });

    // The bug this guards: passing an empty address bypassed the approval
    // check, offering the combined action to owners who had already approved.
    it('is not offered to an owner who has already approved', () => {
      const already = tx({ approvals: { [OWNER]: true, [OTHER]: true }, threshold: 3 });

      expect(canApproveAndExecute(already, OWNER)).toBe(false);
    });

    it('is not offered when the threshold still would not be met', () => {
      expect(canApproveAndExecute(tx({ threshold: 3 }), OWNER)).toBe(false);
    });

    it('is not offered for a timelocked transaction', () => {
      const delayed = tx({ approvals: { [OTHER]: true }, executionDelay: 600 });

      expect(canApproveAndExecute(delayed, OWNER)).toBe(false);
    });
  });

  describe('getDisplayStatus', () => {
    it.each([
      ['executed', 'Executed'],
      ['cancelled', 'Cancelled'],
      ['failed', 'Failed'],
    ] as const)('reports a %s transaction as %s', (status, expected) => {
      expect(getDisplayStatus(tx({ status }))).toBe(expected);
    });

    it('reports expiry ahead of any pending state', () => {
      expect(getDisplayStatus(tx({ expiration: NOW_SECONDS - 1 }))).toBe('Expired');
    });

    it('reports a timelock ahead of readiness', () => {
      const t = tx({
        approvals: { [OWNER]: true, [OTHER]: true },
        executionDelay: 600,
        approvedAt: NOW_SECONDS - 100,
      });

      expect(getDisplayStatus(t)).toBe('Timelocked');
    });

    it('reports readiness once executable', () => {
      expect(getDisplayStatus(tx({ approvals: { [OWNER]: true, [OTHER]: true } }))).toBe(
        'Ready to Execute'
      );
    });

    it('reports plain pending otherwise', () => {
      expect(getDisplayStatus(tx())).toBe('Pending');
    });
  });

  describe('countdowns', () => {
    it('reports the seconds left on a timelock', () => {
      const t = tx({ executionDelay: 600, approvedAt: NOW_SECONDS - 100 });

      expect(timelockSecondsRemaining(t)).toBe(500);
    });

    it('reports zero when not timelocked', () => {
      expect(timelockSecondsRemaining(tx())).toBe(0);
    });

    it('reports the seconds left before expiry', () => {
      expect(expirationSecondsRemaining(tx({ expiration: NOW_SECONDS + 250 }))).toBe(250);
    });

    it('never reports negative time once expired', () => {
      expect(expirationSecondsRemaining(tx({ expiration: NOW_SECONDS - 250 }))).toBe(0);
    });

    it('reports zero when no expiration is set', () => {
      expect(expirationSecondsRemaining(tx({ expiration: 0 }))).toBe(0);
    });
  });
});
