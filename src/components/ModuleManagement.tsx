import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { multisigService } from '../services/MultisigService';
import { CONTRACT_ADDRESSES } from '../config/contracts';
import { Modal } from './Modal';
import { WhitelistConfiguration } from './WhitelistConfiguration';
import { DailyLimitConfiguration } from './DailyLimitConfiguration';
import { SocialRecoveryConfiguration } from './SocialRecoveryConfiguration';
import { SocialRecoveryManagement } from './SocialRecoveryManagement';
import {
  EnableModuleModal,
  DisableModuleModal,
} from './transactionModals';

interface ModuleInfo {
  address: string;
  name: string;
  description: string;
  icon: JSX.Element;
}

const MODULES: ModuleInfo[] = [
  {
    address: CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE,
    name: 'Social Recovery',
    description: 'Recover wallet access using guardian consensus',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    address: CONTRACT_ADDRESSES.DAILY_LIMIT_MODULE,
    name: 'Daily Limit',
    description: 'Set daily spending limits for single-owner transactions',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    address: CONTRACT_ADDRESSES.WHITELIST_MODULE,
    name: 'Whitelist',
    description: 'Pre-approve addresses for quick transactions',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

interface ModuleManagementProps {
  walletAddress: string;
  onUpdate: () => void;
}

export function ModuleManagement({ walletAddress, onUpdate }: ModuleManagementProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddModule, setShowAddModule] = useState(false);
  const [showWhitelistConfig, setShowWhitelistConfig] = useState(false);
  const [showDailyLimitConfig, setShowDailyLimitConfig] = useState(false);
  const [showSocialRecoveryConfig, setShowSocialRecoveryConfig] = useState(false);
  const [showRecoveryManagement, setShowRecoveryManagement] = useState(false);
  const [moduleToEnable, setModuleToEnable] = useState<string | null>(null);
  const [moduleToDisable, setModuleToDisable] = useState<string | null>(null);

  // Query module statuses
  const { data: moduleStatuses, isLoading } = useQuery({
    queryKey: ['moduleStatus', walletAddress],
    queryFn: async () => {
      const modulesWithAddresses = MODULES.filter(m => m.address);
      const results = await Promise.all(
        modulesWithAddresses.map(async (module) => {
          try {
            return { address: module.address, enabled: await multisigService.isModuleEnabled(walletAddress, module.address) };
          } catch (error) {
            console.error(`Failed to check status for ${module.name}:`, error);
            return { address: module.address, enabled: false };
          }
        })
      );
      const statuses: Record<string, boolean> = {};
      for (const { address, enabled } of results) {
        statuses[address] = enabled;
      }
      return statuses;
    },
    enabled: !!walletAddress,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const enabledModules = MODULES.filter(
    (module) => module.address && moduleStatuses?.[module.address]
  );

  const disabledModules = MODULES.filter(
    (module) => module.address && !moduleStatuses?.[module.address]
  );

  const enabledCount = enabledModules.length;

  // Query recovery config to check if social recovery is configured
  const { data: recoveryConfig } = useQuery({
    queryKey: ['recoveryConfig', walletAddress],
    queryFn: async () => {
      return await multisigService.getRecoveryConfig(walletAddress);
    },
    enabled: !!walletAddress && moduleStatuses?.[CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE] === true,
    refetchInterval: 30000,
  });

  const isRecoveryConfigured = recoveryConfig && recoveryConfig.guardians && recoveryConfig.guardians.length > 0;

  const handleEnable = (moduleAddress: string) => {
    setModuleToEnable(moduleAddress);
    setShowAddModule(false);
  };

  const handleDisable = (moduleAddress: string) => {
    setModuleToDisable(moduleAddress);
  };

  if (isLoading) {
    return (
      <div className="vault-panel p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200">Modules</h2>
            <span className="vault-badge text-base">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vault-panel p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200">Modules</h2>
          {enabledCount > 0 && (
            <span className="vault-badge text-base">{enabledCount} Enabled</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {enabledCount > 0 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-base text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 transition-colors font-semibold flex items-center gap-2"
            >
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {isExpanded ? 'Hide' : 'Show'} Enabled
            </button>
          )}
          {disabledModules.length > 0 && (
            <button
              onClick={() => setShowAddModule(true)}
              className="btn-primary text-base px-4 py-2 inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Module
            </button>
          )}
        </div>
      </div>

      {/* Enabled Modules - Collapsible */}
      {enabledCount > 0 && (
        <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-[500px]' : 'max-h-0'}`}>
          <div className="space-y-2 pt-2">
            {enabledModules.map((module) => (
              <div
                key={module.address}
                className="flex items-center justify-between p-3 bg-primary-50 dark:bg-vault-dark-4 rounded-md border border-primary-600/50"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-primary-700 to-primary-900 border border-primary-600/50 flex items-center justify-center">
                    <div className="text-primary-200">{module.icon}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-dark-700 dark:text-dark-200">{module.name}</h3>
                      <span className="vault-badge text-sm border-primary-600/50 text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30">
                        Enabled
                      </span>
                    </div>
                    <p className="text-sm text-dark-500 truncate">{module.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {module.address === CONTRACT_ADDRESSES.WHITELIST_MODULE && (
                    <button
                      onClick={() => setShowWhitelistConfig(true)}
                      className="btn-primary text-sm px-3 py-1.5 inline-flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Configure
                    </button>
                  )}
                  {module.address === CONTRACT_ADDRESSES.DAILY_LIMIT_MODULE && (
                    <button
                      onClick={() => setShowDailyLimitConfig(true)}
                      className="btn-primary text-sm px-3 py-1.5 inline-flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Configure
                    </button>
                  )}
                  {module.address === CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE && (
                    <>
                      <button
                        onClick={() => setShowSocialRecoveryConfig(true)}
                        className="btn-primary text-sm px-3 py-1.5 inline-flex items-center gap-2"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Configure
                      </button>
                      {isRecoveryConfigured && (
                        <button
                          onClick={() => setShowRecoveryManagement(true)}
                          className="btn-primary text-sm px-3 py-1.5 inline-flex items-center gap-2"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Manage Recovery
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => handleDisable(module.address)}
                    className="btn-secondary text-sm px-3 py-1.5 inline-flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Disable
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {enabledCount === 0 && (
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-dark-100 dark:bg-vault-dark-4 border-2 border-dark-300 dark:border-dark-600 mb-3">
            <svg className="w-6 h-6 text-dark-400 dark:text-dark-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="text-base text-dark-500 font-semibold mb-2">No modules enabled</p>
          {disabledModules.length > 0 && (
            <button
              onClick={() => setShowAddModule(true)}
              className="btn-primary text-base px-4 py-2 inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Module
            </button>
          )}
        </div>
      )}

      {/* Add Module Modal */}
      <Modal
        isOpen={showAddModule}
        onClose={() => setShowAddModule(false)}
        title="Add Module"
        size="xl"
      >
        <div>
          <p className="text-base text-dark-500 dark:text-dark-400 mb-4">
            Select a module to enable for this vault. Each module requires multisig approval.
          </p>
          <div className="space-y-3">
            {disabledModules.map((module) => {
              return (
                <div key={module.address} className="space-y-2">
                  <button
                    onClick={() => handleEnable(module.address)}
                    className="w-full text-left p-4 bg-dark-100 dark:bg-vault-dark-4 rounded-md border border-dark-300 dark:border-dark-600 hover:border-primary-600/50 hover:bg-dark-50 dark:hover:bg-vault-dark-3 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-dark-50 dark:bg-vault-dark-3 border border-dark-300 dark:border-dark-600 flex items-center justify-center">
                        <div className="text-dark-500">{module.icon}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-dark-700 dark:text-dark-200 mb-1">{module.name}</h3>
                        <p className="text-sm text-dark-500 mb-2">{module.description}</p>
                        <p className="text-xs font-mono text-dark-500 dark:text-dark-600 break-all">{module.address}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
          {disabledModules.length === 0 && (
            <div className="text-center py-8">
              <p className="text-base text-dark-500">All available modules are already enabled</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Whitelist Configuration Modal */}
      {showWhitelistConfig && (
        <WhitelistConfiguration
          walletAddress={walletAddress}
          onUpdate={() => {
            onUpdate();
            setShowWhitelistConfig(false);
          }}
        />
      )}

      {/* Daily Limit Configuration Modal */}
      {showDailyLimitConfig && (
        <DailyLimitConfiguration
          walletAddress={walletAddress}
          onUpdate={() => {
            setShowDailyLimitConfig(false);
            onUpdate();
          }}
        />
      )}
      {showSocialRecoveryConfig && (
        <SocialRecoveryConfiguration
          walletAddress={walletAddress}
          onUpdate={() => {
            setShowSocialRecoveryConfig(false);
            onUpdate();
          }}
        />
      )}

      {/* Recovery Management Modal */}
      {showRecoveryManagement && (
        <SocialRecoveryManagement
          walletAddress={walletAddress}
          isOpen={showRecoveryManagement}
          onClose={() => setShowRecoveryManagement(false)}
          onUpdate={onUpdate}
        />
      )}

      {/* Modals */}
      {moduleToEnable && (
        <EnableModuleModal
          isOpen={!!moduleToEnable}
          onClose={() => {
            setModuleToEnable(null);
            onUpdate();
          }}
          walletAddress={walletAddress}
          moduleAddress={moduleToEnable}
          moduleName={MODULES.find(m => m.address === moduleToEnable)?.name || 'Module'}
        />
      )}
      {moduleToDisable && (
        <DisableModuleModal
          isOpen={!!moduleToDisable}
          onClose={() => {
            setModuleToDisable(null);
            onUpdate();
          }}
          walletAddress={walletAddress}
          moduleAddress={moduleToDisable}
          moduleName={MODULES.find(m => m.address === moduleToDisable)?.name || 'Module'}
        />
      )}
    </div>
  );
}
