import { useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMultisig } from '../hooks/useMultisig';
import { useIndexerConnection } from '../hooks/useIndexerConnection';
import { multisigService } from '../services/MultisigService';
import { indexerService } from '../services';
import { decodeTransaction } from '../utils/transactionDecoder';
import { getBlockRangeTimePeriod } from '../utils/blockTime';
import { formatAddress, formatTimestamp, formatDateString } from '../utils/formatting';
import { CopyButton } from '../components/CopyButton';
import { EmptyState } from '../components/EmptyState';
import { formatQuai } from 'quais';
import { TokenTransferHistory } from '../components/TokenTransferHistory';
import type { RecoveryApproval } from '../types/database';
import type { TokenMetadata } from '../services/utils/ContractMetadataService';

const PAGE_SIZE = 50;

export function TransactionHistory() {
  const { address: walletAddress } = useParams<{ address: string }>();
  const { isConnected: isIndexerConnected } = useIndexerConnection();
  const { executedTransactions, cancelledTransactions, recoveryHistory, isLoadingHistory, isLoadingCancelled, isLoadingRecoveryHistory, refreshHistory, refreshCancelled, refreshRecoveryHistory } = useMultisig(walletAddress);
  const [activeTab, setActiveTab] = useState<'transactions' | 'cancelled' | 'recovery' | 'tokens'>('transactions');
  const [executedVisible, setExecutedVisible] = useState(PAGE_SIZE);
  const [cancelledVisible, setCancelledVisible] = useState(PAGE_SIZE);
  const [recoveryVisible, setRecoveryVisible] = useState(PAGE_SIZE);
  const [isRefreshingExecuted, setIsRefreshingExecuted] = useState(false);
  const [isRefreshingCancelled, setIsRefreshingCancelled] = useState(false);
  const [isRefreshingRecovery, setIsRefreshingRecovery] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRefreshExecuted = useCallback(async () => {
    setIsRefreshingExecuted(true);
    try {
      await refreshHistory();
    } finally {
      setIsRefreshingExecuted(false);
    }
  }, [refreshHistory]);

  const handleRefreshCancelled = useCallback(async () => {
    setIsRefreshingCancelled(true);
    try {
      await refreshCancelled();
    } finally {
      setIsRefreshingCancelled(false);
    }
  }, [refreshCancelled]);

  const handleRefreshRecovery = useCallback(async () => {
    setIsRefreshingRecovery(true);
    try {
      await refreshRecoveryHistory();
    } finally {
      setIsRefreshingRecovery(false);
    }
  }, [refreshRecoveryHistory]);

  // Fetch approvals for all visible recovery operations
  const recoveryHashes = recoveryHistory?.slice(0, recoveryVisible).map(r => r.recovery_hash) ?? [];
  const { data: recoveryApprovalsMap } = useQuery({
    queryKey: ['recoveryApprovals', walletAddress, recoveryHashes.join(',')],
    queryFn: async () => {
      if (!walletAddress || recoveryHashes.length === 0) return new Map<string, RecoveryApproval[]>();
      const results = await Promise.all(
        recoveryHashes.map(async (hash) => {
          const approvals = await multisigService.getRecoveryApprovals(walletAddress, hash);
          return [hash, approvals] as const;
        })
      );
      return new Map(results);
    },
    enabled: !!walletAddress && activeTab === 'recovery' && recoveryHashes.length > 0,
  });

  // Collect unique contract addresses from both executed and cancelled tx lists for token metadata
  const tokenTargetAddresses = useMemo(() => {
    const addrs = new Set<string>();
    for (const tx of [...(executedTransactions ?? []), ...(cancelledTransactions ?? [])]) {
      if (tx.to && tx.to.toLowerCase() !== walletAddress?.toLowerCase() && tx.data && tx.data !== '0x') {
        addrs.add(tx.to);
      }
    }
    return [...addrs];
  }, [executedTransactions, cancelledTransactions, walletAddress]);

  const { data: tokenMetaMap } = useQuery<Map<string, TokenMetadata>>({
    queryKey: ['txHistoryTokenMeta', tokenTargetAddresses.join(',')],
    queryFn: async () => {
      if (tokenTargetAddresses.length === 0) return new Map<string, TokenMetadata>();
      const tokens = await indexerService.token.getTokensByAddresses(tokenTargetAddresses);
      const metaMap = new Map<string, TokenMetadata>();
      for (const [addr, token] of tokens) {
        metaMap.set(addr, { name: token.name, symbol: token.symbol, decimals: token.decimals });
      }
      return metaMap;
    },
    enabled: tokenTargetAddresses.length > 0,
    staleTime: 60_000,
  });

  if (!walletAddress) {
    return (
      <div className="text-center py-20">
        <div className="vault-panel max-w-md mx-auto p-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-dark-100 dark:bg-vault-dark-4 border-2 border-primary-600/30 mb-6">
            <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200 mb-2">Invalid Vault Address</h2>
          <p className="text-dark-500">The requested vault address is invalid.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          to={`/wallet/${walletAddress}`}
          className="text-lg text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 mb-3 inline-flex items-center gap-4 transition-colors font-semibold"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Vault
        </Link>
        <h1 className="text-xl font-display font-bold text-gradient-red vault-text-glow">Transaction History</h1>
        <p className="text-lg font-mono text-dark-500 uppercase tracking-wider mt-2">Complete Transaction Log</p>
      </div>

      {/* Info Banner - Only show limitation warning when indexer is not connected */}
      {!isIndexerConnected && (
        <div className="bg-dark-100 dark:bg-vault-dark-4 border border-dark-300 dark:border-dark-600 rounded-md p-4 mb-4">
          <div className="flex items-start gap-4">
            <svg className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-base font-mono text-dark-500 dark:text-dark-400">
                Showing transactions from the last <span className="text-primary-600 dark:text-primary-400 font-semibold">{getBlockRangeTimePeriod()}</span>
              </p>
              <p className="text-base text-dark-600 mt-1">
                Older transactions may not be displayed due to network query limitations.
                {' '}
                <Link
                  to={`/wallet/${walletAddress}/lookup`}
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 underline font-semibold"
                >
                  Lookup by hash
                </Link>
                {' '}to find older transactions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex border-b border-dark-300 dark:border-dark-600 mb-8">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-6 py-3 text-base font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === 'transactions'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-dark-500 hover:text-dark-700 dark:hover:text-dark-300'
          }`}
        >
          Transactions
          {executedTransactions && executedTransactions.length > 0 && (
            <span className="ml-2 text-base font-mono text-dark-500">({executedTransactions.length})</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('cancelled')}
          className={`px-6 py-3 text-base font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === 'cancelled'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-dark-500 hover:text-dark-700 dark:hover:text-dark-300'
          }`}
        >
          Cancelled
          {cancelledTransactions && cancelledTransactions.length > 0 && (
            <span className="ml-2 text-base font-mono text-dark-500">({cancelledTransactions.length})</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('recovery')}
          className={`px-6 py-3 text-base font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === 'recovery'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-dark-500 hover:text-dark-700 dark:hover:text-dark-300'
          }`}
        >
          Social Recovery
          {recoveryHistory && recoveryHistory.length > 0 && (
            <span className="ml-2 text-base font-mono text-dark-500">({recoveryHistory.length})</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('tokens')}
          className={`px-6 py-3 text-base font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === 'tokens'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-dark-500 hover:text-dark-700 dark:hover:text-dark-300'
          }`}
        >
          Token Transfers
        </button>
      </div>

      {/* Executed Transactions */}
      {activeTab === 'transactions' && <div className="vault-panel p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200 mb-1">Executed Transactions</h2>
            <p className="text-base font-mono text-dark-500 uppercase tracking-wider">
              {executedTransactions?.length || 0} Completed
            </p>
          </div>
          <button
            onClick={handleRefreshExecuted}
            disabled={isRefreshingExecuted}
            className="text-lg text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 transition-colors font-semibold flex items-center gap-4 disabled:opacity-50"
          >
            <svg className={`w-5 h-5 ${isRefreshingExecuted ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {isLoadingHistory ? (
          <div className="text-center py-12">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-primary-600/20 blur-xl animate-pulse"></div>
              <div className="relative inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
            </div>
            <p className="mt-6 text-dark-500 dark:text-dark-400 font-semibold">Loading transaction history...</p>
            <p className="mt-2 text-base font-mono text-dark-600 uppercase tracking-wider">Accessing vault records</p>
          </div>
        ) : !executedTransactions || executedTransactions.length === 0 ? (
          <EmptyState
            icon={
              <svg
                className="w-8 h-8 text-dark-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            }
            title="No Transaction History"
            description="This vault hasn't executed any transactions yet. Once transactions are proposed, approved, and executed, they will appear here."
            action={
              walletAddress
                ? {
                    label: 'Propose Transaction',
                    to: `/wallet/${walletAddress}/transaction/new`,
                  }
                : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {executedTransactions.slice(0, executedVisible).map((tx) => {
              const decoded = decodeTransaction(tx, walletAddress, tokenMetaMap?.get(tx.to.toLowerCase()) ?? null);
              const isExpanded = expandedItems.has(tx.hash);
              const hasDetails = tx.to.toLowerCase() !== walletAddress.toLowerCase() || Object.keys(tx.approvals).length > 0;

              return (
                <div
                  key={tx.hash}
                  className="vault-panel p-5 hover:border-primary-600/50 transition-all"
                >
                  {/* Transaction Header - Always visible, clickable */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(tx.hash)}
                    className="w-full text-left"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-4 mb-2 flex-wrap">
                          <span className={`inline-flex items-center px-3 py-1 rounded-md text-base font-semibold ${decoded.bgColor} ${decoded.textColor} border ${decoded.borderColor} shadow-vault-inner`}>
                            <span className="mr-1.5">{decoded.icon}</span>
                            {decoded.description}
                          </span>
                          <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-bold bg-primary-900/50 text-primary-600 dark:text-primary-300 border border-primary-700/50">
                            ✓ Executed
                          </span>
                          {tx.transactionType === 'whitelist_execution' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-semibold bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
                              via Whitelist
                            </span>
                          )}
                          {tx.transactionType === 'daily_limit_execution' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-semibold bg-blue-900/50 text-blue-300 border border-blue-700/50">
                              via Daily Limit
                            </span>
                          )}
                        </div>
                        {decoded.details && (
                          <p className="text-lg text-dark-700 dark:text-dark-200 font-semibold mt-2">{decoded.details}</p>
                        )}
                        <p className="text-base font-mono text-dark-500 mt-2 uppercase tracking-wider">{formatTimestamp(tx.timestamp)}</p>
                      </div>
                      <div className="flex items-start gap-3 ml-4 flex-shrink-0">
                        <div className="text-right">
                          {tx.value !== '0' && (
                            <p className="text-base font-display font-bold text-gradient-red vault-text-glow">
                              {parseFloat(formatQuai(tx.value)).toFixed(4)}
                              <span className="text-lg text-primary-600 dark:text-primary-400 ml-1">QUAI</span>
                            </p>
                          )}
                          <div className="flex items-center gap-4 justify-end mt-2">
                            <p className="text-base font-mono text-dark-500">
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

                  {/* Expandable Details */}
                  {isExpanded && (
                    <div className="mt-4">
                      {/* Copy hash button row */}
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-base font-mono text-dark-500 uppercase tracking-wider">TX Hash:</span>
                        <span className="text-sm font-mono text-primary-600 dark:text-primary-300">{formatAddress(tx.hash)}</span>
                        <CopyButton text={tx.hash} size="sm" />
                      </div>

                      {/* Transaction Details - Only show if not a self-call */}
                      {tx.to.toLowerCase() !== walletAddress.toLowerCase() && (
                        <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 mb-4 border border-dark-300 dark:border-dark-600 space-y-3">
                          <div className="flex justify-between text-lg">
                            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">To:</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-lg text-primary-600 dark:text-primary-300">{formatAddress(tx.to)}</span>
                              <CopyButton text={tx.to} size="md" />
                            </div>
                          </div>
                          {tx.data !== '0x' && decoded.type === 'contractCall' && (
                            <div className="flex justify-between text-lg">
                              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Data:</span>
                              <span className="font-mono text-base text-dark-500 dark:text-dark-400 break-all max-w-xs text-right">
                                {tx.data.length > 50 ? `${tx.data.slice(0, 50)}...` : tx.data}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Approvals List */}
                      {Object.keys(tx.approvals).length > 0 && (
                        <div className="vault-divider pt-4 mt-4">
                          <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-3">Approved by:</p>
                          <div className="space-y-2">
                            {Object.entries(tx.approvals)
                              .filter(([, approved]) => approved)
                              .map(([owner]) => (
                                <div key={owner} className="flex items-center justify-between p-2 bg-dark-50 dark:bg-vault-dark-3 rounded border border-dark-300 dark:border-dark-600">
                                  <span className="text-sm font-mono text-primary-600 dark:text-primary-300">{formatAddress(owner)}</span>
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
            {executedTransactions.length > executedVisible && (
              <button
                onClick={() => setExecutedVisible(v => v + PAGE_SIZE)}
                className="w-full py-3 text-center text-primary-600 dark:text-primary-400 hover:text-primary-500 font-semibold transition-colors"
              >
                Show more ({executedTransactions.length - executedVisible} remaining)
              </button>
            )}
          </div>
        )}
      </div>}

      {/* Cancelled Transactions */}
      {activeTab === 'cancelled' && <div className="vault-panel p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-display font-bold text-dark-600 dark:text-dark-300 mb-1">Cancelled Transactions</h2>
            <p className="text-base font-mono text-dark-500 uppercase tracking-wider">
              {cancelledTransactions?.length || 0} Cancelled
            </p>
          </div>
          <button
            onClick={handleRefreshCancelled}
            disabled={isRefreshingCancelled}
            className="text-lg text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 transition-colors font-semibold flex items-center gap-4 disabled:opacity-50"
          >
            <svg className={`w-5 h-5 ${isRefreshingCancelled ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {isLoadingCancelled ? (
          <div className="text-center py-12">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-primary-600/20 blur-xl animate-pulse"></div>
              <div className="relative inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
            </div>
            <p className="mt-6 text-dark-500 dark:text-dark-400 font-semibold">Loading cancelled transactions...</p>
            <p className="mt-2 text-base font-mono text-dark-600 uppercase tracking-wider">Accessing vault records</p>
          </div>
        ) : !cancelledTransactions || cancelledTransactions.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-dark-100 dark:bg-vault-dark-4 border-2 border-dark-300 dark:border-dark-600 mb-4">
              <svg
                className="w-8 h-8 text-dark-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="text-lg text-dark-500 font-semibold">No cancelled transactions</p>
            <p className="text-base text-dark-600 mt-1 font-mono uppercase tracking-wider">
              Cancelled transactions will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {cancelledTransactions.slice(0, cancelledVisible).map((tx) => {
              const decoded = decodeTransaction(tx, walletAddress, tokenMetaMap?.get(tx.to.toLowerCase()) ?? null);
              const isExpanded = expandedItems.has(tx.hash);
              const hasDetails = tx.to.toLowerCase() !== walletAddress.toLowerCase() || (Object.keys(tx.approvals).length > 0 && Object.values(tx.approvals).some(v => v));

              return (
                <div
                  key={tx.hash}
                  className="vault-panel p-5 hover:border-primary-600/30 transition-all opacity-80"
                >
                  {/* Transaction Header - Always visible, clickable */}
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
                          <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-bold bg-dark-600/50 text-dark-500 dark:text-dark-400 border border-dark-500">
                            ✕ Cancelled
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

                  {/* Expandable Details */}
                  {isExpanded && (
                    <div className="mt-4">
                      {/* Copy hash button row */}
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-base font-mono text-dark-600 uppercase tracking-wider">TX Hash:</span>
                        <span className="text-sm font-mono text-dark-500 dark:text-dark-400">{formatAddress(tx.hash)}</span>
                        <CopyButton text={tx.hash} size="sm" />
                      </div>

                      {/* Transaction Details - Only show if not a self-call */}
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

                      {/* Approvals List */}
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
            {cancelledTransactions.length > cancelledVisible && (
              <button
                onClick={() => setCancelledVisible(v => v + PAGE_SIZE)}
                className="w-full py-3 text-center text-primary-600 dark:text-primary-400 hover:text-primary-500 font-semibold transition-colors"
              >
                Show more ({cancelledTransactions.length - cancelledVisible} remaining)
              </button>
            )}
          </div>
        )}
      </div>}

      {/* Social Recovery Operations */}
      {activeTab === 'recovery' && <div className="vault-panel p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200 mb-1">Social Recovery Operations</h2>
            <p className="text-base font-mono text-dark-500 uppercase tracking-wider">
              {recoveryHistory?.length || 0} Operations
            </p>
          </div>
          <button
            onClick={handleRefreshRecovery}
            disabled={isRefreshingRecovery}
            className="text-lg text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 transition-colors font-semibold flex items-center gap-4 disabled:opacity-50"
          >
            <svg className={`w-5 h-5 ${isRefreshingRecovery ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {isLoadingRecoveryHistory ? (
          <div className="text-center py-12">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-primary-600/20 blur-xl animate-pulse"></div>
              <div className="relative inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
            </div>
            <p className="mt-6 text-dark-500 dark:text-dark-400 font-semibold">Loading recovery operations...</p>
            <p className="mt-2 text-base font-mono text-dark-600 uppercase tracking-wider">Accessing vault records</p>
          </div>
        ) : !recoveryHistory || recoveryHistory.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-dark-100 dark:bg-vault-dark-4 border-2 border-dark-300 dark:border-dark-600 mb-4">
              <svg
                className="w-8 h-8 text-dark-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <p className="text-lg text-dark-500 font-semibold">No social recovery operations</p>
            <p className="text-base text-dark-600 mt-1 font-mono uppercase tracking-wider">
              Recovery operations will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {recoveryHistory.slice(0, recoveryVisible).map((recovery) => {
              const isExpanded = expandedItems.has(recovery.recovery_hash);

              return (
                <div
                  key={recovery.recovery_hash}
                  className={`vault-panel p-5 transition-all ${
                    recovery.status === 'pending'
                      ? 'hover:border-yellow-600/50'
                      : recovery.status === 'executed'
                      ? 'hover:border-primary-600/50'
                      : 'hover:border-primary-600/30 opacity-80'
                  }`}
                >
                  {/* Recovery Header - Always visible, clickable */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(recovery.recovery_hash)}
                    className="w-full text-left"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-4 mb-2 flex-wrap">
                          <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-semibold bg-violet-900 text-violet-200 border border-violet-700 shadow-vault-inner">
                            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Recovery
                          </span>
                          {recovery.status === 'pending' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-bold bg-yellow-900/50 text-yellow-300 border border-yellow-700/50">
                              Pending
                            </span>
                          )}
                          {recovery.status === 'executed' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-bold bg-primary-900/50 text-primary-600 dark:text-primary-300 border border-primary-700/50">
                              ✓ Executed
                            </span>
                          )}
                          {recovery.status === 'cancelled' && (
                            <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-bold bg-dark-600/50 text-dark-500 dark:text-dark-400 border border-dark-500">
                              ✕ Cancelled
                            </span>
                          )}
                        </div>
                        <p className="text-lg text-dark-700 dark:text-dark-200 font-semibold mt-2">
                          Replace owners: {recovery.new_owners.length} new owner{recovery.new_owners.length !== 1 ? 's' : ''}, threshold {recovery.new_threshold}
                        </p>
                        <p className="text-base font-mono text-dark-500 mt-2 uppercase tracking-wider">
                          {formatDateString(recovery.created_at)}
                        </p>
                      </div>
                      <div className="flex items-start gap-3 ml-4 flex-shrink-0">
                        <div className="text-right">
                          <p className={`text-base font-semibold ${
                            recovery.approval_count >= recovery.required_threshold
                              ? 'text-primary-600 dark:text-primary-400'
                              : 'text-dark-500 dark:text-dark-400'
                          }`}>
                            {recovery.approval_count} / {recovery.required_threshold} guardians
                          </p>
                          <div className="flex items-center gap-4 justify-end mt-2">
                            <p className="text-base font-mono text-dark-500">
                              {formatAddress(recovery.initiated_at_tx)}
                            </p>
                          </div>
                        </div>
                        <svg className={`w-5 h-5 text-dark-500 transition-transform mt-1 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Expandable Details */}
                  {isExpanded && (
                    <div className="mt-4">
                      {/* Copy initiation tx hash */}
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Initiation TX:</span>
                        <span className="text-sm font-mono text-dark-500">{formatAddress(recovery.initiated_at_tx)}</span>
                        <CopyButton text={recovery.initiated_at_tx} size="sm" />
                      </div>

                      {/* Recovery Details */}
                      <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 mb-4 border border-dark-300 dark:border-dark-600 space-y-3">
                        <div className="flex justify-between text-lg">
                          <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Initiated by:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-lg text-violet-400">{formatAddress(recovery.initiator_address)}</span>
                            <CopyButton text={recovery.initiator_address} size="md" />
                          </div>
                        </div>
                        <div className="flex justify-between text-lg">
                          <span className="text-base font-mono text-dark-500 uppercase tracking-wider">New Threshold:</span>
                          <span className="text-dark-700 dark:text-dark-200 font-semibold">{recovery.new_threshold} of {recovery.new_owners.length}</span>
                        </div>
                        {recovery.status === 'executed' && recovery.executed_at_tx && (
                          <div className="flex justify-between text-lg">
                            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Executed TX:</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-lg text-primary-600 dark:text-primary-300">{formatAddress(recovery.executed_at_tx)}</span>
                              <CopyButton text={recovery.executed_at_tx} size="md" />
                            </div>
                          </div>
                        )}
                        {recovery.status === 'cancelled' && recovery.cancelled_at_tx && (
                          <div className="flex justify-between text-lg">
                            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Cancelled TX:</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-lg text-dark-500 dark:text-dark-400">{formatAddress(recovery.cancelled_at_tx)}</span>
                              <CopyButton text={recovery.cancelled_at_tx} size="md" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Proposed New Owner Configuration */}
                      <div className="vault-divider pt-4 mt-4">
                        <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
                          Proposed new owners ({recovery.new_owners.length}):
                        </p>
                        <div className="space-y-2">
                          {recovery.new_owners.map((owner, idx) => (
                            <div key={owner} className="flex items-center justify-between p-2 bg-dark-50 dark:bg-vault-dark-3 rounded border border-dark-300 dark:border-dark-600">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-dark-500 w-5">{idx + 1}.</span>
                                <span className="text-sm font-mono text-violet-400 truncate">{owner}</span>
                              </div>
                              <CopyButton text={owner} size="sm" />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Guardian Approvals */}
                      {(() => {
                        const approvals = recoveryApprovalsMap?.get(recovery.recovery_hash);
                        if (!approvals || approvals.length === 0) return null;
                        const active = approvals.filter(a => a.is_active);
                        const revoked = approvals.filter(a => !a.is_active);
                        return (
                          <div className="vault-divider pt-4 mt-4">
                            <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-3">Guardian approvals:</p>
                            <div className="space-y-2">
                              {active.map((approval) => (
                                <div key={approval.id} className="flex items-center justify-between p-2 bg-dark-50 dark:bg-vault-dark-3 rounded border border-dark-300 dark:border-dark-600">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                                    <span className="text-sm font-mono text-primary-600 dark:text-primary-300">{formatAddress(approval.guardian_address)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-dark-500">{formatDateString(approval.created_at)}</span>
                                    <CopyButton text={approval.approved_at_tx} size="sm" />
                                  </div>
                                </div>
                              ))}
                              {revoked.map((approval) => (
                                <div key={approval.id} className="flex items-center justify-between p-2 bg-dark-50 dark:bg-vault-dark-3 rounded border border-dark-300 dark:border-dark-600 opacity-60">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-dark-500"></span>
                                    <span className="text-sm font-mono text-dark-500 dark:text-dark-400">{formatAddress(approval.guardian_address)}</span>
                                    <span className="text-xs text-dark-500 dark:text-dark-400 italic">revoked</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-dark-600">{formatDateString(approval.created_at)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
            {recoveryHistory.length > recoveryVisible && (
              <button
                onClick={() => setRecoveryVisible(v => v + PAGE_SIZE)}
                className="w-full py-3 text-center text-primary-600 dark:text-primary-400 hover:text-primary-500 font-semibold transition-colors"
              >
                Show more ({recoveryHistory.length - recoveryVisible} remaining)
              </button>
            )}
          </div>
        )}
      </div>}

      {/* Token Transfers */}
      {activeTab === 'tokens' && walletAddress && <div className="vault-panel p-8">
        <TokenTransferHistory walletAddress={walletAddress} />
      </div>}
    </div>
  );
}
