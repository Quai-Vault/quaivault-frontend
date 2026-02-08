import { useState, useEffect, useRef } from 'react';
import { parseError } from '../utils/errorMessages';
import { TIMING } from '../config/contracts';

export type TransactionStep = 
  | 'preparing'
  | 'signing'
  | 'waiting'
  | 'success'
  | 'error';

export interface TransactionProgress {
  step: TransactionStep;
  txHash?: string;
  error?: string;
  message?: string;
}

interface TransactionFlowProps {
  title: string;
  description: string;
  onExecute: (onProgress: (progress: TransactionProgress) => void) => Promise<string>;
  onComplete: () => void;
  onCancel: () => void;
  successMessage?: string;
  resetKey?: string | number; // Key to reset the flow when it changes
}

export function TransactionFlow({
  title,
  description,
  onExecute,
  onComplete,
  onCancel,
  successMessage = 'Transaction completed successfully!',
  resetKey,
}: TransactionFlowProps) {
  const [progress, setProgress] = useState<TransactionProgress>({
    step: 'preparing',
  });
  const hasExecuted = useRef(false);
  const lastResetKey = useRef(resetKey);
  const isMountedRef = useRef(true);

  // Keep latest callback refs to avoid stale closures
  const onExecuteRef = useRef(onExecute);
  const onCompleteRef = useRef(onComplete);
  const successMessageRef = useRef(successMessage);
  useEffect(() => { onExecuteRef.current = onExecute; }, [onExecute]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { successMessageRef.current = successMessage; }, [successMessage]);

  // Track mount state to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset when resetKey changes (modal reopened)
  useEffect(() => {
    if (resetKey !== undefined && resetKey !== lastResetKey.current) {
      hasExecuted.current = false;
      lastResetKey.current = resetKey;
      setProgress({ step: 'preparing' });
    }
  }, [resetKey]);

  useEffect(() => {
    // Only execute once when component mounts or resets
    if (hasExecuted.current) {
      return;
    }

    hasExecuted.current = true;

    const execute = async () => {
      try {
        if (!isMountedRef.current) return;
        setProgress({ step: 'signing', message: 'Please approve the transaction in your wallet' });

        const txHash = await onExecuteRef.current((progressUpdate) => {
          if (isMountedRef.current) {
            setProgress(progressUpdate);
          }
        });

        if (!isMountedRef.current) return;
        setProgress({
          step: 'waiting',
          txHash,
          message: 'Waiting for transaction confirmation...',
        });

        // Wait a bit for the transaction to be mined
        await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));

        if (!isMountedRef.current) return;
        setProgress({
          step: 'success',
          txHash,
          message: successMessageRef.current,
        });

        // Auto-close after showing success
        setTimeout(() => {
          if (isMountedRef.current) {
            onCompleteRef.current();
          }
        }, TIMING.COPY_FEEDBACK);
      } catch (error) {
        console.error('Transaction error:', error);
        if (!isMountedRef.current) return;
        const errorInfo = parseError(error);
        setProgress({
          step: 'error',
          error: errorInfo.message,
        });
      }
    };

    execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  const getStepIcon = () => {
    switch (progress.step) {
      case 'preparing':
      case 'signing':
      case 'waiting':
        return (
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-primary-600/20 blur-xl animate-pulse"></div>
            <div className="relative inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
          </div>
        );
      case 'success':
        return (
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary-700 to-primary-900 border-2 border-primary-600 shadow-red-glow">
            <svg className="w-8 h-8 text-primary-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary-900 to-primary-950 border-2 border-primary-700">
            <svg className="w-8 h-8 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
    }
  };

  const getStepMessage = () => {
    if (progress.error) {
      return progress.error;
    }
    if (progress.message) {
      return progress.message;
    }
    switch (progress.step) {
      case 'preparing':
        return 'Preparing transaction...';
      case 'signing':
        return 'Waiting for your approval...';
      case 'waiting':
        return 'Waiting for transaction confirmation...';
      case 'success':
        return successMessage;
      case 'error':
        return 'Transaction failed';
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex flex-col items-center justify-center py-6">
        {getStepIcon()}
        <p className="mt-6 text-center text-dark-700 dark:text-dark-200 font-semibold text-lg">
          {getStepMessage()}
        </p>
        {progress.txHash && (
          <div className="mt-4 bg-dark-100 dark:bg-vault-dark-4 px-4 py-2 rounded-md border border-dark-300 dark:border-dark-600 max-w-full">
            <p className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1">Transaction Hash</p>
            <p className="text-lg text-primary-600 dark:text-primary-300 font-mono break-all">
              {progress.txHash}
            </p>
          </div>
        )}
      </div>

      {/* Error Details */}
      {progress.step === 'error' && progress.error && (
        <div className="bg-gradient-to-r from-red-100 via-red-50 to-red-100 dark:from-primary-900/90 dark:via-primary-800/90 dark:to-primary-900/90 border-l-4 border-primary-600 rounded-md p-4 shadow-red-glow">
          <div className="flex items-start gap-4">
            <svg className="w-5 h-5 text-primary-600 dark:text-primary-300 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-lg text-primary-700 dark:text-primary-200 font-medium">{progress.error}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="vault-divider pt-6">
        <div className="flex gap-4 justify-end">
          {progress.step === 'error' && (
            <button
              onClick={onCancel}
              className="btn-secondary"
            >
              Close
            </button>
          )}
          {progress.step === 'success' && (
            <button
              onClick={onComplete}
              className="btn-primary"
            >
              Done
            </button>
          )}
          {(progress.step === 'preparing' || progress.step === 'signing' || progress.step === 'waiting') && (
            <button
              onClick={onCancel}
              className="btn-secondary"
              disabled
            >
              Processing...
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
