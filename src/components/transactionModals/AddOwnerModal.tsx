import { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { TransactionFlow } from '../TransactionFlow';
import { useMultisig } from '../../hooks/useMultisig';
import { TIMING } from '../../config/contracts';
import { isQuaiAddress } from 'quais';

interface AddOwnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  threshold: number;
  existingOwners: string[];
}

export function AddOwnerModal({
  isOpen,
  onClose,
  walletAddress,
  threshold,
  existingOwners,
}: AddOwnerModalProps) {
  const { addOwnerAsync } = useMultisig(walletAddress);
  const [newOwnerAddress, setNewOwnerAddress] = useState('');
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
      setNewOwnerAddress('');
      setErrors([]);
    }
  }, [isOpen]);

  const validateOwnerAddress = (address: string): string[] => {
    const newErrors: string[] = [];
    const normalized = address.trim();

    if (!normalized) {
      newErrors.push('Address is required');
      setErrors(newErrors);
      return newErrors;
    }

    if (normalized.length !== 42) {
      newErrors.push(`Invalid address length: expected exactly 42 characters, got ${normalized.length}`);
      setErrors(newErrors);
      return newErrors;
    }

    if (!normalized.startsWith('0x')) {
      newErrors.push('Address must start with 0x');
    } else if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
      newErrors.push('Invalid address format: must be 0x followed by exactly 40 hexadecimal characters');
    } else {
      try {
        if (!isQuaiAddress(normalized)) {
          newErrors.push('Invalid Quai address format');
        } else if (existingOwners.some(o => o.toLowerCase() === normalized.toLowerCase())) {
          newErrors.push('Address is already an owner');
        }
      } catch (error) {
        newErrors.push(`Invalid address: ${error instanceof Error ? error.message : 'Address validation failed'}`);
      }
    }

    setErrors(newErrors);
    return newErrors;
  };

  const handleAddOwner = async (onProgress: (progress: any) => void) => {
    const normalized = newOwnerAddress.trim();
    const validationErrors = validateOwnerAddress(normalized);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    onProgress({ step: 'signing', message: 'Please approve the add owner transaction in your wallet' });
    
    const txHash = await addOwnerAsync({ walletAddress, newOwner: normalized });
    
    onProgress({ step: 'waiting', txHash: txHash || '', message: 'Waiting for transaction confirmation...' });
    
    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));
    
    return txHash || '';
  };

  const handleStart = () => {
    if (validateOwnerAddress(newOwnerAddress)) {
      setShowFlow(true);
    }
  };

  const handleComplete = () => {
    setShowFlow(false);
    setNewOwnerAddress('');
    setErrors([]);
    onClose();
  };

  const handleCancel = () => {
    setShowFlow(false);
    setNewOwnerAddress('');
    setErrors([]);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title="Add Owner"
      size="md"
    >
      {!showFlow ? (
        <div className="space-y-6">
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 border border-dark-200 dark:border-dark-600">
            <p className="text-lg text-dark-700 dark:text-dark-300 mb-1">
              Add a new owner to this QuaiVault.
            </p>
            <p className="text-base font-mono text-dark-400 dark:text-dark-600 uppercase tracking-wider">
              Requires {threshold} approval{threshold !== 1 ? 's' : ''} from existing owners
            </p>
          </div>

          <div>
            <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
              Owner Address
            </label>
            <input
              type="text"
              value={newOwnerAddress}
              onChange={(e) => {
                setNewOwnerAddress(e.target.value);
                setErrors([]);
              }}
              placeholder="0x..."
              className="input-field w-full"
            />
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
                Propose Add Owner
              </button>
            </div>
          </div>
        </div>
      ) : (
        <TransactionFlow
          title="Add Owner"
          description={`Adding owner ${newOwnerAddress.substring(0, 10)}...`}
          onExecute={handleAddOwner}
          onComplete={handleComplete}
          onCancel={handleCancel}
          successMessage="Add owner transaction proposed successfully!"
          resetKey={resetKey}
        />
      )}
    </Modal>
  );
}
