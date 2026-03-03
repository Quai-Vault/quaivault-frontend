import { Modal } from '../Modal';
import { TransactionFlow, type TransactionProgress } from '../TransactionFlow';
import { useMultisig } from '../../hooks/useMultisig';
import { useWallet } from '../../hooks/useWallet';
import { useSimpleTransactionModalFlow } from '../../hooks/useTransactionModalFlow';
import { TIMING } from '../../config/contracts';
import { canApproveAndExecute } from '../../utils/transactionState';
import type { PendingTransaction } from '../../types';
import { useState } from 'react';

interface ApproveTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  transaction: PendingTransaction;
}

type ExecuteMode = 'approve' | 'approveAndExecute';

export function ApproveTransactionModal({
  isOpen,
  onClose,
  walletAddress,
  transaction,
}: ApproveTransactionModalProps) {
  const { approveTransactionAsync, approveAndExecuteAsync } = useMultisig(walletAddress);
  const { connectedAddress } = useWallet();
  const resetKey = useSimpleTransactionModalFlow(isOpen);
  const [phase, setPhase] = useState<'choosing' | 'executing'>('choosing');
  const [executeMode, setExecuteMode] = useState<ExecuteMode>('approve');
  const [successMessage, setSuccessMessage] = useState('Transaction approved successfully!');

  const showExecuteOption = canApproveAndExecute(transaction, connectedAddress || '');

  // Reset to choosing phase when modal reopens
  const handleClose = () => {
    setPhase('choosing');
    setExecuteMode('approve');
    onClose();
  };

  const startFlow = (mode: ExecuteMode) => {
    setExecuteMode(mode);
    setPhase('executing');
  };

  const handleApprove = async (onProgress: (progress: TransactionProgress) => void) => {
    if (executeMode === 'approveAndExecute') {
      onProgress({ step: 'signing', message: 'Please sign the approve & execute transaction in your wallet' });
      const executed = await approveAndExecuteAsync({ walletAddress, txHash: transaction.hash });
      if (executed) {
        setSuccessMessage('Transaction approved and executed!');
      } else {
        setSuccessMessage('Transaction approved (execution was skipped by the contract).');
      }
      onProgress({
        step: 'waiting',
        txHash: transaction.hash,
        message: executed
          ? 'Waiting for execution confirmation...'
          : 'Waiting for approval confirmation...',
      });
    } else {
      setSuccessMessage('Transaction approved successfully!');
      onProgress({ step: 'signing', message: 'Please sign the approval in your wallet' });
      const txHash = await approveTransactionAsync({ walletAddress, txHash: transaction.hash });
      onProgress({ step: 'waiting', txHash: txHash || transaction.hash, message: 'Waiting for approval confirmation...' });
    }

    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));
    return transaction.hash;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Approve Transaction"
      size="md"
    >
      {phase === 'choosing' ? (
        <div className="space-y-5">
          <p className="text-dark-600 dark:text-dark-300 text-base">
            Approve transaction <span className="font-mono text-primary-500">{transaction.hash.substring(0, 10)}...</span>
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => startFlow('approve')}
              className="btn-primary w-full inline-flex items-center justify-center gap-2 text-base"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Approve
            </button>

            {showExecuteOption && (
              <button
                onClick={() => startFlow('approveAndExecute')}
                className="w-full inline-flex items-center justify-center gap-2 text-base font-semibold px-5 py-2.5 rounded border transition-all duration-300 bg-gradient-to-r from-primary-500 to-primary-600 text-white border-primary-600 shadow-vault-button hover:shadow-red-glow"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Approve & Execute
                <span className="text-xs opacity-75">(saves gas)</span>
              </button>
            )}

            <button
              onClick={handleClose}
              className="btn-secondary w-full text-base"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <TransactionFlow
          title={executeMode === 'approveAndExecute' ? "Approve & Execute" : "Approve Transaction"}
          description={`You are ${executeMode === 'approveAndExecute' ? 'approving and executing' : 'approving'} transaction ${transaction.hash.substring(0, 10)}...`}
          onExecute={handleApprove}
          onComplete={handleClose}
          onCancel={handleClose}
          successMessage={successMessage}
          resetKey={resetKey}
        />
      )}
    </Modal>
  );
}
