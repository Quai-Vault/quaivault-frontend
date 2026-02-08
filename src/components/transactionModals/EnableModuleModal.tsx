import { Modal } from '../Modal';
import { TransactionFlow } from '../TransactionFlow';
import { useMultisig } from '../../hooks/useMultisig';
import { useTransactionModalFlow } from '../../hooks/useTransactionModalFlow';
import { TIMING } from '../../config/contracts';

interface EnableModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  moduleAddress: string;
  moduleName: string;
}

export function EnableModuleModal({
  isOpen,
  onClose,
  walletAddress,
  moduleAddress,
  moduleName,
}: EnableModuleModalProps) {
  const { enableModuleAsync } = useMultisig(walletAddress);
  const { resetKey, showFlow, startFlow, resetFlow } = useTransactionModalFlow({ isOpen });

  const handleEnableModule = async (onProgress: (progress: any) => void) => {
    onProgress({ step: 'signing', message: 'Please approve the enable module transaction in your wallet' });

    const txHash = await enableModuleAsync({ walletAddress, moduleAddress });

    onProgress({ step: 'waiting', txHash: txHash || '', message: 'Waiting for transaction confirmation...' });

    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));

    return txHash || '';
  };

  const handleComplete = () => {
    resetFlow();
    onClose();
  };

  const handleCancel = () => {
    resetFlow();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title={`Enable ${moduleName}`}
      size="md"
    >
      {!showFlow ? (
        <div className="space-y-6">
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 border border-dark-300 dark:border-dark-600">
            <p className="text-lg text-dark-500 dark:text-dark-600 dark:text-dark-300 mb-1">
              Enable the <strong className="text-primary-600 dark:text-primary-400">{moduleName}</strong> module for this vault.
            </p>
            <p className="text-base font-mono text-dark-500 dark:text-dark-600 uppercase tracking-wider mt-2">
              This requires multisig approval
            </p>
          </div>
          
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 border border-dark-300 dark:border-dark-600">
            <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-2">Module Address</p>
            <p className="text-base font-mono text-primary-600 dark:text-primary-300 break-all">{moduleAddress}</p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-md p-4 border border-yellow-300 dark:border-yellow-700/30">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-base font-semibold text-yellow-800 dark:text-yellow-300 mb-1">Important</p>
                <p className="text-base text-yellow-700 dark:text-yellow-200">
                  Enabling a module grants it permission to execute transactions on behalf of this vault.
                  Only enable modules from trusted sources.
                </p>
              </div>
            </div>
          </div>

          <div className="vault-divider pt-6">
            <div className="flex gap-4 justify-end">
              <button onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
              <button onClick={startFlow} className="btn-primary">
                Propose Enable Module
              </button>
            </div>
          </div>
        </div>
      ) : (
        <TransactionFlow
          title={`Enable ${moduleName}`}
          description={`Enabling ${moduleName} module`}
          onExecute={handleEnableModule}
          onComplete={handleComplete}
          onCancel={handleCancel}
          successMessage={`Enable ${moduleName} transaction proposed successfully!`}
          resetKey={resetKey}
        />
      )}
    </Modal>
  );
}
