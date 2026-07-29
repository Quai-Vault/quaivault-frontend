import { describe, it, expect } from 'vitest';
import { diffWalletInfo } from './walletInfoChanges';
import type { WalletInfoSnapshot, NotifiedMarkers } from './walletInfoChanges';

const OWNER_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OWNER_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OWNER_C = '0xcccccccccccccccccccccccccccccccccccccccc';

const snapshot = (over: Partial<WalletInfoSnapshot> = {}): WalletInfoSnapshot => ({
  owners: [OWNER_A, OWNER_B],
  threshold: 2,
  minExecutionDelay: 0,
  balance: '1000',
  ...over,
});

const diff = (
  prev: WalletInfoSnapshot | undefined,
  current: WalletInfoSnapshot,
  notified: NotifiedMarkers = {},
) => diffWalletInfo(prev, current, notified);

describe('diffWalletInfo', () => {
  describe('first sight of a vault', () => {
    it('announces nothing', () => {
      expect(diff(undefined, snapshot()).changes).toEqual([]);
    });

    it('still commits the snapshot to compare against next time', () => {
      expect(diff(undefined, snapshot()).commitSnapshot).toBe(true);
    });
  });

  describe('balance', () => {
    it('announces an increase with the delta and the new total', () => {
      const { changes } = diff(snapshot({ balance: '1000' }), snapshot({ balance: '2500' }));

      expect(changes).toEqual([{ kind: 'balanceIncrease', increase: 1500n, total: 2500n }]);
    });

    // Spending is not an event the vault owner needs pushed at them, and the
    // outgoing transaction already has its own notifications.
    it('says nothing about a decrease', () => {
      const { changes } = diff(snapshot({ balance: '2500' }), snapshot({ balance: '1000' }));

      expect(changes).toEqual([]);
    });

    it('says nothing when the balance is unchanged', () => {
      expect(diff(snapshot(), snapshot()).changes).toEqual([]);
    });

    it('does not repeat an increase already announced', () => {
      const { changes } = diff(
        snapshot({ balance: '1000' }),
        snapshot({ balance: '2500' }),
        { balance: '2500' },
      );

      expect(changes).toEqual([]);
    });

    it('announces a further increase past one already announced', () => {
      const { changes } = diff(
        snapshot({ balance: '2500' }),
        snapshot({ balance: '4000' }),
        { balance: '2500' },
      );

      expect(changes).toEqual([{ kind: 'balanceIncrease', increase: 1500n, total: 4000n }]);
    });

    it('records the announced balance so the next round can dedupe', () => {
      const { notified } = diff(snapshot({ balance: '1000' }), snapshot({ balance: '2500' }));

      expect(notified.balance).toBe('2500');
    });

    it('handles balances beyond Number precision', () => {
      const { changes } = diff(
        snapshot({ balance: '9007199254740993000000000000' }),
        snapshot({ balance: '9007199254740994000000000000' }),
      );

      expect(changes).toEqual([
        {
          kind: 'balanceIncrease',
          increase: 1000000000000n,
          total: 9007199254740994000000000000n,
        },
      ]);
    });

    describe('an unreadable balance', () => {
      it('announces nothing rather than guessing', () => {
        const { changes } = diff(snapshot({ balance: 'not-a-number' }), snapshot());

        expect(changes).toEqual([]);
      });

      // Committing here would make the skipped values the new baseline, so a
      // change that happened during the bad round would never be announced.
      it('does not commit the snapshot', () => {
        const { commitSnapshot } = diff(snapshot({ balance: '1000' }), snapshot({ balance: 'xx' }));

        expect(commitSnapshot).toBe(false);
      });

      it('suppresses owner and threshold changes in the same round', () => {
        const { changes } = diff(
          snapshot({ balance: '1000' }),
          snapshot({ balance: 'xx', owners: [OWNER_A], threshold: 1 }),
        );

        expect(changes).toEqual([]);
      });
    });
  });

  describe('owners', () => {
    it('announces an added owner', () => {
      const { changes } = diff(
        snapshot({ owners: [OWNER_A] }),
        snapshot({ owners: [OWNER_A, OWNER_B] }),
      );

      expect(changes).toEqual([{ kind: 'ownerAdded', owner: OWNER_B }]);
    });

    it('announces a removed owner', () => {
      const { changes } = diff(
        snapshot({ owners: [OWNER_A, OWNER_B] }),
        snapshot({ owners: [OWNER_A] }),
      );

      expect(changes).toEqual([{ kind: 'ownerRemoved', owner: OWNER_B }]);
    });

    it('announces a swap as both a removal and an addition', () => {
      const { changes } = diff(
        snapshot({ owners: [OWNER_A, OWNER_B] }),
        snapshot({ owners: [OWNER_A, OWNER_C] }),
      );

      expect(changes).toContainEqual({ kind: 'ownerAdded', owner: OWNER_C });
      expect(changes).toContainEqual({ kind: 'ownerRemoved', owner: OWNER_B });
    });

    // Owners arrive checksummed from one source and lowercase from another;
    // comparing raw would announce a change on every refetch.
    it('ignores a pure change of address casing', () => {
      const { changes } = diff(
        snapshot({ owners: [OWNER_A, OWNER_B] }),
        snapshot({ owners: [OWNER_A.toUpperCase().replace('0X', '0x'), OWNER_B] }),
      );

      expect(changes).toEqual([]);
    });

    it('ignores a pure change of ordering', () => {
      const { changes } = diff(
        snapshot({ owners: [OWNER_A, OWNER_B] }),
        snapshot({ owners: [OWNER_B, OWNER_A] }),
      );

      expect(changes).toEqual([]);
    });

    it('does not repeat an owner set already announced', () => {
      const currentOwners = [OWNER_A, OWNER_C];
      const first = diff(snapshot({ owners: [OWNER_A, OWNER_B] }), snapshot({ owners: currentOwners }));
      expect(first.changes.length).toBeGreaterThan(0);

      const again = diff(
        snapshot({ owners: [OWNER_A, OWNER_B] }),
        snapshot({ owners: currentOwners }),
        first.notified,
      );

      expect(again.changes).toEqual([]);
    });
  });

  describe('threshold', () => {
    it('announces a change with both values', () => {
      const { changes } = diff(snapshot({ threshold: 2 }), snapshot({ threshold: 3 }));

      expect(changes).toEqual([{ kind: 'thresholdChanged', from: 2, to: 3 }]);
    });

    it('says nothing when unchanged', () => {
      expect(diff(snapshot({ threshold: 2 }), snapshot({ threshold: 2 })).changes).toEqual([]);
    });

    it('does not repeat a threshold already announced', () => {
      const { changes } = diff(
        snapshot({ threshold: 2 }),
        snapshot({ threshold: 3 }),
        { threshold: 3 },
      );

      expect(changes).toEqual([]);
    });
  });

  describe('timelock', () => {
    it('announces a new delay', () => {
      const { changes } = diff(
        snapshot({ minExecutionDelay: 0 }),
        snapshot({ minExecutionDelay: 3600 }),
      );

      expect(changes).toEqual([{ kind: 'timelockChanged', seconds: 3600 }]);
    });

    it('announces removal as a change to zero', () => {
      const { changes } = diff(
        snapshot({ minExecutionDelay: 3600 }),
        snapshot({ minExecutionDelay: 0 }),
      );

      expect(changes).toEqual([{ kind: 'timelockChanged', seconds: 0 }]);
    });

    it('does not repeat a delay already announced', () => {
      const { changes } = diff(
        snapshot({ minExecutionDelay: 0 }),
        snapshot({ minExecutionDelay: 3600 }),
        { delay: 3600 },
      );

      expect(changes).toEqual([]);
    });
  });

  it('reports several categories changing at once', () => {
    const { changes } = diff(
      snapshot({ balance: '1000', owners: [OWNER_A], threshold: 1, minExecutionDelay: 0 }),
      snapshot({ balance: '2000', owners: [OWNER_A, OWNER_B], threshold: 2, minExecutionDelay: 60 }),
    );

    expect(changes.map((c) => c.kind).sort()).toEqual([
      'balanceIncrease',
      'ownerAdded',
      'thresholdChanged',
      'timelockChanged',
    ]);
  });

  it('leaves markers for untouched categories alone', () => {
    const { notified } = diff(
      snapshot({ threshold: 2 }),
      snapshot({ threshold: 3 }),
      { balance: '999', ownersKey: 'x' },
    );

    expect(notified.balance).toBe('999');
    expect(notified.ownersKey).toBe('x');
    expect(notified.threshold).toBe(3);
  });
});
