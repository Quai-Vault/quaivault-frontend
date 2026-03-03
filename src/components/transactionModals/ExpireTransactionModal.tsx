import { Modal } from '../Modal';
import { TransactionFlow } from '../TransactionFlow';
import { useMultisig } from '../../hooks/useMultisig';
import { useSimpleTransactionModalFlow } from '../../hooks/useTransactionModalFlow';
import { TIMING } from '../../config/contracts';
import type { PendingTransaction } from '../../types';

interface ExpireTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  transaction: PendingTransaction;
}

export function ExpireTransactionModal({
  isOpen,
  onClose,
  walletAddress,
  transaction,
}: ExpireTransactionModalProps) {
  const { expireTransactionAsync } = useMultisig(walletAddress);
  const resetKey = useSimpleTransactionModalFlow(isOpen);

  const handleExpire = async (onProgress: (progress: any) => void) => {
    onProgress({ step: 'signing', message: 'Please approve the expiration transaction in your wallet' });

    await expireTransactionAsync({ walletAddress, txHash: transaction.hash });

    onProgress({ step: 'waiting', txHash: transaction.hash, message: 'Waiting for confirmation...' });

    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));

    return transaction.hash;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Expire Transaction"
      size="md"
    >
      <div className="space-y-4">
        <p className="text-dark-500 dark:text-dark-400 text-sm">
          This transaction has passed its expiration time and can be formally closed.
          This is a permissionless action — anyone can expire an overdue transaction.
        </p>
        <TransactionFlow
          title="Expire Transaction"
          description={`Marking transaction ${transaction.hash.substring(0, 10)}... as expired`}
          onExecute={handleExpire}
          onComplete={onClose}
          onCancel={onClose}
          successMessage="Transaction expired successfully!"
          resetKey={resetKey}
        />
      </div>
    </Modal>
  );
}
