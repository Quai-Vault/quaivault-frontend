import { useState, memo, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '../hooks/useWallet';
import type { PendingTransaction } from '../types';
import { formatQuai } from 'quais';
import {
  ApproveTransactionModal,
  ExecuteTransactionModal,
  CancelTransactionModal,
  RevokeApprovalModal,
  ExpireTransactionModal,
} from './transactionModals';
import { decodeTransaction, type DecodedTransaction } from '../utils/transactionDecoder';
import {
  canApprove as computeCanApprove,
  canExecute as computeCanExecute,
  canRevoke as computeCanRevoke,
  canProposerCancel as computeCanProposerCancel,
  canConsensusCancel as computeCanConsensusCancel,
  canExpire as computeCanExpire,
  isTimelocked as computeIsTimelocked,
} from '../utils/transactionState';
import { CopyButton } from './CopyButton';
import { EmptyState } from './EmptyState';
import { TimelockCountdown } from './TimelockCountdown';
import { formatAddress, formatTimestamp, formatRelativeTime, formatDuration } from '../utils/formatting';
import { indexerService } from '../services';
import type { TokenMetadata } from '../services/utils/ContractMetadataService';

// Virtualization constants
const ESTIMATED_ITEM_HEIGHT = 320; // Approximate height of a transaction item
const OVERSCAN = 3; // Number of items to render outside visible area
const VIRTUALIZATION_THRESHOLD = 10; // Only virtualize when more than this many items

interface TransactionListProps {
  transactions: PendingTransaction[];
  walletAddress: string;
  isOwner: boolean;
  refreshTransactions: () => void;
}

interface TransactionItemProps {
  tx: PendingTransaction;
  walletAddress: string;
  connectedAddress: string | null;
  isOwner: boolean;
  decoded: DecodedTransaction;
  onApprove: (tx: PendingTransaction) => void;
  onRevoke: (tx: PendingTransaction) => void;
  onExecute: (tx: PendingTransaction) => void;
  onCancel: (tx: PendingTransaction) => void;
  onExpire: (tx: PendingTransaction) => void;
}

/**
 * Memoized transaction item component to prevent unnecessary re-renders
 * when other transactions in the list change
 */
const TransactionItem = memo(function TransactionItem({
  tx,
  walletAddress,
  connectedAddress,
  isOwner,
  decoded,
  onApprove,
  onRevoke,
  onExecute,
  onCancel,
  onExpire,
}: TransactionItemProps) {
  // Bumped when a timelock countdown reaches zero, forcing re-evaluation of memoized state
  const [timelockTick, setTimelockTick] = useState(0);
  const handleTimelockElapsed = useCallback(() => setTimelockTick(t => t + 1), []);

  // Memoize approval-related computed values using centralized transaction state logic
  const {
    hasApproved,
    approvalCount,
    canExecuteIt,
    approvalPercentage,
    canProposerCancelIt,
    canConsensusCancelIt,
    canRevokeApproval,
    canApproveIt,
    timelocked,
    canExpireIt,
  } = useMemo(() => {
    const addr = connectedAddress || '';

    // Check if current user has approved - handle case-insensitive matching
    const userHasApproved = connectedAddress
      ? Object.entries(tx.approvals).some(
          ([owner, approved]) =>
            approved && owner.toLowerCase() === connectedAddress.toLowerCase()
        )
      : false;

    // Derive approval count from the approvals map (authoritative — kept in sync by subscription)
    // Falls back to tx.numApprovals for edge cases where approvals map may be incomplete
    const approvalCount = Object.values(tx.approvals).filter(Boolean).length || tx.numApprovals;
    // Prevent division by zero - default to 100% if threshold is 0 (shouldn't happen but defensive)
    const thresholdNum = Number(tx.threshold);
    const percentage = thresholdNum > 0 ? (approvalCount / thresholdNum) * 100 : 100;

    return {
      hasApproved: userHasApproved,
      approvalCount,
      canExecuteIt: computeCanExecute(tx),
      approvalPercentage: percentage,
      canProposerCancelIt: computeCanProposerCancel(tx, addr),
      canConsensusCancelIt: computeCanConsensusCancel(tx),
      canRevokeApproval: computeCanRevoke(tx, addr),
      canApproveIt: computeCanApprove(tx, addr),
      timelocked: computeIsTimelocked(tx),
      canExpireIt: computeCanExpire(tx),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, connectedAddress, timelockTick]);

  return (
    <div className="vault-panel p-5 hover:border-primary-600/50 transition-all duration-300">
      {/* Transaction Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-4 mb-2.5">
            <span className={`inline-flex items-center px-3 py-1.5 rounded text-base font-semibold ${decoded.bgColor} ${decoded.textColor} border ${decoded.borderColor} shadow-vault-inner`}>
              <span className="mr-2">{decoded.icon}</span>
              {decoded.description}
            </span>
            {/* Status badges based on 5-state lifecycle */}
            {timelocked ? (
              <TimelockCountdown executableAfter={tx.executableAfter} onElapsed={handleTimelockElapsed} />
            ) : tx.executionDelay > 0 && (
              <span className="inline-flex items-center px-3 py-1.5 rounded text-base font-semibold bg-gradient-to-r from-yellow-900 to-yellow-950 text-yellow-300 border border-yellow-700 shadow-vault-inner">
                <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                Execution Delay: {formatDuration(tx.executionDelay)}
              </span>
            )}
            {(canExpireIt || tx.status === 'expired') ? (
              <span className="inline-flex items-center px-3 py-1.5 rounded text-base font-semibold bg-gradient-to-r from-orange-700 to-orange-800 text-orange-200 border border-orange-600 shadow-vault-inner">
                <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Expired
              </span>
            ) : tx.expiration > 0 && tx.status === 'pending' && (() => {
              const expiresAt = new Date(tx.expiration * 1000);
              const expiresDate = expiresAt.toLocaleDateString(undefined, {
                month: 'short', day: 'numeric',
                year: expiresAt.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
              });
              const expiresTime = expiresAt.toLocaleTimeString(undefined, {
                hour: 'numeric', minute: '2-digit',
              });
              return (
                <span className="inline-flex items-center px-3 py-1.5 rounded text-base font-semibold bg-gradient-to-r from-orange-900 to-orange-950 text-orange-300 border border-orange-700 shadow-vault-inner">
                  <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  Expires {expiresDate} at {expiresTime}
                </span>
              );
            })()}
            {tx.status === 'failed' && (
              <span className="inline-flex items-center px-3 py-1.5 rounded text-base font-semibold bg-gradient-to-r from-red-700 to-red-800 text-red-200 border border-red-600 shadow-vault-inner">
                <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Failed
              </span>
            )}
            {canExecuteIt && (
              <span className="inline-flex items-center px-3 py-1.5 rounded text-base font-semibold bg-gradient-to-r from-primary-700 to-primary-800 text-primary-200 border border-primary-600 shadow-red-glow animate-pulse-slow">
                <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Ready to execute
              </span>
            )}
          </div>
          {decoded.details && (
            <p className="text-base text-dark-600 dark:text-dark-300 font-medium mt-1 mb-0.5">{decoded.details}</p>
          )}
          <p className="text-base font-mono text-dark-500 dark:text-dark-600 uppercase tracking-wider" title={formatTimestamp(tx.timestamp)}>{formatRelativeTime(tx.timestamp)}</p>
        </div>
        <div className="text-right flex-shrink-0">
          {tx.value !== '0' && (
            <div className="bg-dark-100 dark:bg-vault-dark-4 rounded px-4 py-2.5 border border-dark-300 dark:border-dark-600 mb-1.5">
              <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-0.5">Value</p>
              <p className="text-base font-display font-bold text-gradient-red vault-text-glow">
                {parseFloat(formatQuai(tx.value)).toFixed(4)} QUAI
              </p>
            </div>
          )}
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded px-4 py-2.5 border border-dark-300 dark:border-dark-600">
            <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1">Hash</p>
            <div className="flex items-center gap-4">
              <p className="text-base font-mono text-primary-600 dark:text-primary-400 break-all max-w-[120px] flex-1">
                {formatAddress(tx.hash)}
              </p>
              <CopyButton text={tx.hash} size="sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Details - Only show if not a self-call */}
      {tx.to.toLowerCase() !== walletAddress.toLowerCase() && (
        <div className="bg-dark-100 dark:bg-vault-dark-4 rounded p-4 mb-3 border border-dark-300 dark:border-dark-600">
          <div className="flex justify-between items-center text-base gap-4">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">To:</span>
            <span className="font-mono text-primary-600 dark:text-primary-300">{formatAddress(tx.to)}</span>
          </div>
        </div>
      )}

      {/* Approval Progress */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Approvals</span>
          <span className="text-base font-semibold text-dark-700 dark:text-dark-200">
            <span className="text-primary-600 dark:text-primary-400">{approvalCount}</span>
            <span className="text-dark-500 mx-0.5">/</span>
            <span className="text-dark-600 dark:text-dark-300">{tx.threshold.toString()}</span>
          </span>
        </div>
        <div
          className="w-full bg-dark-200 dark:bg-vault-dark-4 rounded-full h-1.5 border border-dark-300 dark:border-dark-600 shadow-vault-inner overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(approvalPercentage)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Approval progress: ${approvalCount} of ${tx.threshold.toString()} required`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              canExecuteIt
                ? 'bg-gradient-to-r from-primary-500 to-primary-600 shadow-red-glow'
                : 'bg-gradient-to-r from-primary-700 to-primary-800'
            }`}
            style={{ width: `${Math.min(approvalPercentage, 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Approvals List */}
      <div className="mb-3">
        <h4 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-2">Approved by</h4>
        <div className="flex flex-wrap gap-3">
          {Object.entries(tx.approvals).map(([owner, approved]) => {
            if (!approved) return null;
            const isYou = owner.toLowerCase() === connectedAddress?.toLowerCase();
            return (
              <span
                key={owner}
                className={`inline-flex items-center px-3 py-1.5 rounded text-base font-medium border shadow-vault-inner ${
                  isYou
                    ? 'bg-gradient-to-r from-primary-100 to-primary-200 dark:from-primary-800/50 dark:to-primary-900/50 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-600/50'
                    : 'bg-dark-100 dark:bg-vault-dark-4 text-dark-600 dark:text-dark-300 border-dark-300 dark:border-dark-600'
                }`}
              >
                <span className="font-mono">{formatAddress(owner)}</span>
                {isYou && <span className="ml-2 text-primary-600 dark:text-primary-400 font-semibold">(You)</span>}
              </span>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      {isOwner && (
        <div className="pt-3 border-t border-dark-200 dark:border-dark-700">
          <div className="flex flex-wrap gap-4">
            {canApproveIt && (
              <button
                onClick={() => onApprove(tx)}
                className="btn-primary inline-flex items-center gap-2 text-base"
                aria-label={`Approve transaction ${tx.hash.slice(0, 10)}...`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Approve
              </button>
            )}
            {canRevokeApproval && (
              <button
                onClick={() => onRevoke(tx)}
                className="btn-secondary inline-flex items-center gap-2 text-base"
                aria-label={`Revoke approval for transaction ${tx.hash.slice(0, 10)}...`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Revoke
              </button>
            )}
            {canExecuteIt && (
              <button
                onClick={() => onExecute(tx)}
                className="btn-primary inline-flex items-center gap-2 text-base bg-gradient-to-r from-primary-500 to-primary-600"
                aria-label={`Execute transaction ${tx.hash.slice(0, 10)}...`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Execute
              </button>
            )}
            {canProposerCancelIt && (
              <button
                onClick={() => onCancel(tx)}
                className="px-5 py-2.5 text-base font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 rounded border border-red-700 shadow-vault-button hover:shadow-red-glow transition-all duration-300"
                aria-label={`Cancel transaction ${tx.hash.slice(0, 10)}...`}
              >
                <span className="inline-flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Cancel
                </span>
              </button>
            )}
            {canConsensusCancelIt && (
              <button
                onClick={() => onCancel(tx)}
                className="px-5 py-2.5 text-base font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 rounded border border-red-700 shadow-vault-button hover:shadow-red-glow transition-all duration-300"
                aria-label={`Cancel transaction ${tx.hash.slice(0, 10)}... by consensus`}
              >
                <span className="inline-flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Cancel by Consensus
                </span>
              </button>
            )}
            {canExpireIt && (
              <button
                onClick={() => onExpire(tx)}
                className="px-5 py-2.5 text-base font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-700 rounded border border-orange-700 shadow-vault-button hover:shadow-red-glow transition-all duration-300"
                aria-label={`Expire transaction ${tx.hash.slice(0, 10)}...`}
              >
                <span className="inline-flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Expire
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

type FilterType = 'all' | 'needs-approval' | 'ready' | 'timelocked';

export function TransactionList({ transactions, walletAddress, isOwner, refreshTransactions }: TransactionListProps) {
  const { address: connectedAddress } = useWallet();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [approveModalTx, setApproveModalTx] = useState<PendingTransaction | null>(null);
  const [executeModalTx, setExecuteModalTx] = useState<PendingTransaction | null>(null);
  const [cancelModalTx, setCancelModalTx] = useState<PendingTransaction | null>(null);
  const [revokeModalTx, setRevokeModalTx] = useState<PendingTransaction | null>(null);
  const [expireModalTx, setExpireModalTx] = useState<PendingTransaction | null>(null);

  // Ref for virtualizer scrolling container
  const parentRef = useRef<HTMLDivElement>(null);

  // Memoize handlers to prevent TransactionItem re-renders
  const handleApprove = useCallback((tx: PendingTransaction) => {
    setApproveModalTx(tx);
  }, []);

  const handleRevoke = useCallback((tx: PendingTransaction) => {
    setRevokeModalTx(tx);
  }, []);

  const handleExecute = useCallback((tx: PendingTransaction) => {
    setExecuteModalTx(tx);
  }, []);

  const handleCancel = useCallback((tx: PendingTransaction) => {
    setCancelModalTx(tx);
  }, []);

  const handleExpire = useCallback((tx: PendingTransaction) => {
    setExpireModalTx(tx);
  }, []);

  // Extract unique target addresses for token metadata lookup
  const targetAddresses = useMemo(() => {
    const addrs = new Set<string>();
    for (const tx of transactions) {
      if (tx.to.toLowerCase() !== walletAddress.toLowerCase() && tx.data && tx.data !== '0x') {
        addrs.add(tx.to);
      }
    }
    return [...addrs];
  }, [transactions, walletAddress]);

  // Fetch token metadata from DB for target contract addresses
  const { data: tokenMetaMap } = useQuery({
    queryKey: ['txListTokenMeta', ...targetAddresses],
    queryFn: async () => {
      if (targetAddresses.length === 0) return new Map<string, TokenMetadata>();
      const tokens = await indexerService.token.getTokensByAddresses(targetAddresses);
      const metaMap = new Map<string, TokenMetadata>();
      for (const [addr, token] of tokens) {
        metaMap.set(addr, { name: token.name, symbol: token.symbol, decimals: token.decimals });
      }
      return metaMap;
    },
    enabled: targetAddresses.length > 0,
    staleTime: 60_000,
  });

  // Memoize decoded transactions to avoid expensive decoding on every render
  const decodedTransactions = useMemo(() => {
    const decoded = new Map<string, DecodedTransaction>();
    for (const tx of transactions) {
      const meta = tokenMetaMap?.get(tx.to.toLowerCase()) ?? null;
      decoded.set(tx.hash, decodeTransaction(tx, walletAddress, meta));
    }
    return decoded;
  }, [transactions, walletAddress, tokenMetaMap]);

  // Filter transactions based on active filter
  const filteredTransactions = useMemo(() => {
    if (activeFilter === 'all') return transactions;
    const addr = connectedAddress || '';
    return transactions.filter((tx) => {
      switch (activeFilter) {
        case 'needs-approval':
          return computeCanApprove(tx, addr);
        case 'ready':
          return computeCanExecute(tx);
        case 'timelocked':
          return computeIsTimelocked(tx);
        default:
          return true;
      }
    });
  }, [transactions, activeFilter, connectedAddress]);

  // Determine if we should use virtualization
  const shouldVirtualize = filteredTransactions.length > VIRTUALIZATION_THRESHOLD;

  // Virtual list setup - only created when needed
  const rowVirtualizer = useVirtualizer({
    count: filteredTransactions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: OVERSCAN,
    // Enable dynamic measurement for variable height items
    measureElement: (element) => element.getBoundingClientRect().height + 12, // +12 for gap
  });

  // Render a single transaction item (used by both virtualized and non-virtualized modes)
  const renderTransactionItem = useCallback((tx: PendingTransaction) => (
    <TransactionItem
      key={tx.hash}
      tx={tx}
      walletAddress={walletAddress}
      connectedAddress={connectedAddress}
      isOwner={isOwner}
      decoded={decodedTransactions.get(tx.hash)!}
      onApprove={handleApprove}
      onRevoke={handleRevoke}
      onExecute={handleExecute}
      onCancel={handleCancel}
      onExpire={handleExpire}
    />
  ), [walletAddress, connectedAddress, isOwner, decodedTransactions, handleApprove, handleRevoke, handleExecute, handleCancel, handleExpire]);

  // Filter chip definitions
  const filterChips: { key: FilterType; label: string }[] = useMemo(() => [
    { key: 'all', label: 'All' },
    { key: 'needs-approval', label: 'Needs My Approval' },
    { key: 'ready', label: 'Ready to Execute' },
    { key: 'timelocked', label: 'Timelocked' },
  ], []);

  // Render transaction list content based on mode
  const renderContent = () => {
    // Empty state (no transactions at all)
    if (transactions.length === 0) {
      return (
        <EmptyState
          icon={
            <svg
              className="w-6 h-6 text-dark-400 dark:text-dark-600"
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
          title="No Pending Transactions"
          description="All transactions have been processed. New transactions will appear here once proposed."
          className="py-8"
        />
      );
    }

    return (
      <>
        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => setActiveFilter(chip.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-all duration-200 ${
                activeFilter === chip.key
                  ? 'bg-primary-600 text-white border-primary-600 shadow-red-glow'
                  : 'bg-dark-100 dark:bg-vault-dark-4 text-dark-600 dark:text-dark-300 border-dark-300 dark:border-dark-600 hover:border-primary-600/50 hover:text-primary-600 dark:hover:text-primary-400'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Empty filter result */}
        {filteredTransactions.length === 0 && (
          <div className="text-center py-8">
            <p className="text-dark-500 dark:text-dark-400 text-base">No transactions match this filter.</p>
            <button
              onClick={() => setActiveFilter('all')}
              className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-500 font-semibold"
            >
              Show all transactions
            </button>
          </div>
        )}

        {/* Non-virtualized mode for small lists (better for SEO and simpler DOM) */}
        {filteredTransactions.length > 0 && !shouldVirtualize && (
          filteredTransactions.map((tx) => renderTransactionItem(tx))
        )}

        {/* Virtualized mode for large lists */}
        {filteredTransactions.length > 0 && shouldVirtualize && (
          <div
            ref={parentRef}
            className="max-h-[calc(100vh-300px)] overflow-auto scrollbar-thin"
            style={{ contain: 'strict' }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const tx = filteredTransactions[virtualRow.index];
                return (
                  <div
                    key={tx.hash}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {renderTransactionItem(tx)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="space-y-3">
      {renderContent()}

      {/* Modals */}
      {approveModalTx && (
        <ApproveTransactionModal
          isOpen={!!approveModalTx}
          onClose={() => {
            setApproveModalTx(null);
            refreshTransactions();
          }}
          walletAddress={walletAddress}
          transaction={approveModalTx}
        />
      )}
      {executeModalTx && (
        <ExecuteTransactionModal
          isOpen={!!executeModalTx}
          onClose={() => {
            setExecuteModalTx(null);
            refreshTransactions();
          }}
          walletAddress={walletAddress}
          transaction={executeModalTx}
        />
      )}
      {cancelModalTx && (
        <CancelTransactionModal
          isOpen={!!cancelModalTx}
          onClose={() => {
            setCancelModalTx(null);
            refreshTransactions();
          }}
          walletAddress={walletAddress}
          transaction={cancelModalTx}
        />
      )}
      {revokeModalTx && (
        <RevokeApprovalModal
          isOpen={!!revokeModalTx}
          onClose={() => {
            setRevokeModalTx(null);
            refreshTransactions();
          }}
          walletAddress={walletAddress}
          transaction={revokeModalTx}
        />
      )}
      {expireModalTx && (
        <ExpireTransactionModal
          isOpen={!!expireModalTx}
          onClose={() => {
            setExpireModalTx(null);
            refreshTransactions();
          }}
          walletAddress={walletAddress}
          transaction={expireModalTx}
        />
      )}
    </div>
  );
}
