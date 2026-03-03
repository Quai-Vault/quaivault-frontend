import type { PendingTransaction } from '../types';
import { getAdjustedNowSeconds } from './clockSkew';

/**
 * Centralized transaction state logic.
 * Every component that shows action buttons MUST use these functions
 * instead of inline logic to ensure security invariants hold.
 */

/**
 * Case-insensitive lookup in the approvals map.
 * Keys may be checksummed (from indexer) or lowercase (from blockchain).
 */
function hasOwnerApproved(approvals: { [owner: string]: boolean }, ownerAddress: string): boolean {
  const needle = ownerAddress.toLowerCase();
  return Object.entries(approvals).some(
    ([addr, approved]) => approved && addr.toLowerCase() === needle
  );
}

/** Can the transaction be approved by this owner? */
export function canApprove(tx: PendingTransaction, ownerAddress: string): boolean {
  if (tx.status !== 'pending') return false;
  if (isEffectivelyExpired(tx)) return false;
  return !hasOwnerApproved(tx.approvals, ownerAddress);
}

/** Derive actual approval count from the approvals map (authoritative source) */
function getApprovalCount(tx: PendingTransaction): number {
  const fromMap = Object.values(tx.approvals).filter(Boolean).length;
  return fromMap > 0 ? fromMap : (Number.isFinite(tx.numApprovals) ? tx.numApprovals : 0);
}

/** Can the transaction be executed? */
export function canExecute(tx: PendingTransaction): boolean {
  if (tx.status !== 'pending') return false;
  if (isEffectivelyExpired(tx)) return false;
  if (getApprovalCount(tx) < tx.threshold) return false;
  // Timelock check: if there's a delay, approvedAt must be set AND delay elapsed
  if (tx.executionDelay > 0) {
    if (tx.approvedAt === 0) return false; // Not yet indexed / not yet approved
    const now = getAdjustedNowSeconds();
    if (now < tx.approvedAt + tx.executionDelay) return false;
  }
  return true;
}

/** Is the transaction in timelock (approved but delay not elapsed)? */
export function isTimelocked(tx: PendingTransaction): boolean {
  if (tx.status !== 'pending') return false;
  if (tx.approvedAt === 0) return false;
  if (tx.executionDelay === 0) return false;
  const now = getAdjustedNowSeconds();
  return now < tx.approvedAt + tx.executionDelay;
}

/** Can the proposer cancel directly? (only pre-approval) */
export function canProposerCancel(tx: PendingTransaction, address: string): boolean {
  if (tx.status !== 'pending') return false;
  if (tx.approvedAt !== 0) return false; // Contract rejects cancel after approvedAt set
  return tx.proposer.toLowerCase() === address.toLowerCase();
}

/** Can consensus cancel be proposed? (for post-approval cancel) */
export function canConsensusCancel(tx: PendingTransaction): boolean {
  if (tx.status !== 'pending') return false;
  return tx.approvedAt !== 0; // Only needed after approval (direct cancel blocked)
}

/** Can the user revoke their approval? */
export function canRevoke(tx: PendingTransaction, ownerAddress: string): boolean {
  if (tx.status !== 'pending') return false;
  if (isEffectivelyExpired(tx)) return false;
  return hasOwnerApproved(tx.approvals, ownerAddress);
}

/** Can this transaction be expired (permissionless cleanup)? */
export function canExpire(tx: PendingTransaction): boolean {
  if (tx.status !== 'pending') return false;
  if (tx.expiration === 0) return false;
  return getAdjustedNowSeconds() > tx.expiration;
}

/** Would this approval, if cast, potentially enable Approve & Execute? */
export function wouldMeetThreshold(tx: PendingTransaction): boolean {
  return getApprovalCount(tx) + 1 >= tx.threshold;
}

/** Can this approval trigger an atomic approve-and-execute? */
export function canApproveAndExecute(tx: PendingTransaction, ownerAddress: string): boolean {
  if (!canApprove(tx, ownerAddress)) return false;
  if (!wouldMeetThreshold(tx)) return false;
  // Timelocked transactions can't be immediately executed —
  // the timelock starts when threshold is met, so execution is always delayed.
  if (tx.executionDelay > 0) return false;
  return true;
}

/**
 * Check if the transaction is effectively expired
 * (either marked by indexer or past expiration time)
 */
function isEffectivelyExpired(tx: PendingTransaction): boolean {
  if (tx.isExpired) return true;
  if (tx.expiration > 0 && getAdjustedNowSeconds() > tx.expiration) return true;
  return false;
}

/** Human-readable status for display */
export function getDisplayStatus(tx: PendingTransaction): string {
  if (tx.status === 'executed') return 'Executed';
  if (tx.status === 'cancelled') return 'Cancelled';
  if (tx.status === 'expired' || isEffectivelyExpired(tx)) return 'Expired';
  if (tx.status === 'failed') return 'Failed';
  if (isTimelocked(tx)) return 'Timelocked';
  if (canExecute(tx)) return 'Ready to Execute';
  return 'Pending';
}

/** Seconds until timelock expires (for countdown), 0 if not timelocked */
export function timelockSecondsRemaining(tx: PendingTransaction): number {
  if (!isTimelocked(tx)) return 0;
  const deadline = tx.approvedAt + tx.executionDelay;
  const remaining = deadline - getAdjustedNowSeconds();
  return Math.max(0, Math.ceil(remaining));
}

/** Seconds until expiration (for countdown), 0 if no expiration or already expired */
export function expirationSecondsRemaining(tx: PendingTransaction): number {
  if (tx.expiration === 0) return 0;
  const remaining = tx.expiration - getAdjustedNowSeconds();
  return Math.max(0, Math.ceil(remaining));
}
