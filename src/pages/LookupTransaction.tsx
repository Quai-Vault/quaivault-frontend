import { useParams, Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useMultisig } from '../hooks/useMultisig';
import { useWallet } from '../hooks/useWallet';
import { multisigService } from '../services/MultisigService';
import { decodeTransaction } from '../utils/transactionDecoder';
import { formatAddress, formatTimestamp } from '../utils/formatting';
import {
  ApproveTransactionModal,
  ExecuteTransactionModal,
  CancelTransactionModal,
  RevokeApprovalModal,
} from '../components/transactionModals';
import { CopyButton } from '../components/CopyButton';
import { formatQuai } from 'quais';
import type { PendingTransaction } from '../types';

export function LookupTransaction() {
  const { address: walletAddress } = useParams<{ address: string }>();
  const { address: connectedAddress } = useWallet();
  const { walletInfo, refreshTransactions } = useMultisig(walletAddress);
  const [txHash, setTxHash] = useState('');
  const [transaction, setTransaction] = useState<PendingTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approveModalTx, setApproveModalTx] = useState<PendingTransaction | null>(null);
  const [executeModalTx, setExecuteModalTx] = useState<PendingTransaction | null>(null);
  const [cancelModalTx, setCancelModalTx] = useState<PendingTransaction | null>(null);
  const [revokeModalTx, setRevokeModalTx] = useState<PendingTransaction | null>(null);

  const handleLookup = async () => {
    if (!walletAddress || !txHash.trim()) {
      setError('Please enter a transaction hash');
      return;
    }

    setIsLoading(true);
    setError(null);
    setTransaction(null);

    try {
      const tx = await multisigService.getTransactionByHash(walletAddress, txHash.trim());
      if (!tx) {
        setError('Transaction not found. Please verify the hash is correct.');
      } else {
        setTransaction(tx);
      }
    } catch (err: any) {
      console.error('Error looking up transaction:', err);
      setError(err.message || 'Failed to lookup transaction. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = (tx: PendingTransaction) => {
    setApproveModalTx(tx);
  };

  const handleRevoke = (tx: PendingTransaction) => {
    setRevokeModalTx(tx);
  };

  const handleExecute = (tx: PendingTransaction) => {
    setExecuteModalTx(tx);
  };

  const handleCancel = (tx: PendingTransaction) => {
    setCancelModalTx(tx);
  };

  if (!walletAddress) {
    return (
      <div className="text-center py-20">
        <div className="vault-panel max-w-md mx-auto p-12">
          <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200 mb-2">Invalid Wallet Address</h2>
          <p className="text-dark-500">The requested vault address is invalid.</p>
        </div>
      </div>
    );
  }

  // Memoize expensive calculations to prevent recalculation on every render
  const isOwner = useMemo(() =>
    walletInfo?.owners.some(
      (owner) => owner.toLowerCase() === connectedAddress?.toLowerCase()
    ) || false,
    [walletInfo?.owners, connectedAddress]
  );

  const decoded = useMemo(() =>
    transaction ? decodeTransaction(transaction, walletAddress) : null,
    [transaction, walletAddress]
  );

  const hasApproved = useMemo(() =>
    transaction && connectedAddress
      ? Object.entries(transaction.approvals).some(
          ([owner, approved]) =>
            approved && owner.toLowerCase() === connectedAddress.toLowerCase()
        )
      : false,
    [transaction, connectedAddress]
  );

  const canExecute = useMemo(() =>
    transaction ? transaction.numApprovals >= transaction.threshold : false,
    [transaction?.numApprovals, transaction?.threshold]
  );

  const approvalPercentage = useMemo(() =>
    transaction
      ? (Number(transaction.numApprovals) / Number(transaction.threshold)) * 100
      : 0,
    [transaction?.numApprovals, transaction?.threshold]
  );

  const isProposer = useMemo(() =>
    connectedAddress && transaction?.proposer &&
      transaction.proposer.toLowerCase() === connectedAddress.toLowerCase(),
    [connectedAddress, transaction?.proposer]
  );

  const canCancel = useMemo(() =>
    isProposer || (transaction ? transaction.numApprovals >= transaction.threshold : false),
    [isProposer, transaction?.numApprovals, transaction?.threshold]
  );

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to={`/wallet/${walletAddress}`}
          className="text-lg text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 mb-3 inline-flex items-center gap-4 transition-colors font-semibold"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Vault
        </Link>
        <h1 className="text-xl font-display font-bold text-gradient-red vault-text-glow mb-2">Lookup Transaction</h1>
        <p className="text-lg font-mono text-dark-500 uppercase tracking-wider">
          Find and interact with transactions by hash
        </p>
      </div>

      {/* Search Form */}
      <div className="vault-panel p-6 mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
              Transaction Hash
            </label>
            <div className="flex gap-4">
              <input
                type="text"
                value={txHash}
                onChange={(e) => {
                  setTxHash(e.target.value);
                  setError(null);
                  setTransaction(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleLookup();
                  }
                }}
                placeholder="0x..."
                className="input-field flex-1"
              />
              <button
                onClick={handleLookup}
                disabled={isLoading || !txHash.trim()}
                className="btn-primary px-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-4">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Looking up...
                  </span>
                ) : (
                  'Lookup'
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-gradient-to-r from-primary-900/90 via-primary-800/90 to-primary-900/90 border-l-4 border-primary-600 rounded-md p-4 shadow-red-glow">
              <div className="flex items-start gap-4">
                <svg className="w-5 h-5 text-primary-600 dark:text-primary-300 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-lg text-primary-200 font-medium">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Display */}
      {transaction && decoded && (
        <div className="vault-panel p-6">
          <div className="mb-6">
            <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200 mb-1">Transaction Details</h2>
            <p className="text-base font-mono text-dark-500 uppercase tracking-wider">
              {transaction.executed ? 'Executed' : transaction.cancelled ? 'Cancelled' : 'Pending'}
            </p>
          </div>

          {/* Transaction Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-4 mb-5">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-4 mb-2">
                <span className={`inline-flex items-center px-3 py-1 rounded-md text-base font-semibold ${decoded.bgColor} ${decoded.textColor} border ${decoded.borderColor} shadow-vault-inner`}>
                  <span className="mr-1.5">{decoded.icon}</span>
                  {decoded.description}
                </span>
                {transaction.executed && (
                  <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-bold bg-primary-900/50 text-primary-600 dark:text-primary-300 border border-primary-700/50">
                    ✓ Executed
                  </span>
                )}
                {transaction.cancelled && (
                  <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-bold bg-dark-600/50 text-dark-500 dark:text-dark-400 border border-dark-500">
                    ✕ Cancelled
                  </span>
                )}
                {!transaction.executed && !transaction.cancelled && canExecute && (
                  <span className="inline-flex items-center px-3 py-1 rounded-md text-base font-semibold bg-gradient-to-r from-primary-700 to-primary-800 text-primary-200 border border-primary-600 shadow-red-glow animate-pulse-slow">
                    Ready to execute
                  </span>
                )}
              </div>
              {decoded.details && (
                <p className="text-lg text-dark-600 dark:text-dark-300 font-medium mt-2 mb-1">{decoded.details}</p>
              )}
              <p className="text-base font-mono text-dark-600 uppercase tracking-wider mt-1">
                {formatTimestamp(transaction.timestamp)}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              {transaction.value !== '0' && (
                <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md px-5 py-3 border border-dark-300 dark:border-dark-600 mb-2">
                  <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1">Value</p>
                  <p className="text-base font-display font-bold text-gradient-red vault-text-glow">
                    {parseFloat(formatQuai(transaction.value)).toFixed(4)} QUAI
                  </p>
                </div>
              )}
              <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md px-5 py-3 border border-dark-300 dark:border-dark-600">
                <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1">Hash</p>
                <div className="flex items-center gap-4">
                  <p className="text-base font-mono text-primary-600 dark:text-primary-400 break-all max-w-[200px] flex-1">
                    {transaction.hash}
                  </p>
                  <CopyButton text={transaction.hash} size="sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Details */}
          {transaction.to.toLowerCase() !== walletAddress.toLowerCase() && (
            <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 mb-5 border border-dark-300 dark:border-dark-600">
              <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-3">Transaction Details</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-lg">
                  <span className="text-base font-mono text-dark-500 uppercase tracking-wider">To:</span>
                  <span className="font-mono text-primary-600 dark:text-primary-300">{formatAddress(transaction.to)}</span>
                </div>
                {transaction.data !== '0x' && (
                  <div className="flex justify-between items-center text-lg">
                    <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Data:</span>
                    <span className="font-mono text-primary-600 dark:text-primary-400 truncate max-w-xs">
                      {transaction.data.slice(0, 20)}...
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Approval Progress */}
          {!transaction.executed && !transaction.cancelled && (
            <>
              <div className="mb-5">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Approvals</span>
                  <span className="text-base font-semibold text-dark-700 dark:text-dark-200">
                    <span className="text-primary-600 dark:text-primary-400">{transaction.numApprovals.toString()}</span>
                    <span className="text-dark-500 mx-1">/</span>
                    <span className="text-dark-600 dark:text-dark-300">{transaction.threshold.toString()}</span>
                  </span>
                </div>
                <div className="w-full bg-dark-100 dark:bg-vault-dark-4 rounded-full h-2 border border-dark-300 dark:border-dark-600 shadow-vault-inner overflow-hidden">
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
              <div className="mb-5">
                <h4 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-2">Approved by</h4>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(transaction.approvals).map(([owner, approved]) => {
                    if (!approved) return null;
                    const isYou = owner.toLowerCase() === connectedAddress?.toLowerCase();
                    return (
                      <span
                        key={owner}
                        className={`inline-flex items-center px-5 py-2.5 rounded-md text-base font-medium border shadow-vault-inner ${
                          isYou
                            ? 'bg-gradient-to-r from-primary-800/50 to-primary-900/50 text-primary-600 dark:text-primary-300 border-primary-600/50'
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
                <div className="pt-5 border-t border-dark-200 dark:border-dark-700">
                  <div className="flex flex-wrap gap-4">
                    {!hasApproved ? (
                      <button
                        onClick={() => handleApprove(transaction)}
                        className="btn-primary inline-flex items-center gap-4"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Approve
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRevoke(transaction)}
                        className="btn-secondary inline-flex items-center gap-4"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Revoke Approval
                      </button>
                    )}
                    {canExecute && (
                      <button
                        onClick={() => handleExecute(transaction)}
                        className="btn-primary inline-flex items-center gap-4 bg-gradient-to-r from-primary-500 to-primary-600"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Execute
                      </button>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => handleCancel(transaction)}
                        className="px-4 py-2 text-lg font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 rounded-lg border border-red-700 shadow-vault-button hover:shadow-red-glow transition-all duration-300 hover:scale-105 active:scale-95 inline-flex items-center gap-4"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {approveModalTx && (
        <ApproveTransactionModal
          isOpen={!!approveModalTx}
          onClose={() => {
            setApproveModalTx(null);
            refreshTransactions();
            // Refresh the transaction after approval
            if (txHash.trim()) {
              handleLookup();
            }
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
            // Refresh the transaction after execution
            if (txHash.trim()) {
              handleLookup();
            }
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
            // Refresh the transaction after cancellation
            if (txHash.trim()) {
              handleLookup();
            }
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
            // Refresh the transaction after revocation
            if (txHash.trim()) {
              handleLookup();
            }
          }}
          walletAddress={walletAddress}
          transaction={revokeModalTx}
        />
      )}
    </div>
  );
}
