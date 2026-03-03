import { Modal } from '../Modal';
import { TransactionFlow } from '../TransactionFlow';
import { useMultisig } from '../../hooks/useMultisig';
import { useSimpleTransactionModalFlow } from '../../hooks/useTransactionModalFlow';
import { TIMING } from '../../config/contracts';
import { canExecute, isTimelocked, timelockSecondsRemaining, expirationSecondsRemaining } from '../../utils/transactionState';
import { formatDuration } from '../../utils/formatting';
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

  const timelocked = isTimelocked(transaction);
  const executable = canExecute(transaction);
  const expiresIn = expirationSecondsRemaining(transaction);

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
      <div className="space-y-4">
        {timelocked && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-md p-3 text-yellow-200 text-sm">
            Timelock active — executable in {formatDuration(timelockSecondsRemaining(transaction))}
          </div>
        )}
        {!executable && !timelocked && transaction.status === 'pending' && (
          <div className="bg-red-900/30 border border-red-700 rounded-md p-3 text-red-200 text-sm">
            This transaction cannot be executed yet. Check approval count and expiration status.
          </div>
        )}
        {expiresIn > 0 && expiresIn < 3600 && (
          <div className="bg-orange-900/30 border border-orange-700 rounded-md p-3 text-orange-200 text-sm">
            Warning: This transaction expires in {formatDuration(expiresIn)}
          </div>
        )}
        <TransactionFlow
          title="Execute Transaction"
          description={`You are executing transaction ${transaction.hash.substring(0, 10)}...`}
          onExecute={handleExecute}
          onComplete={onClose}
          onCancel={onClose}
          successMessage="Transaction executed successfully!"
          resetKey={resetKey}
        />
      </div>
    </Modal>
  );
}
