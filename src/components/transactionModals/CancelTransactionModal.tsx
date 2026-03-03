import { TransactionFlow } from '../TransactionFlow';
import { TransactionFlowOverlay } from '../TransactionFlowOverlay';
import { ConfirmDialog } from '../ConfirmDialog';
import { useMultisig } from '../../hooks/useMultisig';
import { useTransactionModalFlow } from '../../hooks/useTransactionModalFlow';
import { TIMING } from '../../config/contracts';
import { canProposerCancel, canConsensusCancel } from '../../utils/transactionState';
import type { PendingTransaction } from '../../types';
import { useWallet } from '../../hooks/useWallet';

interface CancelTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  transaction: PendingTransaction;
}

export function CancelTransactionModal({
  isOpen,
  onClose,
  walletAddress,
  transaction,
}: CancelTransactionModalProps) {
  const { cancelTransactionAsync, proposeTransactionAsync } = useMultisig(walletAddress);
  const { connectedAddress } = useWallet();
  const { resetKey, showFlow, startFlow, resetFlow } = useTransactionModalFlow({ isOpen });

  const isProposerCancel = canProposerCancel(transaction, connectedAddress || '');
  const isConsensusCancel = canConsensusCancel(transaction);

  const handleCancel = async (onProgress: (progress: any) => void) => {
    if (isProposerCancel) {
      // Direct proposer cancel (pre-approval)
      onProgress({ step: 'signing', message: 'Please approve the cancellation transaction in your wallet' });
      const txHash = await cancelTransactionAsync({ walletAddress, txHash: transaction.hash });
      onProgress({ step: 'waiting', txHash: txHash || transaction.hash, message: 'Waiting for cancellation confirmation...' });
    } else {
      // Consensus cancel (post-approval) — proposes a new self-call
      onProgress({ step: 'signing', message: 'Proposing a cancel-by-consensus vote...' });
      const { transactionBuilderService } = await import('../../services/TransactionBuilderService');
      const cancelData = transactionBuilderService.buildCancelByConsensus(transaction.hash);
      const txHash = await proposeTransactionAsync({
        walletAddress,
        to: walletAddress,
        value: BigInt(0),
        data: cancelData,
      });
      onProgress({ step: 'waiting', txHash: txHash || '', message: 'Waiting for proposal confirmation...' });
    }

    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));
    return transaction.hash;
  };

  const handleComplete = () => {
    resetFlow();
    onClose();
  };

  const handleCancelFlow = () => {
    resetFlow();
    onClose();
  };

  const confirmMessage = isConsensusCancel && !isProposerCancel
    ? `This transaction has already been approved. Cancellation requires a new multisig proposal calling cancelByConsensus. This will create a new transaction for owners to approve.`
    : `Are you sure you want to cancel transaction ${transaction.hash.substring(0, 10)}...${transaction.hash.slice(-6)}? This action cannot be undone.`;

  const confirmTitle = isConsensusCancel && !isProposerCancel
    ? 'Cancel by Consensus'
    : 'Cancel Transaction';

  if (showFlow) {
    return (
      <TransactionFlowOverlay onClose={handleCancelFlow}>
        <TransactionFlow
          title={confirmTitle}
          description={isConsensusCancel && !isProposerCancel
            ? `Proposing cancelByConsensus for ${transaction.hash.substring(0, 10)}...`
            : `You are cancelling transaction ${transaction.hash.substring(0, 10)}...`}
          onExecute={handleCancel}
          onComplete={handleComplete}
          onCancel={handleCancelFlow}
          successMessage={isConsensusCancel && !isProposerCancel
            ? "Cancel-by-consensus proposal submitted!"
            : "Transaction cancelled successfully!"}
          resetKey={resetKey}
        />
      </TransactionFlowOverlay>
    );
  }

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={startFlow}
      title={confirmTitle}
      message={confirmMessage}
      confirmText={isConsensusCancel && !isProposerCancel ? "Propose Cancellation" : "Cancel Transaction"}
      cancelText="Keep Transaction"
      variant="danger"
    />
  );
}
