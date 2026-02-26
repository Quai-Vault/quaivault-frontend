import { getAddress } from 'quais';
import type { IndexerTransaction, Confirmation } from '../../types/database';
import type { PendingTransaction } from '../../types';

/** Checksum an address, falling back to the raw string if malformed */
export function safeGetAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

/**
 * Converts indexer transaction format to frontend PendingTransaction format
 * Used for consistent data shape across indexer and blockchain sources
 *
 * Indexer stores addresses in lowercase, but we return checksummed addresses
 * for display and blockchain compatibility.
 *
 * @param tx - Transaction from indexer
 * @param walletThreshold - Threshold from wallet (transactions don't store this)
 * @param confirmations - Confirmations for this transaction (optional)
 */
export function convertIndexerTransaction(
  tx: IndexerTransaction,
  walletThreshold: number,
  confirmations: Confirmation[] = []
): PendingTransaction {
  // Only count active (non-revoked) confirmations
  const activeConfirmations = confirmations.filter((c) => c.is_active);

  // Use checksummed addresses for display and comparison
  const approvals: { [owner: string]: boolean } = {};
  activeConfirmations.forEach((c) => {
    approvals[safeGetAddress(c.owner_address)] = true;
  });

  return {
    hash: tx.tx_hash,
    to: safeGetAddress(tx.to_address),
    value: tx.value,
    data: tx.data ?? '0x',
    numApprovals: tx.confirmation_count,
    threshold: walletThreshold,
    executed: tx.status === 'executed',
    cancelled: tx.status === 'cancelled',
    timestamp: Number.isFinite(new Date(tx.created_at).getTime()) ? new Date(tx.created_at).getTime() / 1000 : 0,
    proposer: safeGetAddress(tx.submitted_by),
    approvals,
    executedBy: tx.executed_by ? safeGetAddress(tx.executed_by) : undefined,
    transactionType: tx.transaction_type,
    decodedParams: tx.decoded_params,
  };
}

/**
 * Converts a list of transactions with their confirmations
 *
 * @param transactions - Transactions from indexer
 * @param walletThreshold - Threshold from wallet
 * @param getConfirmations - Function to fetch confirmations for a transaction
 */
export async function convertIndexerTransactions(
  transactions: IndexerTransaction[],
  walletThreshold: number,
  getConfirmations: (txHash: string) => Promise<Confirmation[]>
): Promise<PendingTransaction[]> {
  return Promise.all(
    transactions.map(async (tx) => {
      const confirmations = await getConfirmations(tx.tx_hash);
      return convertIndexerTransaction(tx, walletThreshold, confirmations);
    })
  );
}
