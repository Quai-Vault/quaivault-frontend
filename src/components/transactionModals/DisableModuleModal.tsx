import { useState, useEffect } from 'react';
import { TransactionFlow } from '../TransactionFlow';
import { TransactionFlowOverlay } from '../TransactionFlowOverlay';
import { ConfirmDialog } from '../ConfirmDialog';
import { useMultisig } from '../../hooks/useMultisig';
import { TIMING } from '../../config/contracts';

interface DisableModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  moduleAddress: string;
  moduleName: string;
}

export function DisableModuleModal({
  isOpen,
  onClose,
  walletAddress,
  moduleAddress,
  moduleName,
}: DisableModuleModalProps) {
  const { disableModuleAsync } = useMultisig(walletAddress);
  const [showFlow, setShowFlow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(true);
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
      setShowConfirm(true);
    }
  }, [isOpen]);

  const handleDisableModule = async (onProgress: (progress: any) => void) => {
    onProgress({ step: 'signing', message: 'Please approve the disable module transaction in your wallet' });
    
    const txHash = await disableModuleAsync({ walletAddress, moduleAddress });
    
    onProgress({ step: 'waiting', txHash: txHash || '', message: 'Waiting for transaction confirmation...' });
    
    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));
    
    return txHash || '';
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    setShowFlow(true);
  };

  const handleComplete = () => {
    setShowFlow(false);
    setShowConfirm(true);
    onClose();
  };

  const handleCancel = () => {
    setShowFlow(false);
    setShowConfirm(true);
    onClose();
  };

  if (showFlow) {
    return (
      <TransactionFlowOverlay onClose={handleCancel}>
        <TransactionFlow
          title={`Disable ${moduleName}`}
          description={`Disabling ${moduleName} module`}
          onExecute={handleDisableModule}
          onComplete={handleComplete}
          onCancel={handleCancel}
          successMessage={`Disable ${moduleName} transaction proposed successfully!`}
          resetKey={resetKey}
        />
      </TransactionFlowOverlay>
    );
  }

  return (
    <ConfirmDialog
      isOpen={isOpen && showConfirm}
      onClose={handleCancel}
      onConfirm={handleConfirm}
      title={`Disable ${moduleName}`}
      message={`Are you sure you want to disable the ${moduleName} module? This will revoke its ability to execute transactions. Any pending transactions from this module will need to be handled separately. This action requires multisig approval.`}
      confirmText="Disable Module"
      cancelText="Keep Module"
      variant="warning"
    />
  );
}
