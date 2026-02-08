import { useQuery } from '@tanstack/react-query';
import { indexerService } from '../services/indexer';
import { useIndexerConnection } from '../hooks/useIndexerConnection';
import { formatQuai } from 'quais';
import type { Deposit } from '../types/database';

const BLOCK_EXPLORER_URL = import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://quaiscan.io';

interface DepositHistoryProps {
  walletAddress: string;
  limit?: number;
}

/**
 * Displays deposit history for a wallet
 * Uses indexer for fast historical data and real-time updates
 */
export function DepositHistory({ walletAddress, limit = 10 }: DepositHistoryProps) {
  const { isConnected, isEnabled } = useIndexerConnection();

  // Real-time updates are handled by useMultisig's deposit subscription,
  // which invalidates ['deposits', walletAddress] on new deposits.
  const {
    data: depositsResult,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['deposits', walletAddress, limit],
    queryFn: () => indexerService.transaction.getDeposits(walletAddress, { limit }),
    enabled: !!walletAddress && isConnected && isEnabled,
    staleTime: 30000,
  });

  // Not enabled - show message
  if (!isEnabled) {
    return (
      <div className="text-sm text-dark-500 italic p-4 text-center">
        Deposit history requires indexer configuration
      </div>
    );
  }

  // Not connected - show fallback message
  if (!isConnected) {
    return (
      <div className="text-sm text-dark-500 italic p-4 text-center">
        Deposit history unavailable (indexer offline)
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-400 p-4 text-center">
        Failed to load deposit history
      </div>
    );
  }

  const deposits = depositsResult?.data ?? [];

  if (deposits.length === 0) {
    return (
      <div className="text-sm text-dark-500 p-4 text-center">No deposits yet</div>
    );
  }

  return (
    <div className="space-y-2">
      {deposits.map((deposit) => (
        <DepositRow key={deposit.id} deposit={deposit} />
      ))}
      {depositsResult?.hasMore && (
        <div className="text-center text-sm text-dark-500 pt-2">
          Showing {deposits.length} of {depositsResult.total} deposits
        </div>
      )}
    </div>
  );
}

function DepositRow({ deposit }: { deposit: Deposit }) {
  const amount = parseFloat(formatQuai(deposit.amount)).toFixed(4);
  const senderShort = `${deposit.sender_address.slice(0, 8)}...${deposit.sender_address.slice(-6)}`;
  const date = new Date(deposit.created_at);

  return (
    <div className="flex justify-between items-center p-3 bg-dark-100 dark:bg-dark-800/50 rounded-lg border border-dark-200 dark:border-dark-700/50 hover:border-dark-300 dark:hover:border-dark-600/50 transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-green-600 dark:text-green-400 font-medium">+{amount} QUAI</span>
        </div>
        <div className="text-xs text-dark-500 mt-1">
          From: {senderShort}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-dark-500">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <a
          href={`${BLOCK_EXPLORER_URL}/tx/${deposit.deposited_at_tx}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 transition-colors"
        >
          View tx
        </a>
      </div>
    </div>
  );
}
