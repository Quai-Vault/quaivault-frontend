import { useState, useEffect } from 'react';
import { TransactionFlow } from '../TransactionFlow';
import { TransactionFlowOverlay } from '../TransactionFlowOverlay';
import { ConfirmDialog } from '../ConfirmDialog';
import { useMultisig } from '../../hooks/useMultisig';
import { TIMING } from '../../config/contracts';
import { formatAddress } from '../../utils/formatting';

interface RemoveOwnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  ownerToRemove: string;
  threshold: number;
}

export function RemoveOwnerModal({
  isOpen,
  onClose,
  walletAddress,
  ownerToRemove,
  threshold,
}: RemoveOwnerModalProps) {
  const { removeOwnerAsync } = useMultisig(walletAddress);
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
    }
  }, [isOpen]);

  const handleRemoveOwner = async (onProgress: (progress: any) => void) => {
    onProgress({ step: 'signing', message: 'Please approve the remove owner transaction in your wallet' });
    
    const txHash = await removeOwnerAsync({ walletAddress, owner: ownerToRemove });
    
    onProgress({ step: 'waiting', txHash: txHash || '', message: 'Waiting for transaction confirmation...' });
    
    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));
    
    return txHash || '';
  };

  const handleConfirm = () => {
    setShowFlow(true);
  };

  const handleComplete = () => {
    setShowFlow(false);
    onClose();
  };

  const handleCancelFlow = () => {
    setShowFlow(false);
    onClose();
  };

  if (showFlow) {
    return (
      <TransactionFlowOverlay onClose={handleCancelFlow}>
        <TransactionFlow
          title="Remove Owner"
          description={`Removing owner ${ownerToRemove.substring(0, 10)}...`}
          onExecute={handleRemoveOwner}
          onComplete={handleComplete}
          onCancel={handleCancelFlow}
          successMessage="Remove owner transaction proposed successfully!"
          resetKey={resetKey}
        />
      </TransactionFlowOverlay>
    );
  }

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Remove Owner"
      message={`Are you sure you want to remove ${formatAddress(ownerToRemove)} as an owner? This action requires ${threshold} approval${threshold !== 1 ? 's' : ''} from existing owners and cannot be undone.`}
      confirmText="Remove Owner"
      cancelText="Keep Owner"
      variant="danger"
    />
  );
}
