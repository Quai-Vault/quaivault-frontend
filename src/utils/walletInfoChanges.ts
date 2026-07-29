/**
 * Deciding which vault changes are worth notifying about.
 *
 * Split out of the notification effect so the rules can be tested directly:
 * only balance *increases* are announced, each change is deduplicated against
 * the last thing announced for that vault, and a balance that will not parse
 * aborts the comparison rather than guessing.
 */

export interface WalletInfoSnapshot {
  owners: string[];
  threshold: number;
  minExecutionDelay: number;
  balance: string;
}

export type WalletInfoChange =
  | { kind: 'balanceIncrease'; increase: bigint; total: bigint }
  | { kind: 'ownerAdded'; owner: string }
  | { kind: 'ownerRemoved'; owner: string }
  | { kind: 'thresholdChanged'; from: number; to: number }
  | { kind: 'timelockChanged'; seconds: number };

/** The last value announced per category, so a repeat stays quiet. */
export interface NotifiedMarkers {
  balance?: string;
  ownersKey?: string;
  threshold?: number;
  delay?: number;
}

export interface WalletInfoDiff {
  changes: WalletInfoChange[];
  /** Markers to carry forward; unchanged categories keep their previous value. */
  notified: NotifiedMarkers;
  /**
   * Whether the owners/threshold/timelock snapshot should be committed. False
   * when an unparseable balance aborted the comparison, so the next update
   * still compares against the last good snapshot instead of a skipped one.
   */
  commitSnapshot: boolean;
}

const ownersKeyOf = (owners: string[]): string =>
  owners.map((o) => o.toLowerCase()).sort().join(',');

export function diffWalletInfo(
  prev: WalletInfoSnapshot | undefined,
  current: WalletInfoSnapshot,
  notified: NotifiedMarkers,
): WalletInfoDiff {
  const changes: WalletInfoChange[] = [];
  const nextNotified: NotifiedMarkers = { ...notified };

  // --- Balance ---
  if (prev?.balance && current.balance) {
    let prevBalance: bigint;
    let currentBalance: bigint;
    let lastNotified: bigint | null;
    try {
      prevBalance = BigInt(prev.balance);
      currentBalance = BigInt(current.balance);
      lastNotified = notified.balance != null ? BigInt(notified.balance) : null;
    } catch {
      // A balance we cannot read is not a balance change. Skip this round
      // entirely rather than comparing against a value we do not trust.
      return { changes: [], notified: nextNotified, commitSnapshot: false };
    }

    const alreadyNotified = lastNotified !== null && currentBalance === lastNotified;
    if (currentBalance > prevBalance && !alreadyNotified) {
      changes.push({
        kind: 'balanceIncrease',
        increase: currentBalance - prevBalance,
        total: currentBalance,
      });
      nextNotified.balance = current.balance;
    }
  }

  // Nothing to compare against on first sight of a vault.
  if (!prev) {
    return { changes, notified: nextNotified, commitSnapshot: true };
  }

  // --- Owners ---
  const prevOwners = new Set(prev.owners.map((o) => o.toLowerCase()));
  const currentOwners = new Set(current.owners.map((o) => o.toLowerCase()));
  const currentOwnersKey = ownersKeyOf(current.owners);
  const ownersChanged =
    prevOwners.size !== currentOwners.size ||
    [...prevOwners].some((o) => !currentOwners.has(o));

  if (ownersChanged && currentOwnersKey !== notified.ownersKey) {
    for (const owner of currentOwners) {
      if (!prevOwners.has(owner)) changes.push({ kind: 'ownerAdded', owner });
    }
    for (const owner of prevOwners) {
      if (!currentOwners.has(owner)) changes.push({ kind: 'ownerRemoved', owner });
    }
    nextNotified.ownersKey = currentOwnersKey;
  }

  // --- Threshold ---
  if (prev.threshold !== current.threshold && current.threshold !== notified.threshold) {
    changes.push({ kind: 'thresholdChanged', from: prev.threshold, to: current.threshold });
    nextNotified.threshold = current.threshold;
  }

  // --- Timelock ---
  if (
    prev.minExecutionDelay !== current.minExecutionDelay &&
    current.minExecutionDelay !== notified.delay
  ) {
    changes.push({ kind: 'timelockChanged', seconds: current.minExecutionDelay });
    nextNotified.delay = current.minExecutionDelay;
  }

  return { changes, notified: nextNotified, commitSnapshot: true };
}
