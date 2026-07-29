import type { PendingTransaction } from '../types';

/**
 * Applying a live confirmation to a cached transaction.
 *
 * Approval maps are keyed by address, but the two sources disagree on casing:
 * the indexer checksums addresses, while the on-chain fallback lowercases them.
 * Keying by the raw string therefore lets the same owner occupy two entries —
 * inflating the approval count so a single approval can appear to satisfy a
 * 2-of-N threshold — and lets a revocation miss the entry it meant to remove.
 *
 * Matching case-insensitively is what makes the update idempotent per owner,
 * however the existing entry happens to be spelled.
 */
export function applyConfirmation(
  tx: PendingTransaction,
  ownerAddress: string,
  isApproved: boolean,
): PendingTransaction {
  const needle = ownerAddress.toLowerCase();

  const approvals: { [owner: string]: boolean } = {};
  for (const [address, approved] of Object.entries(tx.approvals)) {
    if (address.toLowerCase() !== needle) {
      approvals[address] = approved;
    }
  }

  if (isApproved) {
    approvals[ownerAddress] = true;
  }

  return {
    ...tx,
    approvals,
    numApprovals: Object.values(approvals).filter(Boolean).length,
  };
}
