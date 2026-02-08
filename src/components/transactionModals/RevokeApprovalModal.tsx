import { Modal } from '../Modal';
import { TransactionFlow } from '../TransactionFlow';
import type { PendingTransaction } from '../../types';
import { useMultisig } from '../../hooks/useMultisig';
import { useSimpleTransactionModalFlow } from '../../hooks/useTransactionModalFlow';
import { TIMING } from '../../config/contracts';

interface RevokeApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: PendingTransaction;
  walletAddress: string;
}

export function RevokeApprovalModal({
  isOpen,
  onClose,
  transaction,
  walletAddress,
}: RevokeApprovalModalProps) {
  const { revokeApprovalAsync, refreshTransactions } = useMultisig(walletAddress);
  const resetKey = useSimpleTransactionModalFlow(isOpen);

  const handleRevoke = async (onProgress: (progress: any) => void) => {
    try {
      onProgress({ step: 'signing', message: 'Please approve the revocation in your wallet' });

      await revokeApprovalAsync({
        walletAddress,
        txHash: transaction.hash,
      });

      onProgress({ step: 'waiting', txHash: '', message: 'Waiting for transaction confirmation...' });

      // Wait for transaction to be mined
      await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));

      // Refresh transactions to update UI
      await refreshTransactions();

      return '';
    } catch (error) {
      console.error('Error revoking approval:', error);
      throw error; // Re-throw to let TransactionFlow handle it
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Revoke Approval"
      size="lg"
    >
      <div className="space-y-6">
        <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600">
          <h3 className="text-base font-mono text-dark-500 dark:text-dark-400 uppercase tracking-wider mb-4">Transaction Details</h3>
          <div className="space-y-3 text-lg">
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 dark:text-dark-400 uppercase tracking-wider">Hash:</span>
              <span className="font-mono text-primary-600 dark:text-primary-300 break-all text-right max-w-xs">
                {transaction.hash}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 dark:text-dark-400 uppercase tracking-wider">Approvals:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">
                <span className="text-primary-500 dark:text-primary-400">{transaction.numApprovals}</span>
                <span className="text-dark-500 mx-2">/</span>
                <span className="text-dark-600 dark:text-dark-300">{transaction.threshold}</span>
              </span>
            </div>
          </div>
        </div>

        <TransactionFlow
          title="Revoke Approval"
          description="Revoking your approval for this transaction"
          onExecute={handleRevoke}
          onComplete={onClose}
          onCancel={onClose}
          successMessage="Approval revoked successfully!"
          resetKey={resetKey}
        />
      </div>
    </Modal>
  );
}
