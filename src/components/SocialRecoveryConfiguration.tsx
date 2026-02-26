import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePageVisibility } from '../hooks/usePageVisibility';
import { multisigService } from '../services/MultisigService';
import { notificationManager } from './NotificationContainer';
import { Modal } from './Modal';
import { CollapsibleNotice } from './CollapsibleNotice';
import { SocialRecoveryManagement } from './SocialRecoveryManagement';
import { isQuaiAddress, getAddress } from 'quais';

interface SocialRecoveryConfigurationProps {
  walletAddress: string;
  onUpdate: () => void;
}

export function SocialRecoveryConfiguration({ walletAddress, onUpdate }: SocialRecoveryConfigurationProps) {
  const queryClient = useQueryClient();
  const isPageVisible = usePageVisibility();
  const [guardianInputs, setGuardianInputs] = useState<{ id: string; value: string }[]>([
    { id: crypto.randomUUID(), value: '' },
  ]);
  const guardians = guardianInputs.map(g => g.value);
  const [threshold, setThreshold] = useState<number>(1);
  const [recoveryPeriodDays, setRecoveryPeriodDays] = useState<number>(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [showRecoveryManagement, setShowRecoveryManagement] = useState(false);

  // Query recovery configuration
  const { data: recoveryConfig, isLoading, refetch } = useQuery({
    queryKey: ['recoveryConfig', walletAddress],
    queryFn: async () => {
      return await multisigService.getRecoveryConfig(walletAddress);
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 30000 : false,
  });

  // Query pending recoveries to prevent config updates during active recoveries
  const { data: pendingRecoveries } = useQuery({
    queryKey: ['pendingRecoveries', walletAddress],
    queryFn: async () => {
      return await multisigService.getPendingRecoveries(walletAddress);
    },
    enabled: !!walletAddress && !!recoveryConfig && recoveryConfig.guardians.length > 0,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 30000 : false,
  });


  // Initialize form with existing configuration
  useEffect(() => {
    if (recoveryConfig && recoveryConfig.guardians.length > 0) {
      setGuardianInputs(recoveryConfig.guardians.map(g => ({ id: crypto.randomUUID(), value: g })));
      setThreshold(Number(recoveryConfig.threshold));
      setRecoveryPeriodDays(Number(recoveryConfig.recoveryPeriod) / 86400);
    } else if (recoveryConfig && recoveryConfig.guardians.length === 0) {
      // Reset form when config is cleared
      setGuardianInputs([{ id: crypto.randomUUID(), value: '' }]);
      setThreshold(1);
      setRecoveryPeriodDays(1);
    }
  }, [recoveryConfig]);

  // Propose setup recovery mutation (now creates a multisig proposal)
  const proposeSetupRecovery = useMutation({
    mutationFn: async ({ guardians, threshold, recoveryPeriodDays }: { guardians: string[]; threshold: number; recoveryPeriodDays: number }) => {
      return await multisigService.proposeSetupRecovery(walletAddress, guardians, threshold, recoveryPeriodDays);
    },
    onSuccess: (txHash) => {
      const shortHash = `${txHash.slice(0, 10)}...${txHash.slice(-8)}`;
      notificationManager.add({
        message: `Proposal created to update recovery configuration. Requires multisig approval.`,
        type: 'success',
      });

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Recovery Configuration Proposal Created', {
          body: `Proposal ${shortHash} requires multisig approval`,
          icon: '/vite.svg',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['pendingTransactions'] });
      setErrors([]);
      onUpdate();
    },
    onError: (error) => {
      setErrors([error instanceof Error ? error.message : 'Failed to create proposal']);
    },
  });

  const updateGuardian = (index: number, value: string) => {
    const newInputs = [...guardianInputs];
    newInputs[index] = { ...newInputs[index], value };
    setGuardianInputs(newInputs);
    setErrors([]);
  };

  const addGuardian = () => {
    setGuardianInputs([...guardianInputs, { id: crypto.randomUUID(), value: '' }]);
  };

  const removeGuardian = (index: number) => {
    const newInputs = guardianInputs.filter((_, i) => i !== index);
    setGuardianInputs(newInputs);
    if (threshold > newInputs.length) {
      setThreshold(newInputs.length);
    }
    setErrors([]);
  };

  const validateForm = (): boolean => {
    const newErrors: string[] = [];

    // Filter out empty addresses
    const validGuardians = guardians.filter(g => g.trim() !== '');

    if (validGuardians.length === 0) {
      newErrors.push('At least one guardian is required');
    }

    // Validate addresses
    for (const guardian of validGuardians) {
      if (!isQuaiAddress(guardian.trim())) {
        newErrors.push(`Invalid guardian address: ${guardian.substring(0, 10)}...`);
      }
    }

    // Check for duplicates
    const normalizedGuardians = validGuardians.map(g => getAddress(g.trim()).toLowerCase());
    const uniqueGuardians = new Set(normalizedGuardians);
    if (uniqueGuardians.size !== normalizedGuardians.length) {
      newErrors.push('Duplicate guardian addresses found');
    }

    // Validate threshold
    if (threshold < 1) {
      newErrors.push('Threshold must be at least 1');
    }
    if (threshold > validGuardians.length) {
      newErrors.push(`Threshold cannot exceed number of guardians (${validGuardians.length})`);
    }

    // Validate recovery period
    if (recoveryPeriodDays < 1) {
      newErrors.push('Recovery period must be at least 1 day');
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSetup = async () => {
    if (!validateForm()) {
      return;
    }

    const validGuardians = guardians.filter(g => g.trim() !== '');
    proposeSetupRecovery.mutate({ guardians: validGuardians, threshold, recoveryPeriodDays });
  };

  const formatRecoveryPeriod = (seconds: bigint): string => {
    const days = Number(seconds) / 86400;
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  return (
    <Modal
      isOpen={true}
      onClose={onUpdate}
      title="Social Recovery Configuration"
      size="lg"
    >
      <div className="space-y-6">
        {/* Collapsible Notices */}
        <div className="space-y-2">
          <CollapsibleNotice title="Multisig Approval Required" variant="success">
            <p>
              Changes to the recovery configuration require multisig approval. When you setup or update guardians, a proposal will be created that other owners must approve before it takes effect.
            </p>
          </CollapsibleNotice>

          <CollapsibleNotice title="How Social Recovery Works" variant="info">
            <p className="mb-2">
              Guardians can initiate a recovery process to change the wallet's owners and threshold. After the recovery period elapses and enough guardians approve, the recovery can be executed.
            </p>
            <p>
              <strong>Important:</strong> Only configure trusted addresses as guardians. Guardians have significant power and can recover your wallet if enough of them agree.
            </p>
          </CollapsibleNotice>
        </div>

        {/* Current Configuration */}
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-2 text-sm text-dark-400 dark:text-dark-500">Loading...</p>
          </div>
        ) : recoveryConfig && recoveryConfig.guardians && recoveryConfig.guardians.length > 0 ? (
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600">
            <h3 className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-4">Current Configuration</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider">Guardians:</span>
                <span className="text-dark-700 dark:text-dark-200 font-semibold">{recoveryConfig.guardians.length}</span>
              </div>
              <div className="space-y-2">
                {recoveryConfig.guardians.map((guardian, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-dark-50 dark:bg-vault-dark-3 rounded border border-dark-300 dark:border-dark-600">
                    <span className="text-sm font-mono text-primary-600 dark:text-primary-300 truncate flex-1">{guardian}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-dark-300 dark:border-dark-600">
                <span className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider">Threshold:</span>
                <span className="text-dark-700 dark:text-dark-200 font-semibold">{recoveryConfig.threshold.toString()} of {recoveryConfig.guardians.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider">Recovery Period:</span>
                <span className="text-dark-700 dark:text-dark-200 font-semibold">{formatRecoveryPeriod(recoveryConfig.recoveryPeriod)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600">
            <p className="text-base text-dark-400 dark:text-dark-400 text-center">No recovery configuration set</p>
          </div>
        )}

        {/* Setup/Update Configuration */}
        <div>
          <h3 className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-4">
            {recoveryConfig && recoveryConfig.guardians.length > 0 ? 'Propose Configuration Update' : 'Propose Setup Recovery'}
          </h3>
          {pendingRecoveries && pendingRecoveries.length > 0 && (
            <div className="mb-4 bg-yellow-50 dark:bg-gradient-to-r dark:from-yellow-900/90 dark:via-yellow-800/90 dark:to-yellow-900/90 border-l-4 border-yellow-500 dark:border-yellow-600 rounded-md p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold mb-1">
                    Configuration Update Blocked
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-200/90">
                    You cannot update the recovery configuration while {pendingRecoveries.length} recovery/recoveries are pending. This prevents manipulation attacks. Please cancel or execute pending recoveries first.
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-4">
            {/* Guardians */}
            <div>
              <label className="block text-sm font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-2">
                Guardians
              </label>
              <div className="space-y-2">
                {guardianInputs.map((guardian, index) => (
                  <div key={guardian.id} className="flex gap-2">
                    <input
                      type="text"
                      value={guardian.value}
                      onChange={(e) => updateGuardian(index, e.target.value)}
                      placeholder="0x..."
                      className="input-field flex-1"
                    />
                    {guardianInputs.length > 1 && (
                      <button
                        onClick={() => removeGuardian(index)}
                        className="btn-secondary px-3 py-2"
                        type="button"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addGuardian}
                  className="btn-secondary text-sm px-3 py-1.5 inline-flex items-center gap-2"
                  type="button"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Guardian
                </button>
              </div>
            </div>

            {/* Threshold */}
            <div>
              <label className="block text-sm font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-2">
                Threshold (required approvals)
              </label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1;
                  setThreshold(Math.max(1, Math.min(value, guardians.filter(g => g.trim() !== '').length || 1)));
                }}
                min={1}
                max={guardians.filter(g => g.trim() !== '').length || 1}
                className="input-field w-full"
              />
              <p className="mt-2 text-sm font-mono text-dark-500 dark:text-dark-600">
                {guardians.filter(g => g.trim() !== '').length > 0
                  ? `Requires ${threshold} of ${guardians.filter(g => g.trim() !== '').length} guardian approvals`
                  : 'Add guardians first'}
              </p>
            </div>

            {/* Recovery Period */}
            <div>
              <label className="block text-sm font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-2">
                Recovery Period (days)
              </label>
              <input
                type="number"
                value={recoveryPeriodDays}
                onChange={(e) => setRecoveryPeriodDays(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                className="input-field w-full"
              />
              <p className="mt-2 text-sm font-mono text-dark-500 dark:text-dark-600">
                Minimum delay before recovery can be executed (minimum 1 day)
              </p>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="bg-gradient-to-r from-primary-900/90 via-primary-800/90 to-primary-900/90 border-l-4 border-primary-600 rounded-md p-3 shadow-red-glow">
                <ul className="text-sm text-primary-200 space-y-1">
                  {errors.map((error, index) => (
                    <li key={index} className="font-medium">{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSetup}
              disabled={proposeSetupRecovery.isPending || (pendingRecoveries && pendingRecoveries.length > 0)}
              className="btn-primary w-full text-base px-4 py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {proposeSetupRecovery.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  Creating Proposal...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {recoveryConfig && recoveryConfig.guardians.length > 0 ? 'Propose Update' : 'Propose Setup'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Recovery Management Button */}
        {recoveryConfig && recoveryConfig.guardians.length > 0 && (
          <div className="border-t border-dark-200 dark:border-dark-700 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-1">Recovery Management</h3>
                <p className="text-sm text-dark-400 dark:text-dark-500">
                  Initiate, approve, or execute recovery processes
                </p>
              </div>
              <button
                onClick={() => setShowRecoveryManagement(true)}
                className="btn-primary text-base px-4 py-2.5 inline-flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Manage Recovery
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recovery Management Modal */}
      {showRecoveryManagement && (
        <SocialRecoveryManagement
          walletAddress={walletAddress}
          isOpen={showRecoveryManagement}
          onClose={() => setShowRecoveryManagement(false)}
          onUpdate={onUpdate}
        />
      )}
    </Modal>
  );
}
