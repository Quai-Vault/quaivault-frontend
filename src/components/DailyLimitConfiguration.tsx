import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePageVisibility } from '../hooks/usePageVisibility';
import { multisigService } from '../services/MultisigService';
import { transactionBuilderService } from '../services/TransactionBuilderService';
import { notificationManager } from './NotificationContainer';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { CollapsibleNotice } from './CollapsibleNotice';

interface DailyLimitConfigurationProps {
  walletAddress: string;
  onUpdate: () => void;
}

export function DailyLimitConfiguration({ walletAddress, onUpdate }: DailyLimitConfigurationProps) {
  const queryClient = useQueryClient();
  const isPageVisible = usePageVisibility();
  const [newLimit, setNewLimit] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<'reset' | 'disable' | null>(null);

  // Query daily limit configuration
  const { data: dailyLimit, isLoading, refetch } = useQuery({
    queryKey: ['dailyLimit', walletAddress],
    queryFn: async () => {
      return await multisigService.getDailyLimit(walletAddress);
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 30000 : false,
  });

  // Query remaining limit
  const { data: remainingLimit, refetch: refetchRemaining } = useQuery({
    queryKey: ['remainingLimit', walletAddress],
    queryFn: async () => {
      return await multisigService.getRemainingLimit(walletAddress);
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 30000 : false,
  });

  // Query time until reset
  const { data: timeUntilReset, refetch: refetchReset } = useQuery({
    queryKey: ['timeUntilReset', walletAddress],
    queryFn: async () => {
      return await multisigService.getTimeUntilReset(walletAddress);
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
    refetchInterval: isPageVisible ? 60000 : false,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), refetchRemaining(), refetchReset()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Propose set daily limit mutation (now creates a multisig proposal)
  const proposeSetDailyLimit = useMutation({
    mutationFn: async (limit: bigint) => {
      return await multisigService.proposeSetDailyLimit(walletAddress, limit);
    },
    onSuccess: (txHash) => {
      const shortHash = `${txHash.slice(0, 10)}...${txHash.slice(-8)}`;
      notificationManager.add({
        message: `Proposal created to update daily limit. Requires multisig approval.`,
        type: 'success',
      });

      // Browser notification
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Daily Limit Proposal Created', {
          body: `Proposal ${shortHash} requires multisig approval`,
          icon: '/vite.svg',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['pendingTransactions'] });
      setNewLimit('');
      setErrors([]);
      onUpdate();
    },
    onError: (error) => {
      setErrors([error instanceof Error ? error.message : 'Failed to create proposal']);
    },
  });

  // Propose reset daily limit mutation (now creates a multisig proposal)
  const proposeResetDailyLimit = useMutation({
    mutationFn: async () => {
      return await multisigService.proposeResetDailyLimit(walletAddress);
    },
    onSuccess: (txHash) => {
      const shortHash = `${txHash.slice(0, 10)}...${txHash.slice(-8)}`;
      notificationManager.add({
        message: `Proposal created to reset daily limit. Requires multisig approval.`,
        type: 'success',
      });

      // Browser notification
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Daily Limit Reset Proposal Created', {
          body: `Proposal ${shortHash} requires multisig approval`,
          icon: '/vite.svg',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['pendingTransactions'] });
      onUpdate();
    },
    onError: (error) => {
      setErrors([error instanceof Error ? error.message : 'Failed to create proposal']);
    },
  });

  const validateForm = (): boolean => {
    const newErrors: string[] = [];

    if (!newLimit.trim()) {
      newErrors.push('Daily limit is required (use 0 to disable)');
    } else {
      const limitValue = parseFloat(newLimit.trim());
      if (isNaN(limitValue) || limitValue < 0) {
        newErrors.push('Daily limit must be a positive number or 0 to disable');
      }
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSetLimit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      const parsedLimit = transactionBuilderService.parseValue(newLimit);
      await proposeSetDailyLimit.mutateAsync(parsedLimit);
    } catch (err: any) {
      setErrors([err.message || 'Failed to create proposal']);
    }
  };

  const handleReset = () => {
    setConfirmAction('reset');
  };

  const handleConfirmAction = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    try {
      if (action === 'reset') {
        await proposeResetDailyLimit.mutateAsync();
      } else if (action === 'disable') {
        await proposeSetDailyLimit.mutateAsync(0n);
      }
    } catch (err: any) {
      setErrors([err.message || 'Failed to create proposal']);
    }
  };

  const formatTime = (seconds: bigint): string => {
    const secs = Number(seconds);
    if (secs === 0) return 'Reset';

    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const remainingSecs = secs % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSecs}s`;
    } else {
      return `${remainingSecs}s`;
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onUpdate}
      title="Daily Limit Configuration"
      size="lg"
    >
      <div className="space-y-6">
        {/* Collapsible Notices */}
        <div className="space-y-2">
          <CollapsibleNotice title="Multisig Approval Required" variant="info">
            <p>
              Changes to the daily limit configuration require multisig approval. When you set or reset the limit, a proposal will be created that other owners must approve before it takes effect.
            </p>
          </CollapsibleNotice>

          <CollapsibleNotice title="About Daily Limits" variant="info">
            <p>
              Transactions executed via the daily limit <strong>bypass multisig approvals</strong> and execute immediately, up to the configured allowance. Use the "Propose Transaction" option on the New Transaction page if you want a transaction to go through the normal approval flow.
            </p>
          </CollapsibleNotice>
        </div>

        {/* Current Configuration */}
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-2 text-sm text-dark-400 dark:text-dark-500">Loading...</p>
          </div>
        ) : (
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider">Current Configuration</h3>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-dark-500 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-400 border border-dark-300 dark:border-dark-600 hover:border-primary-600/50 rounded transition-colors"
              >
                <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {isRefreshing ? 'Refreshing' : 'Refresh'}
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider">Daily Limit:</span>
                <span className="text-dark-700 dark:text-dark-200 font-semibold">
                  {dailyLimit && dailyLimit.limit > 0n
                    ? `${transactionBuilderService.formatValue(dailyLimit.limit)} QUAI`
                    : 'Not set'}
                </span>
              </div>
              {dailyLimit && dailyLimit.limit > 0n && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider">Spent Today:</span>
                    <span className="text-dark-700 dark:text-dark-200 font-semibold">
                      {transactionBuilderService.formatValue(dailyLimit.spent)} QUAI
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider">Remaining:</span>
                    <span className="text-primary-600 dark:text-primary-400 font-semibold">
                      {remainingLimit !== undefined
                        ? `${transactionBuilderService.formatValue(remainingLimit)} QUAI`
                        : 'Loading...'}
                    </span>
                  </div>
                  {timeUntilReset !== undefined && timeUntilReset > 0n && (
                    <div className="flex justify-between items-center">
                      <span className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider">Resets In:</span>
                      <span className="text-dark-700 dark:text-dark-200 font-semibold">
                        {formatTime(timeUntilReset)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Set New Limit */}
        <div>
          <h3 className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-4">
            {dailyLimit && dailyLimit.limit > 0n ? 'Propose Limit Update' : 'Propose Daily Limit'}
          </h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="dailyLimit" className="block text-sm font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-2">
                Daily Limit (QUAI)
              </label>
              <input
                id="dailyLimit"
                type="text"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
                placeholder={dailyLimit && dailyLimit.limit > 0n ? transactionBuilderService.formatValue(dailyLimit.limit) : "0.0"}
                className="input-field w-full"
              />
              <p className="mt-2 text-sm font-mono text-dark-500 dark:text-dark-600">
                Enter the maximum amount that can be spent per day (e.g., 10 for 10 QUAI). Set to <strong>0</strong> to disable the daily limit.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSetLimit}
                disabled={proposeSetDailyLimit.isPending}
                className="btn-primary flex-1 text-base px-4 py-2.5 inline-flex items-center justify-center gap-2"
              >
                {proposeSetDailyLimit.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    Creating Proposal...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {dailyLimit && dailyLimit.limit > 0n ? 'Propose Update' : 'Propose Limit'}
                  </>
                )}
              </button>
              {dailyLimit && dailyLimit.limit > 0n && (
                <button
                  onClick={() => setConfirmAction('disable')}
                  disabled={proposeSetDailyLimit.isPending}
                  className="btn-secondary text-base px-4 py-2.5 inline-flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Propose Disable
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Reset Limit */}
        {dailyLimit && dailyLimit.limit > 0n && dailyLimit.spent > 0n && (
          <div>
            <h3 className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-4">Propose Reset Daily Limit</h3>
            <p className="text-sm text-dark-400 dark:text-dark-500 mb-4">
              Propose resetting the spent amount to 0. The limit will automatically reset after 24 hours. This requires multisig approval.
            </p>
            <button
              onClick={handleReset}
              disabled={proposeResetDailyLimit.isPending}
              className="btn-secondary w-full text-base px-4 py-2.5 inline-flex items-center justify-center gap-2"
            >
              {proposeResetDailyLimit.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  Creating Proposal...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Propose Reset Spent Amount
                </>
              )}
            </button>
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="bg-gradient-to-r from-primary-900/90 via-primary-800/90 to-primary-900/90 border-l-4 border-primary-600 rounded-md p-4 shadow-red-glow">
            <h4 className="text-base font-semibold text-primary-200 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Error
            </h4>
            <ul className="list-disc list-inside text-sm text-primary-200 space-y-1">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmAction === 'reset'}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmAction}
        title="Reset Daily Limit"
        message="Are you sure you want to propose resetting the daily limit? This will create a proposal that requires multisig approval."
        confirmText="Propose Reset"
        cancelText="Cancel"
        variant="warning"
      />

      <ConfirmDialog
        isOpen={confirmAction === 'disable'}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmAction}
        title="Disable Daily Limit"
        message="Are you sure you want to propose disabling the daily limit? This will create a proposal that requires multisig approval."
        confirmText="Propose Disable"
        cancelText="Cancel"
        variant="danger"
      />
    </Modal>
  );
}
