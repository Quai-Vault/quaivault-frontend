import { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { TransactionFlow } from '../TransactionFlow';
import { useMultisig } from '../../hooks/useMultisig';
import { TIMING } from '../../config/contracts';
import { formatDuration } from '../../utils/formatting';
import type { DelayUnit } from '../../utils/timeConversions';

const UNIT_MULTIPLIERS: Record<DelayUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

/** Convert seconds to the best-fit unit + value. */
function secondsToUnit(seconds: number): { value: number; unit: DelayUnit } {
  if (seconds <= 0) return { value: 0, unit: 'minutes' };
  if (seconds % 86400 === 0) return { value: seconds / 86400, unit: 'days' };
  if (seconds % 3600 === 0) return { value: seconds / 3600, unit: 'hours' };
  return { value: seconds / 60, unit: 'minutes' };
}

/** Convert value + unit to seconds. Handles 0 explicitly. */
function computeDelaySeconds(value: string, unit: DelayUnit): number {
  if (!value) return 0;
  const num = Number(value);
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * UNIT_MULTIPLIERS[unit]);
}

interface ChangeTimelockModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  currentDelay: number; // seconds
}

export function ChangeTimelockModal({
  isOpen,
  onClose,
  walletAddress,
  currentDelay,
}: ChangeTimelockModalProps) {
  const { setMinExecutionDelayAsync } = useMultisig(walletAddress);

  const initial = secondsToUnit(currentDelay);
  const [delayValue, setDelayValue] = useState(String(initial.value));
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(initial.unit);
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
      const init = secondsToUnit(currentDelay);
      setDelayValue(String(init.value));
      setDelayUnit(init.unit);
      setErrors([]);
    }
  }, [isOpen, currentDelay]);

  const computedSeconds = computeDelaySeconds(delayValue, delayUnit);

  const validate = (): string[] => {
    const newErrors: string[] = [];

    if (computedSeconds === currentDelay) {
      newErrors.push('Timelock is already set to this value');
    }
    if (computedSeconds > 31536000) {
      newErrors.push('Timelock cannot exceed 365 days');
    }

    setErrors(newErrors);
    return newErrors;
  };

  const handleChangeTimelock = async (onProgress: (progress: any) => void) => {
    const errs = validate();
    if (errs.length > 0) {
      throw new Error(errs.join(', '));
    }

    onProgress({ step: 'signing', message: 'Please approve the change timelock transaction in your wallet' });

    const txHash = await setMinExecutionDelayAsync({ walletAddress, delaySeconds: computedSeconds });

    onProgress({ step: 'waiting', txHash: txHash || '', message: 'Waiting for transaction confirmation...' });

    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));

    return txHash || '';
  };

  const handleStart = () => {
    if (validate().length === 0) {
      setShowFlow(true);
    }
  };

  const handleComplete = () => {
    setShowFlow(false);
    const init = secondsToUnit(currentDelay);
    setDelayValue(String(init.value));
    setDelayUnit(init.unit);
    setErrors([]);
    onClose();
  };

  const handleCancel = () => {
    setShowFlow(false);
    const init = secondsToUnit(currentDelay);
    setDelayValue(String(init.value));
    setDelayUnit(init.unit);
    setErrors([]);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title="Change Timelock"
      size="md"
    >
      {!showFlow ? (
        <div className="space-y-6">
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 border border-dark-200 dark:border-dark-600">
            <p className="text-lg text-dark-700 dark:text-dark-300 mb-1">
              Change the minimum execution delay for all transactions.
            </p>
            <p className="text-base font-mono text-dark-400 dark:text-dark-600 uppercase tracking-wider">
              Requires owner approval to take effect
            </p>
          </div>

          <div>
            <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
              New Timelock
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step="1"
                value={delayValue}
                onChange={(e) => {
                  setDelayValue(e.target.value);
                  setErrors([]);
                }}
                placeholder="0"
                className="input-field flex-1"
              />
              <select
                value={delayUnit}
                onChange={(e) => {
                  setDelayUnit(e.target.value as DelayUnit);
                  setErrors([]);
                }}
                className="input-field w-32 cursor-pointer"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            <div className="mt-3 bg-dark-100 dark:bg-vault-dark-3 rounded-md p-4 border border-dark-200 dark:border-dark-600">
              <div className="flex items-center justify-between text-lg">
                <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Current:</span>
                <span className="text-primary-600 dark:text-primary-400 font-semibold">
                  {currentDelay > 0 ? formatDuration(currentDelay) : 'None'}
                </span>
              </div>
              <div className="flex items-center justify-between text-lg mt-2">
                <span className="text-base font-mono text-dark-500 uppercase tracking-wider">New:</span>
                <span className="text-dark-800 dark:text-dark-200 font-semibold">
                  {computedSeconds > 0 ? formatDuration(computedSeconds) : 'None'}
                </span>
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
                    <li key={index} className="font-medium">&bull; {error}</li>
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
                Propose Change Timelock
              </button>
            </div>
          </div>
        </div>
      ) : (
        <TransactionFlow
          title="Change Timelock"
          description={`Changing timelock from ${currentDelay > 0 ? formatDuration(currentDelay) : 'None'} to ${computedSeconds > 0 ? formatDuration(computedSeconds) : 'None'}...`}
          onExecute={handleChangeTimelock}
          onComplete={handleComplete}
          onCancel={handleCancel}
          successMessage="Change timelock transaction proposed successfully!"
          resetKey={resetKey}
        />
      )}
    </Modal>
  );
}
