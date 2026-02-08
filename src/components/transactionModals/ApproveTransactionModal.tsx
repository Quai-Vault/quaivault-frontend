import { Modal } from '../Modal';
import { TransactionFlow } from '../TransactionFlow';
import { useMultisig } from '../../hooks/useMultisig';
import { useSimpleTransactionModalFlow } from '../../hooks/useTransactionModalFlow';
import { TIMING } from '../../config/contracts';
import type { PendingTransaction } from '../../types';

interface ApproveTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  transaction: PendingTransaction;
}

export function ApproveTransactionModal({
  isOpen,
  onClose,
  walletAddress,
  transaction,
}: ApproveTransactionModalProps) {
  const { approveTransactionAsync } = useMultisig(walletAddress);
  const resetKey = useSimpleTransactionModalFlow(isOpen);

  const handleApprove = async (onProgress: (progress: any) => void) => {
    onProgress({ step: 'signing', message: 'Please approve the transaction in your wallet' });
    
    const txHash = await approveTransactionAsync({ walletAddress, txHash: transaction.hash });
    
    onProgress({ step: 'waiting', txHash: txHash || transaction.hash, message: 'Waiting for transaction confirmation...' });
    
    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));
    
    return txHash || transaction.hash;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Approve Transaction"
      size="md"
    >
      <TransactionFlow
        title="Approve Transaction"
        description={`You are approving transaction ${transaction.hash.substring(0, 10)}...`}
        onExecute={handleApprove}
        onComplete={onClose}
        onCancel={onClose}
        successMessage="Transaction approved successfully!"
        resetKey={resetKey}
      />
    </Modal>
  );
}
