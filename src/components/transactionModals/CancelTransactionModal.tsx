import { TransactionFlow } from '../TransactionFlow';
import { TransactionFlowOverlay } from '../TransactionFlowOverlay';
import { ConfirmDialog } from '../ConfirmDialog';
import { useMultisig } from '../../hooks/useMultisig';
import { useTransactionModalFlow } from '../../hooks/useTransactionModalFlow';
import { TIMING } from '../../config/contracts';
import type { PendingTransaction } from '../../types';

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
  const { cancelTransactionAsync } = useMultisig(walletAddress);
  const { resetKey, showFlow, startFlow, resetFlow } = useTransactionModalFlow({ isOpen });

  const handleCancel = async (onProgress: (progress: any) => void) => {
    onProgress({ step: 'signing', message: 'Please approve the cancellation transaction in your wallet' });

    const txHash = await cancelTransactionAsync({ walletAddress, txHash: transaction.hash });

    onProgress({ step: 'waiting', txHash: txHash || transaction.hash, message: 'Waiting for cancellation confirmation...' });

    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));

    return txHash || transaction.hash;
  };

  const handleComplete = () => {
    resetFlow();
    onClose();
  };

  const handleCancelFlow = () => {
    resetFlow();
    onClose();
  };

  if (showFlow) {
    return (
      <TransactionFlowOverlay onClose={handleCancelFlow}>
        <TransactionFlow
          title="Cancel Transaction"
          description={`You are cancelling transaction ${transaction.hash.substring(0, 10)}...`}
          onExecute={handleCancel}
          onComplete={handleComplete}
          onCancel={handleCancelFlow}
          successMessage="Transaction cancelled successfully!"
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
      title="Cancel Transaction"
      message={`Are you sure you want to cancel transaction ${transaction.hash.substring(0, 10)}...${transaction.hash.slice(-6)}? This action cannot be undone.`}
      confirmText="Cancel Transaction"
      cancelText="Keep Transaction"
      variant="danger"
    />
  );
}
