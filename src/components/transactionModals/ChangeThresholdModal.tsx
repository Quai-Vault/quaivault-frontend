import { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { TransactionFlow } from '../TransactionFlow';
import { useMultisig } from '../../hooks/useMultisig';
import { TIMING } from '../../config/contracts';

interface ChangeThresholdModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  currentThreshold: number;
  ownerCount: number;
}

export function ChangeThresholdModal({
  isOpen,
  onClose,
  walletAddress,
  currentThreshold,
  ownerCount,
}: ChangeThresholdModalProps) {
  const { changeThresholdAsync } = useMultisig(walletAddress);
  const [newThreshold, setNewThreshold] = useState(currentThreshold);
  const [errors, setErrors] = useState<string[]>([]);
  const [showFlow, setShowFlow] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Reset the flow when showFlow becomes true
  useEffect(() => {
    if (showFlow) {
      setResetKey(prev => prev + 1);
    }
  }, [showFlow]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowFlow(false);
      setNewThreshold(currentThreshold);
      setErrors([]);
    }
  }, [isOpen, currentThreshold]);

  const validateThreshold = (thresh: number): boolean => {
    const newErrors: string[] = [];

    if (thresh < 1) {
      newErrors.push('Threshold must be at least 1');
    } else if (thresh > ownerCount) {
      newErrors.push(`Threshold cannot exceed number of owners (${ownerCount})`);
    } else if (thresh === currentThreshold) {
      newErrors.push('Threshold is already set to this value');
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleChangeThreshold = async (onProgress: (progress: any) => void) => {
    if (!validateThreshold(newThreshold)) {
      throw new Error(errors.join(', '));
    }

    onProgress({ step: 'signing', message: 'Please approve the change threshold transaction in your wallet' });
    
    const txHash = await changeThresholdAsync({ walletAddress, newThreshold });
    
    onProgress({ step: 'waiting', txHash: txHash || '', message: 'Waiting for transaction confirmation...' });
    
    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));
    
    return txHash || '';
  };

  const handleStart = () => {
    if (validateThreshold(newThreshold)) {
      setShowFlow(true);
    }
  };

  const handleComplete = () => {
    setShowFlow(false);
    setNewThreshold(currentThreshold);
    setErrors([]);
    onClose();
  };

  const handleCancel = () => {
    setShowFlow(false);
    setNewThreshold(currentThreshold);
    setErrors([]);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title="Change Threshold"
      size="md"
    >
      {!showFlow ? (
        <div className="space-y-6">
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 border border-dark-200 dark:border-dark-600">
            <p className="text-lg text-dark-700 dark:text-dark-300 mb-1">
              Change the number of approvals required to execute transactions.
            </p>
            <p className="text-base font-mono text-dark-400 dark:text-dark-600 uppercase tracking-wider">
              Requires {currentThreshold} approval{currentThreshold !== 1 ? 's' : ''} from existing owners
            </p>
          </div>

          <div>
            <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
              New Threshold
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min={1}
                max={ownerCount}
                value={newThreshold}
                onChange={(e) => {
                  setNewThreshold(parseInt(e.target.value) || 1);
                  setErrors([]);
                }}
                className="input-field w-24"
              />
              <span className="text-lg text-dark-600 dark:text-dark-400 font-mono">
                of {ownerCount} owner{ownerCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="mt-3 bg-dark-100 dark:bg-vault-dark-3 rounded-md p-4 border border-dark-200 dark:border-dark-600">
              <div className="flex items-center justify-between text-lg">
                <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Current:</span>
                <span className="text-primary-600 dark:text-primary-400 font-semibold">{currentThreshold}</span>
              </div>
              <div className="flex items-center justify-between text-lg mt-2">
                <span className="text-base font-mono text-dark-500 uppercase tracking-wider">New:</span>
                <span className="text-dark-800 dark:text-dark-200 font-semibold">{newThreshold}</span>
              </div>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 dark:bg-gradient-to-r dark:from-primary-900/90 dark:via-primary-800/90 dark:to-primary-900/90 border-l-4 border-primary-600 rounded-md p-4 dark:shadow-red-glow">
              <div className="flex items-start gap-4">
                <svg className="w-5 h-5 text-primary-600 dark:text-primary-300 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <ul className="text-lg text-primary-700 dark:text-primary-200 space-y-1 flex-1">
                  {errors.map((error, index) => (
                    <li key={index} className="font-medium">• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="vault-divider pt-6">
            <div className="flex gap-4 justify-end">
              <button onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleStart} className="btn-primary">
                Propose Change Threshold
              </button>
            </div>
          </div>
        </div>
      ) : (
        <TransactionFlow
          title="Change Threshold"
          description={`Changing threshold from ${currentThreshold} to ${newThreshold}...`}
          onExecute={handleChangeThreshold}
          onComplete={handleComplete}
          onCancel={handleCancel}
          successMessage="Change threshold transaction proposed successfully!"
          resetKey={resetKey}
        />
      )}
    </Modal>
  );
}
