import { Modal } from '../Modal';
import { TransactionFlow } from '../TransactionFlow';
import { useMultisig } from '../../hooks/useMultisig';
import { useSimpleTransactionModalFlow } from '../../hooks/useTransactionModalFlow';
import { TIMING } from '../../config/contracts';
import type { PendingTransaction } from '../../types';

interface ExecuteTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  transaction: PendingTransaction;
}

export function ExecuteTransactionModal({
  isOpen,
  onClose,
  walletAddress,
  transaction,
}: ExecuteTransactionModalProps) {
  const { executeTransactionAsync } = useMultisig(walletAddress);
  const resetKey = useSimpleTransactionModalFlow(isOpen);

  const handleExecute = async (onProgress: (progress: any) => void) => {
    onProgress({ step: 'signing', message: 'Please approve the execution transaction in your wallet' });
    
    const txHash = await executeTransactionAsync({ walletAddress, txHash: transaction.hash });
    
    onProgress({ step: 'waiting', txHash: txHash || transaction.hash, message: 'Waiting for transaction execution...' });
    
    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));
    
    return txHash || transaction.hash;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Execute Transaction"
      size="md"
    >
      <TransactionFlow
        title="Execute Transaction"
        description={`You are executing transaction ${transaction.hash.substring(0, 10)}...`}
        onExecute={handleExecute}
        onComplete={onClose}
        onCancel={onClose}
        successMessage="Transaction executed successfully!"
        resetKey={resetKey}
      />
    </Modal>
  );
}
