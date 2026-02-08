import { useState, memo, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useWallet } from '../hooks/useWallet';
import { useMultisig } from '../hooks/useMultisig';
import type { PendingTransaction } from '../types';
import { formatQuai } from 'quais';
import {
  ApproveTransactionModal,
  ExecuteTransactionModal,
  CancelTransactionModal,
  RevokeApprovalModal,
} from './transactionModals';
import { decodeTransaction, type DecodedTransaction } from '../utils/transactionDecoder';
import { CopyButton } from './CopyButton';
import { EmptyState } from './EmptyState';
import { formatAddress, formatTimestamp } from '../utils/formatting';

// Virtualization constants
const ESTIMATED_ITEM_HEIGHT = 320; // Approximate height of a transaction item
const OVERSCAN = 3; // Number of items to render outside visible area
const VIRTUALIZATION_THRESHOLD = 10; // Only virtualize when more than this many items

interface TransactionListProps {
  transactions: PendingTransaction[];
  walletAddress: string;
  isOwner: boolean;
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
}: TransactionItemProps) {
  // Memoize approval-related computed values to avoid Object.entries iteration on every render
  const { hasApproved, canExecute, approvalPercentage, canCancel } = useMemo(() => {
    // Check if current user has approved - handle case-insensitive matching
    const userHasApproved = connectedAddress
      ? Object.entries(tx.approvals).some(
          ([owner, approved]) =>
            approved && owner.toLowerCase() === connectedAddress.toLowerCase()
        )
      : false;

    const meetsThreshold = tx.numApprovals >= tx.threshold;

    // Prevent division by zero - default to 100% if threshold is 0 (shouldn't happen but defensive)
    const thresholdNum = Number(tx.threshold);
    const percentage = thresholdNum > 0 ? (Number(tx.numApprovals) / thresholdNum) * 100 : 100;

    // Check if user can cancel: proposer can always cancel, others need threshold approvals
    const isProposer = connectedAddress && tx.proposer &&
      tx.proposer.toLowerCase() === connectedAddress.toLowerCase();
    const userCanCancel = isProposer || meetsThreshold;

    return {
      hasApproved: userHasApproved,
      canExecute: meetsThreshold,
      approvalPercentage: percentage,
      canCancel: userCanCancel,
    };
  }, [tx.approvals, tx.numApprovals, tx.threshold, tx.proposer, connectedAddress]);

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
            {canExecute && (
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
          <p className="text-base font-mono text-dark-500 dark:text-dark-600 uppercase tracking-wider">{formatTimestamp(tx.timestamp)}</p>
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
            <span className="text-primary-600 dark:text-primary-400">{tx.numApprovals.toString()}</span>
            <span className="text-dark-500 mx-0.5">/</span>
            <span className="text-dark-600 dark:text-dark-300">{tx.threshold.toString()}</span>
          </span>
        </div>
        <div className="w-full bg-dark-200 dark:bg-vault-dark-4 rounded-full h-1.5 border border-dark-300 dark:border-dark-600 shadow-vault-inner overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              canExecute
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
            {!hasApproved ? (
              <button
                onClick={() => onApprove(tx)}
                disabled={hasApproved}
                className="btn-primary inline-flex items-center gap-2 text-base"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Approve
              </button>
            ) : (
              <button
                onClick={() => onRevoke(tx)}
                className="btn-secondary inline-flex items-center gap-2 text-base"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Revoke
              </button>
            )}
            {canExecute && (
              <button
                onClick={() => onExecute(tx)}
                className="btn-primary inline-flex items-center gap-2 text-base bg-gradient-to-r from-primary-500 to-primary-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Execute
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => onCancel(tx)}
                className="px-5 py-2.5 text-base font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 rounded border border-red-700 shadow-vault-button hover:shadow-red-glow transition-all duration-300"
              >
                <span className="inline-flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Cancel
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export function TransactionList({ transactions, walletAddress, isOwner }: TransactionListProps) {
  const { address: connectedAddress } = useWallet();
  const { refreshTransactions } = useMultisig(walletAddress);
  const [approveModalTx, setApproveModalTx] = useState<PendingTransaction | null>(null);
  const [executeModalTx, setExecuteModalTx] = useState<PendingTransaction | null>(null);
  const [cancelModalTx, setCancelModalTx] = useState<PendingTransaction | null>(null);
  const [revokeModalTx, setRevokeModalTx] = useState<PendingTransaction | null>(null);

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

  // Memoize decoded transactions to avoid expensive decoding on every render
  const decodedTransactions = useMemo(() => {
    const decoded = new Map<string, DecodedTransaction>();
    for (const tx of transactions) {
      decoded.set(tx.hash, decodeTransaction(tx, walletAddress));
    }
    return decoded;
  }, [transactions, walletAddress]);

  // Determine if we should use virtualization
  const shouldVirtualize = transactions.length > VIRTUALIZATION_THRESHOLD;

  // Virtual list setup - only created when needed
  const rowVirtualizer = useVirtualizer({
    count: transactions.length,
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
    />
  ), [walletAddress, connectedAddress, isOwner, decodedTransactions, handleApprove, handleRevoke, handleExecute, handleCancel]);

  // Render transaction list content based on mode
  const renderContent = () => {
    // Empty state
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

    // Non-virtualized mode for small lists (better for SEO and simpler DOM)
    if (!shouldVirtualize) {
      return transactions.map((tx) => renderTransactionItem(tx));
    }

    // Virtualized mode for large lists
    return (
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
            const tx = transactions[virtualRow.index];
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
    </div>
  );
}
