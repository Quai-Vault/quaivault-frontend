import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { multisigService } from '../services/MultisigService';
import { notificationManager } from './NotificationContainer';
import { useWalletStore } from '../store/walletStore';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { CollapsibleNotice } from './CollapsibleNotice';
import { isAddress, formatQuai, getAddress } from 'quais';

interface SocialRecoveryManagementProps {
  walletAddress: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

// Owner input with stable ID for proper React reconciliation
interface OwnerInput {
  id: string;
  value: string;
}

// Generate unique IDs for form inputs
function generateOwnerId(): string {
  return crypto.randomUUID();
}

export function SocialRecoveryManagement({ walletAddress, isOpen, onClose, onUpdate }: SocialRecoveryManagementProps) {
  const queryClient = useQueryClient();
  const { address: connectedAddress } = useWalletStore();

  // Recovery initiation form state with stable IDs for list items
  const [showInitiateRecovery, setShowInitiateRecovery] = useState(false);
  const [ownerInputs, setOwnerInputs] = useState<OwnerInput[]>([{ id: generateOwnerId(), value: '' }]);
  const [newThreshold, setNewThreshold] = useState<number>(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmCancelHash, setConfirmCancelHash] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Helper to get owner values for API calls
  const newOwners = ownerInputs.map(o => o.value);

  // Query recovery configuration
  const { data: recoveryConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['recoveryConfig', walletAddress],
    queryFn: async () => {
      return await multisigService.getRecoveryConfig(walletAddress);
    },
    enabled: !!walletAddress && isOpen,
    refetchInterval: 30000,
  });

  // Query pending recoveries
  const { data: pendingRecoveries, isLoading: isLoadingRecoveries, refetch: refetchRecoveries } = useQuery({
    queryKey: ['pendingRecoveries', walletAddress],
    queryFn: async () => {
      return await multisigService.getPendingRecoveries(walletAddress);
    },
    enabled: !!walletAddress && !!recoveryConfig && recoveryConfig.guardians.length > 0 && isOpen,
    refetchInterval: 30000,
  });

  // Query approval statuses for all recoveries
  const { data: approvalStatuses, isLoading: isLoadingApprovals, refetch: refetchApprovalStatuses } = useQuery({
    queryKey: ['recoveryApprovalStatuses', walletAddress, connectedAddress, pendingRecoveries?.map(r => r.recoveryHash).join(',')],
    queryFn: async () => {
      if (!connectedAddress || !pendingRecoveries || pendingRecoveries.length === 0) {
        return new Map<string, boolean>();
      }

      const statusMap = new Map<string, boolean>();
      await Promise.all(
        pendingRecoveries.map(async (recovery) => {
          try {
            const hasApproved = await multisigService.socialRecovery.hasApprovedRecovery(
              walletAddress,
              recovery.recoveryHash,
              connectedAddress
            );
            statusMap.set(recovery.recoveryHash, hasApproved);
          } catch (error) {
            console.error(`Error checking approval status for ${recovery.recoveryHash}:`, error);
            statusMap.set(recovery.recoveryHash, false);
          }
        })
      );
      return statusMap;
    },
    enabled: !!connectedAddress && !!pendingRecoveries && pendingRecoveries.length > 0 && isOpen,
    refetchInterval: 30000,
    retry: 1,
  });

  // Check if connected address is a guardian
  const { data: isGuardian } = useQuery({
    queryKey: ['isGuardian', walletAddress, connectedAddress],
    queryFn: async () => {
      if (!connectedAddress || !walletAddress) return false;
      return await multisigService.isGuardian(walletAddress, connectedAddress);
    },
    enabled: !!walletAddress && !!connectedAddress && isOpen,
  });

  // Initiate recovery mutation
  const initiateRecovery = useMutation({
    mutationFn: async ({ newOwners, newThreshold }: { newOwners: string[]; newThreshold: number }) => {
      return await multisigService.initiateRecovery(walletAddress, newOwners, newThreshold);
    },
    onSuccess: () => {
      notificationManager.add({
        message: '✅ Recovery initiated successfully',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['recoveryApprovalStatuses'] });
      setTimeout(() => {
        refetchRecoveries();
      }, 2000);
      setShowInitiateRecovery(false);
      setOwnerInputs([{ id: generateOwnerId(), value: '' }]);
      setNewThreshold(1);
      setErrors([]);
    },
    onError: (error) => {
      setErrors([error instanceof Error ? error.message : 'Failed to initiate recovery']);
    },
  });

