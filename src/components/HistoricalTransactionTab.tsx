import { type ReactNode } from 'react';
import { formatAddress, formatTimestamp } from '../utils/formatting';
import { decodeTransaction } from '../utils/transactionDecoder';
import { CopyButton } from './CopyButton';
import { formatQuai } from 'quais';
import type { PendingTransaction } from '../types';
import type { TokenMetadata } from '../services/utils/ContractMetadataService';

export interface HistoricalTabConfig {
  title: string;
  countLabel: string;
  statusBadge: { text: string; className: string };
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  loadingText: string;
  showFailedReturnData?: boolean;
}

interface HistoricalTransactionTabProps {
  config: HistoricalTabConfig;
  transactions: PendingTransaction[] | undefined;
  isLoading: boolean;
  walletAddress: string;
  tokenMetaMap: Map<string, TokenMetadata> | undefined;
  expandedItems: Set<string>;
  toggleExpanded: (id: string) => void;
  visible: number;
  onShowMore: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function HistoricalTransactionTab({
  config,
  transactions,
  isLoading,
  walletAddress,
  tokenMetaMap,
  expandedItems,
  toggleExpanded,
  visible,
  onShowMore,
  onRefresh,
  isRefreshing,
}: HistoricalTransactionTabProps) {
  return (
    <div className="vault-panel p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-display font-bold text-dark-600 dark:text-dark-300 mb-1">{config.title}</h2>
          <p className="text-base font-mono text-dark-500 uppercase tracking-wider">
            {transactions?.length || 0} {config.countLabel}
          </p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-lg text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 transition-colors font-semibold flex items-center gap-4 disabled:opacity-50"
          >
            <svg className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-primary-600/20 blur-xl animate-pulse"></div>
            <div className="relative inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
          </div>
          <p className="mt-6 text-dark-500 dark:text-dark-400 font-semibold">{config.loadingText}</p>
          <p className="mt-2 text-base font-mono text-dark-600 uppercase tracking-wider">Accessing vault records</p>
        </div>
      ) : !transactions || transactions.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-dark-100 dark:bg-vault-dark-4 border-2 border-dark-300 dark:border-dark-600 mb-4">
            {config.emptyIcon}
          </div>
          <p className="text-lg text-dark-500 font-semibold">{config.emptyTitle}</p>
          <p className="text-base text-dark-600 mt-1 font-mono uppercase tracking-wider">
            {config.emptyDescription}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.slice(0, visible).map((tx) => {
            const decoded = decodeTransaction(tx, walletAddress, tokenMetaMap?.get(tx.to.toLowerCase()) ?? null);
            const isExpanded = expandedItems.has(tx.hash);
            const hasDetails = tx.to.toLowerCase() !== walletAddress.toLowerCase() || (Object.keys(tx.approvals).length > 0 && Object.values(tx.approvals).some(v => v));

            return (
              <div
                key={tx.hash}
                className="vault-panel p-5 hover:border-primary-600/30 transition-all opacity-80"
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(tx.hash)}
                  className="w-full text-left"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-4 mb-2 flex-wrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-md text-base font-semibold ${decoded.bgColor} ${decoded.textColor} border ${decoded.borderColor} shadow-vault-inner opacity-75`}>
                          <span className="mr-1.5">{decoded.icon}</span>
                          {decoded.description}
                        </span>
                        <span className={`inline-flex items-center px-3 py-1 rounded-md text-base font-bold ${config.statusBadge.className}`}>
                          {config.statusBadge.text}
                        </span>
                      </div>
                      {decoded.details && (
                        <p className="text-lg text-dark-600 dark:text-dark-300 font-semibold mt-2">{decoded.details}</p>
                      )}
                      <p className="text-base font-mono text-dark-600 mt-2 uppercase tracking-wider">{formatTimestamp(tx.timestamp)}</p>
                    </div>
                    <div className="flex items-start gap-3 ml-4 flex-shrink-0">
                      <div className="text-right">
                        {tx.value !== '0' && (
                          <p className="text-base font-display font-bold text-dark-500 dark:text-dark-400">
                            {parseFloat(formatQuai(tx.value)).toFixed(4)}
                            <span className="text-lg text-dark-500 ml-1">QUAI</span>
                          </p>
                        )}
                        <div className="flex items-center gap-4 justify-end mt-2">
                          <p className="text-base font-mono text-dark-600">
                            {formatAddress(tx.hash)}
                          </p>
                        </div>
                      </div>
                      {hasDetails && (
                        <svg className={`w-5 h-5 text-dark-500 transition-transform mt-1 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-base font-mono text-dark-600 uppercase tracking-wider">TX Hash:</span>
                      <span className="text-sm font-mono text-dark-500 dark:text-dark-400">{formatAddress(tx.hash)}</span>
                      <CopyButton text={tx.hash} size="sm" />
                    </div>

                    {config.showFailedReturnData && tx.failedReturnData && (
                      <div className="bg-red-950/30 rounded-md p-4 mb-4 border border-red-800/50">
                        <p className="text-base font-mono text-red-400 uppercase tracking-wider mb-2">Error Data:</p>
                        <pre className="text-sm font-mono text-red-300/80 bg-red-950/50 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">{tx.failedReturnData}</pre>
                      </div>
                    )}

                    {tx.to.toLowerCase() !== walletAddress.toLowerCase() && (
                      <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 mb-4 border border-dark-300 dark:border-dark-600 space-y-3">
                        <div className="flex justify-between text-lg">
                          <span className="text-base font-mono text-dark-600 uppercase tracking-wider">To:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-lg text-dark-500 dark:text-dark-400">{formatAddress(tx.to)}</span>
                            <CopyButton text={tx.to} size="md" />
                          </div>
                        </div>
                        {tx.data !== '0x' && decoded.type === 'contractCall' && (
                          <div className="flex justify-between text-lg">
                            <span className="text-base font-mono text-dark-600 uppercase tracking-wider">Data:</span>
                            <span className="font-mono text-base text-dark-500 break-all max-w-xs text-right">
                              {tx.data.length > 50 ? `${tx.data.slice(0, 50)}...` : tx.data}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {Object.keys(tx.approvals).length > 0 && Object.values(tx.approvals).some(v => v) && (
                      <div className="vault-divider pt-4 mt-4">
                        <p className="text-base font-mono text-dark-600 uppercase tracking-wider mb-3">Was approved by:</p>
                        <div className="space-y-2">
                          {Object.entries(tx.approvals)
                            .filter(([, approved]) => approved)
                            .map(([owner]) => (
                              <div key={owner} className="flex items-center justify-between p-2 bg-dark-50 dark:bg-vault-dark-3 rounded border border-dark-300 dark:border-dark-600 opacity-75">
                                <span className="text-sm font-mono text-dark-500 dark:text-dark-400">{formatAddress(owner)}</span>
                                <CopyButton text={owner} size="sm" />
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {transactions.length > visible && (
            <button
              onClick={onShowMore}
              className="w-full py-3 text-center text-primary-600 dark:text-primary-400 hover:text-primary-500 font-semibold transition-colors"
            >
              Show more ({transactions.length - visible} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
