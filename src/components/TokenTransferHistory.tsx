import { useState, useCallback } from 'react';
import { useTokenBalances } from '../hooks/useTokenBalances';
import { formatAddress } from '../utils/formatting';
import { ExplorerLink } from './ExplorerLink';
import { CopyButton } from './CopyButton';
import { EmptyState } from './EmptyState';
import { formatUnits } from 'quais';
import type { Token, TokenTransfer } from '../types/database';

const PAGE_SIZE = 50;

interface TokenTransferHistoryProps {
  walletAddress: string;
}

function formatTokenAmount(value: string, decimals: number | null): string {
  try {
    return parseFloat(formatUnits(BigInt(value), decimals ?? 18)).toFixed(
      (decimals ?? 18) > 4 ? 4 : (decimals ?? 18)
    );
  } catch {
    return value;
  }
}

export function TokenTransferHistory({ walletAddress }: TokenTransferHistoryProps) {
  const { tokens, tokenTransfers, tokenTransfersTotal, isLoadingTransfers, isIndexerConnected, refetchTransfers } = useTokenBalances(walletAddress);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const tokenMap = new Map<string, Token>();
  for (const t of tokens) {
    tokenMap.set(t.address, t);
  }

  const toggleExpanded = useCallback((id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetchTransfers();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchTransfers]);

  if (!isIndexerConnected) {
    return (
      <div className="text-center py-8">
        <p className="text-dark-500">Token transfer history requires the indexer to be connected.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200 mb-1">Token Transfers</h2>
          <p className="text-base font-mono text-dark-500 uppercase tracking-wider">
            {tokenTransfersTotal} Transfer{tokenTransfersTotal !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-lg text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 transition-colors font-semibold flex items-center gap-4 disabled:opacity-50"
        >
          <svg className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {isLoadingTransfers ? (
        <div className="text-center py-12">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-primary-600/20 blur-xl animate-pulse"></div>
            <div className="relative inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
          </div>
          <p className="mt-6 text-dark-500 dark:text-dark-400 font-semibold">Loading token transfers...</p>
        </div>
      ) : tokenTransfers.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-8 h-8 text-dark-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          title="No Token Transfers"
          description="This vault hasn't sent or received any ERC20 or ERC721 tokens yet."
        />
      ) : (
        <div className="space-y-4">
          {tokenTransfers.slice(0, visible).map((transfer) => {
            const token = tokenMap.get(transfer.token_address);
            const isInflow = transfer.direction === 'inflow';
            const itemId = `${transfer.transaction_hash}-${transfer.log_index}`;
            const isExpanded = expandedItems.has(itemId);

            return (
              <div
                key={transfer.id}
                className="vault-panel p-5 hover:border-primary-600/50 transition-all"
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(itemId)}
                  className="w-full text-left"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-4 mb-2 flex-wrap">
                        {/* Direction badge */}
                        <span className={`inline-flex items-center px-3 py-1 rounded-md text-base font-semibold border shadow-vault-inner ${
                          isInflow
                            ? 'bg-green-900 text-green-200 border-green-700'
                            : 'bg-red-900 text-red-200 border-red-700'
                        }`}>
                          <span className="mr-1.5">{isInflow ? '↓' : '↑'}</span>
                          {isInflow ? 'Received' : 'Sent'}
                        </span>
                        {/* Token badge */}
                        <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-semibold bg-yellow-900 text-yellow-200 border border-yellow-700 shadow-vault-inner">
                          {token?.symbol ?? formatAddress(transfer.token_address)}
                        </span>
                        {/* NFT token ID */}
                        {transfer.token_id && (
                          <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-semibold bg-purple-900 text-purple-200 border border-purple-700 shadow-vault-inner">
                            #{transfer.token_id}
                          </span>
                        )}
                      </div>
                      {/* Amount */}
                      <p className="text-lg text-dark-700 dark:text-dark-200 font-semibold mt-2">
                        {isInflow ? '+' : '-'}{formatTokenAmount(transfer.value, token?.decimals ?? null)} {token?.symbol ?? 'tokens'}
                      </p>
                      {/* Block number */}
                      <p className="text-base font-mono text-dark-500 mt-2 uppercase tracking-wider">
                        Block {transfer.block_number.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-start gap-3 ml-4 flex-shrink-0">
                      <div className="text-right">
                        <div className="flex items-center gap-4 justify-end">
                          <p className="text-base font-mono text-dark-500">
                            {formatAddress(transfer.transaction_hash)}
                          </p>
                        </div>
                      </div>
                      <svg className={`w-5 h-5 text-dark-500 transition-transform mt-1 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-dark-300 dark:border-dark-600 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1">From</p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-mono text-dark-700 dark:text-dark-200 truncate">{transfer.from_address}</p>
                          <CopyButton text={transfer.from_address} />
                        </div>
                      </div>
                      <div>
                        <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1">To</p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-mono text-dark-700 dark:text-dark-200 truncate">{transfer.to_address}</p>
                          <CopyButton text={transfer.to_address} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1">Token Contract</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono text-dark-700 dark:text-dark-200 truncate">
                          {token?.name ?? 'Unknown'} ({token?.symbol ?? '?'})
                        </p>
                        <ExplorerLink type="address" value={transfer.token_address} showIcon={true} className="text-xs">
                          {formatAddress(transfer.token_address)}
                        </ExplorerLink>
                      </div>
                    </div>
                    <div>
                      <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1">Transaction Hash</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono text-dark-700 dark:text-dark-200 truncate">{transfer.transaction_hash}</p>
                        <CopyButton text={transfer.transaction_hash} />
                        <ExplorerLink type="transaction" value={transfer.transaction_hash} className="text-xs">
                          View
                        </ExplorerLink>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Load More */}
          {visible < tokenTransfers.length && (
            <div className="text-center pt-4">
              <button
                onClick={() => setVisible(prev => prev + PAGE_SIZE)}
                className="btn-secondary text-base px-6 py-2.5 inline-flex items-center gap-2"
              >
                Load More ({tokenTransfers.length - visible} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