  // Approve recovery mutation
  const approveRecovery = useMutation({
    mutationFn: async (recoveryHash: string) => {
      return await multisigService.approveRecovery(walletAddress, recoveryHash);
    },
    onSuccess: () => {
      notificationManager.add({
        message: '✅ Recovery approved successfully',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['recoveryApprovalStatuses'] });
      // Delay refetch to allow indexer to catch up
      setTimeout(async () => {
        await refetchRecoveries();
        await refetchApprovalStatuses();
      }, 5000);
    },
    onError: (error) => {
      setErrors([error instanceof Error ? error.message : 'Failed to approve recovery']);
    },
  });

  // Execute recovery mutation
  const executeRecovery = useMutation({
    mutationFn: async (recoveryHash: string) => {
      return await multisigService.executeRecovery(walletAddress, recoveryHash);
    },
    onSuccess: () => {
      notificationManager.add({
        message: '✅ Recovery executed successfully',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['walletInfo', walletAddress] });
      // Delay refetch to allow indexer to catch up
      setTimeout(async () => {
        await refetchRecoveries();
        onUpdate?.();
      }, 5000);
    },
    onError: (error) => {
      setErrors([error instanceof Error ? error.message : 'Failed to execute recovery']);
    },
  });

  // Cancel recovery mutation
  const cancelRecovery = useMutation({
    mutationFn: async (recoveryHash: string) => {
      return await multisigService.cancelRecovery(walletAddress, recoveryHash);
    },
    onSuccess: () => {
      notificationManager.add({
        message: '✅ Recovery cancelled successfully',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      // Delay refetch to allow indexer to catch up
      setTimeout(async () => {
        await refetchRecoveries();
      }, 5000);
    },
    onError: (error) => {
      setErrors([error instanceof Error ? error.message : 'Failed to cancel recovery']);
    },
  });

  // Revoke approval mutation (guardians only)
  const revokeApproval = useMutation({
    mutationFn: async (recoveryHash: string) => {
      return await multisigService.revokeRecoveryApproval(walletAddress, recoveryHash);
    },
    onSuccess: () => {
      notificationManager.add({
        message: '✅ Approval revoked successfully',
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      queryClient.invalidateQueries({ queryKey: ['recoveryApprovalStatuses'] });
      // Delay refetch to allow indexer to catch up
      setTimeout(async () => {
        await refetchRecoveries();
        await refetchApprovalStatuses();
      }, 5000);
    },
    onError: (error) => {
      setErrors([error instanceof Error ? error.message : 'Failed to revoke approval']);
    },
  });

  const updateNewOwner = (id: string, value: string) => {
    setOwnerInputs(prev => prev.map(o => o.id === id ? { ...o, value } : o));
    setErrors([]);
  };

  const addNewOwner = () => {
    setOwnerInputs(prev => [...prev, { id: generateOwnerId(), value: '' }]);
  };

  const removeNewOwner = (id: string) => {
    setOwnerInputs(prev => {
      const updated = prev.filter(o => o.id !== id);
      if (newThreshold > updated.length) {
        setNewThreshold(Math.max(1, updated.length));
      }
      return updated;
    });
    setErrors([]);
  };

  const validateRecoveryForm = (): boolean => {
    const newErrors: string[] = [];
    const validOwners = newOwners.filter(o => o.trim() !== '');

    if (validOwners.length === 0) {
      newErrors.push('At least one new owner is required');
    }

    for (const owner of validOwners) {
      if (!isAddress(owner.trim())) {
        newErrors.push(`Invalid owner address: ${owner.substring(0, 10)}...`);
      }
    }

    const normalizedOwners = validOwners.map(o => getAddress(o.trim()).toLowerCase());
    const uniqueOwners = new Set(normalizedOwners);
    if (uniqueOwners.size !== normalizedOwners.length) {
      newErrors.push('Duplicate owner addresses found');
    }

    if (newThreshold < 1 || newThreshold > validOwners.length) {
      newErrors.push(`Threshold must be between 1 and ${validOwners.length}`);
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleInitiateRecovery = async () => {
    if (!validateRecoveryForm()) {
      return;
    }

    const validOwners = newOwners.filter(o => o.trim() !== '');
    initiateRecovery.mutate({ newOwners: validOwners, newThreshold });
  };

  const formatTimeUntilExecution = (executionTime: number): string => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (executionTime <= nowSeconds) {
      return 'Ready to execute';
    }
    const secondsRemaining = executionTime - nowSeconds;
    const days = Math.floor(secondsRemaining / 86400);
    const hours = Math.floor((secondsRemaining % 86400) / 3600);
    const minutes = Math.floor((secondsRemaining % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const handleRefreshRecoveries = useCallback(async () => {
    setIsRefreshing(true);
    try {
      queryClient.invalidateQueries({ queryKey: ['pendingRecoveries', walletAddress] });
      await refetchRecoveries();
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, walletAddress, refetchRecoveries]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Social Recovery Management"
      size="lg"
    >
      <div className="space-y-6">
        {/* Collapsible Notice */}
        <CollapsibleNotice title={isGuardian ? "Recovery Process (You are a guardian)" : "Recovery Process"} variant="info">
          <p>
            Guardians can initiate a recovery process to change the wallet's owners and threshold. After the recovery period elapses and enough guardians approve, the recovery can be executed.
          </p>
          {isGuardian && (
            <p className="mt-2 font-semibold">
              As a guardian, you can initiate or approve recoveries.
            </p>
          )}
        </CollapsibleNotice>

        {/* Current Configuration Summary */}
        {isLoadingConfig ? (
          <div className="text-center py-4">
            <div className="inline-block w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-2 text-sm text-dark-400 dark:text-dark-500">Loading configuration...</p>
          </div>
        ) : recoveryConfig && recoveryConfig.guardians.length > 0 ? (
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 border border-dark-300 dark:border-dark-600">
            <h3 className="text-sm font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-3">Current Configuration</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-dark-400 dark:text-dark-500">Guardians:</span>
                <span className="ml-2 text-dark-700 dark:text-dark-200 font-semibold">{recoveryConfig.guardians.length}</span>
              </div>
              <div>
                <span className="text-dark-400 dark:text-dark-500">Threshold:</span>
                <span className="ml-2 text-dark-700 dark:text-dark-200 font-semibold">{recoveryConfig.threshold.toString()} of {recoveryConfig.guardians.length}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 border border-dark-300 dark:border-dark-600">
            <p className="text-sm text-dark-400 dark:text-dark-400 text-center">No recovery configuration set. Please configure recovery first.</p>
          </div>
        )}

        {/* Initiate Recovery Section */}
        {recoveryConfig && recoveryConfig.guardians.length > 0 && isGuardian && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider">Initiate Recovery</h3>
              <button
                onClick={() => setShowInitiateRecovery(!showInitiateRecovery)}
                className="btn-primary text-sm px-3 py-1.5 inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {showInitiateRecovery ? 'Cancel' : 'Initiate Recovery'}
              </button>
            </div>

            {/* Initiate Recovery Form */}
            {showInitiateRecovery && (
              <div className="mb-6 p-4 bg-dark-100 dark:bg-vault-dark-4 rounded-md border border-dark-300 dark:border-dark-600">
                <h4 className="text-sm font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-3">New Recovery Configuration</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-2">
                      New Owners
                    </label>
                    <div className="space-y-2">
                      {ownerInputs.map((ownerInput) => (
                        <div key={ownerInput.id} className="flex gap-2">
                          <input
                            type="text"
                            value={ownerInput.value}
                            onChange={(e) => updateNewOwner(ownerInput.id, e.target.value)}
                            placeholder="0x..."
                            className="input-field flex-1"
                          />
                          {ownerInputs.length > 1 && (
                            <button
                              onClick={() => removeNewOwner(ownerInput.id)}
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
                        onClick={addNewOwner}
                        className="btn-secondary text-sm px-3 py-1.5 inline-flex items-center gap-2"
                        type="button"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Owner
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-2">
                      New Threshold
                    </label>
                    <input
                      type="number"
                      value={newThreshold}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 1;
                        setNewThreshold(Math.max(1, Math.min(value, newOwners.filter(o => o.trim() !== '').length || 1)));
                      }}
                      min={1}
                      max={newOwners.filter(o => o.trim() !== '').length || 1}
                      className="input-field w-full"
                    />
                  </div>
                  {errors.length > 0 && (
                    <div className="bg-gradient-to-r from-primary-900/90 via-primary-800/90 to-primary-900/90 border-l-4 border-primary-600 rounded-md p-3 shadow-red-glow">
                      <ul className="text-sm text-primary-200 space-y-1">
                        {errors.map((error, index) => (
                          <li key={index} className="font-medium">• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    onClick={handleInitiateRecovery}
                    disabled={initiateRecovery.isPending}
                    className="btn-primary w-full text-sm px-4 py-2 inline-flex items-center justify-center gap-2"
                  >
                    {initiateRecovery.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                        Initiating...
                      </>
                    ) : (
                      'Initiate Recovery'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pending Recoveries */}
        {recoveryConfig && recoveryConfig.guardians.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider">Pending Recoveries</h3>
              <button
                onClick={handleRefreshRecoveries}
                disabled={isRefreshing}
                className="btn-secondary text-xs px-2 py-1 inline-flex items-center gap-1"
                title="Refresh recoveries list"
              >
                <svg className={`w-3 h-3${isRefreshing ? ' animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
            {isLoadingRecoveries ? (
              <div className="text-center py-4">
                <div className="inline-block w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-2 text-sm text-dark-400 dark:text-dark-500">Loading recoveries...</p>
              </div>
            ) : pendingRecoveries && pendingRecoveries.length > 0 ? (
              <div className="space-y-3">
                {pendingRecoveries.map((recovery) => {
                  const nowSeconds = Math.floor(Date.now() / 1000);
                  const canExecute = recovery.executionTime <= nowSeconds && recovery.approvalCount >= recoveryConfig.threshold;
                  const requiredApprovals = recoveryConfig.threshold;
                  const currentApprovals = recovery.approvalCount;
                  const hasApproved = approvalStatuses?.get(recovery.recoveryHash) === true;
                  
                  return (
                    <div key={recovery.recoveryHash} className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 border border-dark-300 dark:border-dark-600">
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-mono text-dark-400 dark:text-dark-500 uppercase tracking-wider">Recovery Hash:</span>
                            <span className="text-xs font-mono text-primary-600 dark:text-primary-300">{recovery.recoveryHash.slice(0, 10)}...{recovery.recoveryHash.slice(-8)}</span>
                          </div>
                          <div className="text-sm text-dark-400 dark:text-dark-400 mb-2">
                            <div className="mb-1">
                              <strong>New Owners:</strong> {recovery.newOwners.length}
                            </div>
                            <div className="mb-1">
                              <strong>New Threshold:</strong> {recovery.newThreshold.toString()}
                            </div>
                            <div>
                              <strong>Approvals:</strong> {currentApprovals} / {requiredApprovals}
                            </div>
                            <div>
                              <strong>Execution Time:</strong> {formatTimeUntilExecution(recovery.executionTime)}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {isGuardian && !hasApproved && currentApprovals < requiredApprovals && (
                            <button
                              onClick={() => approveRecovery.mutate(recovery.recoveryHash)}
                              disabled={approveRecovery.isPending || isLoadingApprovals}
                              className="btn-primary text-sm px-3 py-1.5 inline-flex items-center gap-2"
                              title={isLoadingApprovals ? 'Checking approval status...' : ''}
                            >
                              {approveRecovery.isPending ? (
                                <>
                                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                  Approving...
                                </>
                              ) : (
                                'Approve'
                              )}
                            </button>
                          )}
                          {isGuardian && hasApproved && (
                            <button
                              onClick={() => revokeApproval.mutate(recovery.recoveryHash)}
                              disabled={revokeApproval.isPending}
                              className="btn-secondary text-sm px-3 py-1.5 inline-flex items-center gap-2"
                              title="Revoke your approval for this recovery"
                            >
                              {revokeApproval.isPending ? (
                                <>
                                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                  Revoking...
                                </>
                              ) : (
                                <>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  Revoke Approval
                                </>
                              )}
                            </button>
                          )}
                          {canExecute && (
                            <button
                              onClick={() => executeRecovery.mutate(recovery.recoveryHash)}
                              disabled={executeRecovery.isPending}
                              className="btn-primary text-sm px-3 py-1.5 inline-flex items-center gap-2"
                            >
                              {executeRecovery.isPending ? (
                                <>
                                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                  Executing...
                                </>
                              ) : (
                                'Execute Recovery'
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmCancelHash(recovery.recoveryHash)}
                            disabled={cancelRecovery.isPending}
                            className="btn-secondary text-sm px-3 py-1.5 inline-flex items-center gap-2"
                          >
                            {cancelRecovery.isPending && cancelRecovery.variables === recovery.recoveryHash ? (
                              <>
                                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                Cancelling...
                              </>
                            ) : (
                              'Cancel'
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 border border-dark-300 dark:border-dark-600">
                <p className="text-sm text-dark-400 dark:text-dark-400 text-center">No pending recoveries</p>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmCancelHash}
        onClose={() => setConfirmCancelHash(null)}
        onConfirm={() => {
          if (confirmCancelHash) {
            cancelRecovery.mutate(confirmCancelHash);
            setConfirmCancelHash(null);
          }
        }}
        title="Cancel Recovery"
        message="Are you sure you want to cancel this recovery? This action cannot be undone."
        confirmText="Cancel Recovery"
        cancelText="Keep Recovery"
        variant="danger"
      />
    </Modal>
  );
}
