import { useState } from 'react';
import { TransactionFlow, type TransactionProgress } from '../TransactionFlow';
import { TransactionFlowOverlay } from '../TransactionFlowOverlay';
import { ConfirmDialog } from '../ConfirmDialog';
import { useMultisig } from '../../hooks/useMultisig';
import { useTransactionModalFlow } from '../../hooks/useTransactionModalFlow';
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
  const [showConfirm, setShowConfirm] = useState(true);
  const { resetKey, showFlow, startFlow, resetFlow } = useTransactionModalFlow({
    isOpen,
    onBeforeClose: () => setShowConfirm(true),
  });

  const handleDisableModule = async (onProgress: (progress: TransactionProgress) => void) => {
    onProgress({ step: 'signing', message: 'Please approve the disable module transaction in your wallet' });
    
    const txHash = await disableModuleAsync({ walletAddress, moduleAddress });
    
    onProgress({ step: 'waiting', txHash: txHash || '', message: 'Waiting for transaction confirmation...' });
    
    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));
    
    return txHash || '';
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    startFlow();
  };

  const handleComplete = () => {
    resetFlow();
    setShowConfirm(true);
    onClose();
  };

  const handleCancel = () => {
    resetFlow();
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
      message={`Are you sure you want to disable ${moduleName} at ${moduleAddress}? This will revoke that exact address's ability to execute transactions. Any pending module activity must be handled separately. This action requires multisig approval.`}
      confirmText="Disable Module"
      cancelText="Keep Module"
      variant="warning"
    />
  );
}
