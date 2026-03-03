import { getAddress } from 'quais';
import type { IndexerTransaction, Confirmation } from '../../types/database';
import type { PendingTransaction, TransactionStatus } from '../../types';

/** Checksum an address, falling back to the raw string if malformed */
export function safeGetAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

const VALID_STATUSES: readonly TransactionStatus[] = ['pending', 'executed', 'cancelled', 'expired', 'failed'];

/** Validate and normalize a status string, defaulting to 'pending' */
function normalizeStatus(status: string | undefined | null): TransactionStatus {
  if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
    return status as TransactionStatus;
  }
  return 'pending';
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

  const status = normalizeStatus(tx.status);

  return {
    hash: tx.tx_hash,
    to: safeGetAddress(tx.to_address),
    value: tx.value,
    data: tx.data ?? '0x',
    numApprovals: Number.isFinite(tx.confirmation_count) ? tx.confirmation_count : activeConfirmations.length,
    threshold: walletThreshold,
    executed: status === 'executed',
    cancelled: status === 'cancelled',
    timestamp: Number.isFinite(new Date(tx.created_at).getTime()) ? new Date(tx.created_at).getTime() / 1000 : 0,
    proposer: safeGetAddress(tx.submitted_by),
    approvals,
    executedBy: tx.executed_by ? safeGetAddress(tx.executed_by) : undefined,
    transactionType: tx.transaction_type,
    decodedParams: tx.decoded_params,
    // 5-state lifecycle fields
    status,
    expiration: tx.expiration ?? 0,
    executionDelay: tx.execution_delay ?? 0,
    approvedAt: tx.approved_at ?? 0,
    executableAfter: tx.executable_after ?? 0,
    isExpired: tx.is_expired ?? false,
    failedReturnData: tx.failed_return_data ?? null,
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
