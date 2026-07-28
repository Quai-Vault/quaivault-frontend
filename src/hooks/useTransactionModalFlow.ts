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

  // Increment reset key when the flow becomes visible (to reset TransactionFlow).
  // Adjusted during render rather than in an effect so the flow never renders
  // once with the previous key. See the note in useSimpleTransactionModalFlow.
  const flowVisible = isOpen && showFlow;
  const [prevFlowVisible, setPrevFlowVisible] = useState(flowVisible);
  if (flowVisible !== prevFlowVisible) {
    setPrevFlowVisible(flowVisible);
    if (flowVisible) setResetKey(prev => prev + 1);
  }

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
  // Adjusting state during render rather than in an effect: React re-renders
  // immediately without committing, so children never see the stale key.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) setResetKey(prev => prev + 1);
  }

  return resetKey;
}
