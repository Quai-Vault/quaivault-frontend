import type { IndexerTransaction } from '../../types/database';
import { multisigService } from '../MultisigService';

export interface VerificationResult {
  verified: boolean;
  discrepancies: string[];
}

/**
 * Verifies transaction data from the indexer against on-chain data
 *
 * This is a security measure to ensure indexer data hasn't been tampered with.
 * Should be called before signing/approving critical transactions.
 *
 * @param walletAddress - Multisig wallet address
 * @param indexerTx - Transaction data from the indexer
 * @returns Verification result with any discrepancies found
 */
export async function verifyTransactionOnChain(
  walletAddress: string,
  indexerTx: IndexerTransaction
): Promise<VerificationResult> {
  const discrepancies: string[] = [];

  try {
    // Fetch transaction from blockchain
    const onChainTx = await multisigService.getTransaction(walletAddress, indexerTx.tx_hash);

    // Verify recipient address
    if (onChainTx.to.toLowerCase() !== indexerTx.to_address.toLowerCase()) {
      discrepancies.push(
        `Recipient mismatch: on-chain=${onChainTx.to}, indexer=${indexerTx.to_address}`
      );
    }

    // Verify value
    const onChainValue = onChainTx.value.toString();
    if (onChainValue !== indexerTx.value) {
      discrepancies.push(`Value mismatch: on-chain=${onChainValue}, indexer=${indexerTx.value}`);
    }

    // Verify data
    const indexerData = indexerTx.data ?? '0x';
    if (onChainTx.data !== indexerData) {
      discrepancies.push('Transaction data mismatch');
    }

    // Verify execution status
    const indexerExecuted = indexerTx.status === 'executed';
    if (onChainTx.executed !== indexerExecuted) {
      discrepancies.push(
        `Execution status mismatch: on-chain=${onChainTx.executed}, indexer=${indexerExecuted}`
      );
    }

    return {
      verified: discrepancies.length === 0,
      discrepancies,
    };
  } catch (error) {
    return {
      verified: false,
      discrepancies: [
        `Failed to verify on-chain: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}

/**
 * Batch verify multiple transactions
 *
 * @param walletAddress - Multisig wallet address
 * @param transactions - Transactions to verify
 * @returns Map of tx_hash to verification result
 */
export async function verifyTransactionsBatch(
  walletAddress: string,
  transactions: IndexerTransaction[]
): Promise<Map<string, VerificationResult>> {
  const results = new Map<string, VerificationResult>();

  // Verify in parallel for performance
  await Promise.all(
    transactions.map(async (tx) => {
      const result = await verifyTransactionOnChain(walletAddress, tx);
      results.set(tx.tx_hash, result);
    })
  );

  return results;
}

/**
 * Check if a transaction needs verification
 *
 * Only pending transactions that haven't been verified recently need verification.
 * This helps reduce unnecessary blockchain calls.
 *
 * @param tx - Transaction to check
 * @param verifiedHashes - Set of recently verified transaction hashes
 */
export function needsVerification(
  tx: IndexerTransaction,
  verifiedHashes: Set<string>
): boolean {
  // Only verify pending transactions
  if (tx.status !== 'pending') return false;

  // Skip if recently verified
  if (verifiedHashes.has(tx.tx_hash)) return false;

  return true;
}
