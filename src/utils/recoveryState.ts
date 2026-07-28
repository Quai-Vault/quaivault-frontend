import { getAdjustedNowSeconds } from './clockSkew';

/**
 * Centralized social-recovery state logic.
 *
 * Recovery expiry is a timestamp comparison on chain, not a state transition —
 * `expireRecovery` is a permissionless cleanup call that frequently nobody makes.
 * The indexer is event-driven, so a past-deadline recovery keeps `status = 'pending'`
 * in the database indefinitely. Derive the effective status here rather than
 * trusting the stored column.
 *
 * This mirrors the indexer's `social_recoveries_effective` view: only `pending`
 * rows are rewritten, and `expiration = 0` (or null) means no expiry.
 */

export type RecoveryStatus = 'pending' | 'executed' | 'cancelled' | 'invalidated' | 'expired';

const VALID_STATUSES: readonly RecoveryStatus[] = [
  'pending',
  'executed',
  'cancelled',
  'invalidated',
  'expired',
];

/** Minimal shape shared by indexer rows and the pending-recovery view model. */
export interface RecoveryLike {
  /** Omitted by callers whose recoveries are pending by construction. */
  status?: string | null;
  expiration?: number | null;
}

/**
 * Has this recovery passed its expiration deadline without being formally closed?
 *
 * Terminal statuses are never rewritten — in particular `cancelled`, which the chain
 * cannot report because `cancelRecovery` deletes the on-chain struct entirely.
 */
export function isRecoveryEffectivelyExpired(recovery: RecoveryLike): boolean {
  if (recovery.status && recovery.status !== 'pending') return false;
  const expiration = recovery.expiration ?? 0;
  if (expiration <= 0) return false;
  return getAdjustedNowSeconds() > expiration;
}

/** Stored status, or 'expired' when the deadline has passed. */
export function getEffectiveRecoveryStatus(recovery: RecoveryLike): RecoveryStatus {
  if (isRecoveryEffectivelyExpired(recovery)) return 'expired';
  const status = recovery.status;
  if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
    return status as RecoveryStatus;
  }
  return 'pending';
}
