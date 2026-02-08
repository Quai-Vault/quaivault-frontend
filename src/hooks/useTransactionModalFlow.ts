import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Common timing constants for transaction modals
 */
export const MODAL_TIMING = {
  /** Delay after transaction confirmation before auto-close */
  CONFIRMATION_DELAY_MS: 3000,
  /** Copy feedback display duration */
  COPY_FEEDBACK_MS: 2000,
} as const;

interface UseTransactionModalFlowOptions {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Optional callback when the modal is about to close */
  onBeforeClose?: () => void;
}

interface UseTransactionModalFlowReturn {
  /** Key to pass to TransactionFlow for resetting state */
  resetKey: number;
  /** Whether the transaction flow UI should be shown */
  showFlow: boolean;
  /** Start showing the transaction flow */
  startFlow: () => void;
  /** Reset the flow state (usually called when modal closes) */
  resetFlow: () => void;
}

/**
 * Custom hook for managing transaction modal flow state
 *
 * This hook encapsulates the common pattern of:
 * - Tracking a reset key to force TransactionFlow re-renders
 * - Managing showFlow state for modals that have a confirmation step before the flow
 * - Auto-resetting when modal opens/closes
 *
 * @example
 * ```tsx
 * function MyTransactionModal({ isOpen, onClose }) {
 *   const { resetKey, showFlow, startFlow, resetFlow } = useTransactionModalFlow({ isOpen });
 *
 *   return (
 *     <Modal isOpen={isOpen} onClose={onClose}>
 *       {!showFlow ? (
 *         <ConfirmationStep onConfirm={startFlow} />
 *       ) : (
 *         <TransactionFlow resetKey={resetKey} ... />
 *       )}
 *     </Modal>
 *   );
 * }
 * ```
 */
export function useTransactionModalFlow({
  isOpen,
  onBeforeClose,
}: UseTransactionModalFlowOptions): UseTransactionModalFlowReturn {
  const [resetKey, setResetKey] = useState(0);
  const [showFlow, setShowFlow] = useState(false);
  const onBeforeCloseRef = useRef(onBeforeClose);
  useEffect(() => { onBeforeCloseRef.current = onBeforeClose; }, [onBeforeClose]);
  const hasBeenOpen = useRef(false);

  // Reset flow state when modal closes
  useEffect(() => {
    if (isOpen) {
      hasBeenOpen.current = true;
    } else if (hasBeenOpen.current) {
      setShowFlow(false);
      onBeforeCloseRef.current?.();
    }
  }, [isOpen]);

  // Increment reset key when modal opens (to reset TransactionFlow)
  useEffect(() => {
    if (isOpen && showFlow) {
      setResetKey(prev => prev + 1);
    }
  }, [isOpen, showFlow]);

  const startFlow = useCallback(() => {
    setShowFlow(true);
    setResetKey(prev => prev + 1);
  }, []);

  const resetFlow = useCallback(() => {
    setShowFlow(false);
  }, []);

  return {
    resetKey,
    showFlow,
    startFlow,
    resetFlow,
  };
}

/**
 * Simpler version for modals that immediately show the transaction flow
 * (no confirmation step)
 *
 * @example
 * ```tsx
 * function ApproveModal({ isOpen, onClose }) {
 *   const resetKey = useSimpleTransactionModalFlow(isOpen);
 *
 *   return (
 *     <Modal isOpen={isOpen} onClose={onClose}>
 *       <TransactionFlow resetKey={resetKey} ... />
 *     </Modal>
 *   );
 * }
 * ```
 */
export function useSimpleTransactionModalFlow(isOpen: boolean): number {
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setResetKey(prev => prev + 1);
    }
  }, [isOpen]);

  return resetKey;
}
