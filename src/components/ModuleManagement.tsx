import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CONTRACT_ADDRESSES } from '../config/contracts';
import { getDaoShipsDaoUrl } from '../config/daoShips';
import { useModuleInventory, type ResolvedVaultModule } from '../hooks/useModuleInventory';
import { multisigService } from '../services/MultisigService';
import { formatDuration } from '../utils/formatting';
import { CopyButton } from './CopyButton';
import { ExplorerLink } from './ExplorerLink';
import { Modal } from './Modal';
import { SocialRecoveryConfiguration } from './SocialRecoveryConfiguration';
import { SocialRecoveryManagement } from './SocialRecoveryManagement';
import { DisableModuleModal, EnableModuleModal } from './transactionModals';

interface ModuleManagementProps {
  walletAddress: string;
  isOwner: boolean;
  onUpdate: () => void;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function ModuleIcon({ module }: { module: ResolvedVaultModule }) {
  if (module.daoDisplay?.avatarUrl) {
    return (
      <img
        src={module.daoDisplay.avatarUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="w-9 h-9 rounded-lg object-cover"
        onError={(event) => { event.currentTarget.style.display = 'none'; }}
      />
    );
  }

  return (
    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-700 to-primary-900 border border-primary-600/50 flex items-center justify-center text-primary-200">
      {module.kind === 'dao-ships' || module.kind === 'dao-ships-unverified' ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 18h18M5 18l2-8h10l2 8M9 10V5h6v5M12 5V2" />
        </svg>
      ) : module.kind === 'social-recovery' ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
        </svg>
      ) : (
        <span className="font-mono font-bold">?</span>
      )}
    </div>
  );
}

function StatusBadge({ module }: { module: ResolvedVaultModule }) {
  if (module.hasStatusMismatch) {
    return <span className="vault-badge text-xs border-yellow-600/50 text-yellow-700 dark:text-yellow-300">Status mismatch</span>;
  }
  if (module.authority === 'live') {
    return (
      <span className={`vault-badge text-xs ${module.isActive ? 'border-primary-600/50 text-primary-600 dark:text-primary-400' : ''}`}>
        {module.isActive ? 'Active on-chain' : 'Disabled on-chain'}
      </span>
    );
  }
  return (
    <span className="vault-badge text-xs border-yellow-600/50 text-yellow-700 dark:text-yellow-300">
      {module.isActive ? 'Indexed active · unverified' : 'Indexed history · unverified'}
    </span>
  );
}

function ModuleCard({
  module,
  isOwner,
  canDisable,
  canEnable,
  onDisable,
  onEnable,
  onConfigureRecovery,
  onManageRecovery,
  isRecoveryConfigured,
}: {
  module: ResolvedVaultModule;
  isOwner: boolean;
  canDisable: boolean;
  canEnable: boolean;
  onDisable: () => void;
  onEnable: () => void;
  onConfigureRecovery: () => void;
  onManageRecovery: () => void;
  isRecoveryConfigured: boolean;
}) {
  const executionCount = module.indexed?.executionCount ?? 0;
  const failedCount = module.indexed?.failedExecutionCount ?? 0;

  return (
    <article className="p-4 bg-dark-50 dark:bg-vault-dark-4 rounded-md border border-dark-300 dark:border-dark-600 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex-shrink-0"><ModuleIcon module={module} /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-dark-700 dark:text-dark-200">{module.name}</h3>
              {module.kind === 'dao-ships' && (
                <span className="vault-badge text-xs border-blue-600/50 text-blue-700 dark:text-blue-300">DAO Ships</span>
              )}
              {module.kind === 'dao-ships-unverified' && (
                <span className="vault-badge text-xs border-yellow-600/50 text-yellow-700 dark:text-yellow-300">DAO Ships? · unverified</span>
              )}
              <StatusBadge module={module} />
            </div>
            <p className="text-sm text-dark-500 mt-1">{module.daoDisplay?.description || module.description}</p>
            <div className="flex items-center gap-2 mt-1.5 min-w-0">
              <span className="font-mono text-xs text-dark-500 truncate">{shortAddress(module.address)}</span>
              <CopyButton text={module.address} title="Copy module address" size="sm" />
              <ExplorerLink type="address" value={module.address} showIcon={false} className="text-xs">Explorer</ExplorerLink>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          {module.kind === 'dao-ships' && module.dao && (
            <a
              href={getDaoShipsDaoUrl(module.dao.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-sm px-3 py-1.5 inline-flex items-center gap-2"
            >
              Open DAO
              <span aria-hidden="true">↗</span>
            </a>
          )}
          {isOwner && module.kind === 'social-recovery' && module.isActive && canDisable && (
            <>
              <button onClick={onConfigureRecovery} className="btn-primary text-sm px-3 py-1.5">Configure</button>
              {isRecoveryConfigured && (
                <button onClick={onManageRecovery} className="btn-primary text-sm px-3 py-1.5">Manage Recovery</button>
              )}
            </>
          )}
          {isOwner && module.isActive && (
            <button
              onClick={onDisable}
              disabled={!canDisable}
              title={canDisable ? 'Propose disabling this module' : 'A live on-chain read is required before disabling'}
              className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Disable
            </button>
          )}
          {isOwner && !module.isActive && canEnable && (
            <button onClick={onEnable} className="btn-primary text-sm px-3 py-1.5">
              Re-enable
            </button>
          )}
        </div>
      </div>

      {module.kind === 'dao-ships' && module.dao && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div><span className="text-dark-500 block text-xs">Members</span><span className="font-semibold">{module.dao.active_member_count}</span></div>
          <div><span className="text-dark-500 block text-xs">Proposals</span><span className="font-semibold">{module.dao.proposal_count}</span></div>
          <div><span className="text-dark-500 block text-xs">Voting</span><span className="font-semibold">{formatDuration(module.dao.voting_period)}</span></div>
          <div><span className="text-dark-500 block text-xs">Execution setup</span><span className={module.daoVerification?.delegatecallAllowed ? 'text-green-600 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-300'}>{module.daoVerification?.delegatecallAllowed ? 'Ready' : 'Review required'}</span></div>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-primary-600 dark:text-primary-400 font-semibold">Technical details</summary>
        <div className="mt-2 p-3 rounded bg-dark-100 dark:bg-vault-dark-3 text-dark-500 space-y-1">
          <p className="font-mono break-all">Module: {module.address}</p>
          {module.indexed?.enabledAtBlock !== null && module.indexed?.enabledAtBlock !== undefined && (
            <p>Enabled at block {module.indexed.enabledAtBlock.toLocaleString()}</p>
          )}
          {module.indexed?.disabledAtBlock !== null && module.indexed?.disabledAtBlock !== undefined && (
            <p>Disabled at block {module.indexed.disabledAtBlock.toLocaleString()}</p>
          )}
          <p>{executionCount.toLocaleString()} indexed execution{executionCount === 1 ? '' : 's'}{failedCount > 0 ? ` · ${failedCount.toLocaleString()} failed` : ''}</p>
          {module.indexed?.lastExecutionTx && (
            <p>
              Last activity at block {module.indexed.lastExecutionBlock?.toLocaleString() ?? 'unknown'} ·{' '}
              <ExplorerLink type="transaction" value={module.indexed.lastExecutionTx} showIcon={false} className="text-sm">
                View transaction
              </ExplorerLink>
            </p>
          )}
          {module.daoVerification?.multisendLibrary && (
            <p className="font-mono break-all">DAO multisend: {module.daoVerification.multisendLibrary}</p>
          )}
          {module.hasStatusMismatch && <p className="text-yellow-700 dark:text-yellow-300">The live vault and indexer disagree. Live state controls all actions.</p>}
        </div>
      </details>
    </article>
  );
}

export function ModuleManagement({ walletAddress, isOwner, onUpdate }: ModuleManagementProps) {
  const [showAddModule, setShowAddModule] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSocialRecoveryConfig, setShowSocialRecoveryConfig] = useState(false);
  const [showRecoveryManagement, setShowRecoveryManagement] = useState(false);
  const [moduleToEnable, setModuleToEnable] = useState<{ address: string; name: string } | null>(null);
  const [moduleToDisable, setModuleToDisable] = useState<ResolvedVaultModule | null>(null);
  const inventory = useModuleInventory(walletAddress);

  const socialRecoveryAddress = CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE.toLowerCase();
  const socialRecovery = inventory.modules.find((module) => module.address === socialRecoveryAddress);
  const canOfferSocialRecovery = isOwner
    && Boolean(socialRecoveryAddress)
    && inventory.liveReadAvailable
    && !socialRecovery?.isActive;
  const { data: recoveryConfig } = useQuery({
    queryKey: ['recoveryConfig', walletAddress],
    queryFn: () => multisigService.getRecoveryConfig(walletAddress),
    enabled: socialRecovery?.isActive === true,
    staleTime: 30_000,
  });
  const isRecoveryConfigured = Boolean(recoveryConfig?.guardians.length);

  const finishUpdate = () => {
    void inventory.refetch();
    onUpdate();
  };

  return (
    <section className="vault-panel p-4" aria-labelledby="modules-heading">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 id="modules-heading" className="text-lg font-display font-bold text-dark-700 dark:text-dark-200">Modules</h2>
          <span className="vault-badge text-sm">{inventory.activeModules.length} Active</span>
          {inventory.isRefreshing && <span className="text-xs text-dark-500">Refreshing…</span>}
        </div>
        {canOfferSocialRecovery && (
          <button onClick={() => setShowAddModule(true)} className="btn-primary text-sm px-3 py-1.5">Add Module</button>
        )}
      </div>

      {(inventory.liveReadAvailable || inventory.inventory) && (
        <p className="text-xs text-dark-500 mb-3">
          {inventory.liveReadAvailable ? 'Live vault state verified' : 'Live vault state unavailable'}
          {inventory.inventory ? ` · lifecycle indexed through block ${inventory.inventory.indexedThroughBlock.toLocaleString()}` : ''}
          {inventory.inventory?.isSyncing ? ' · indexer syncing' : ''}
        </p>
      )}

      {!inventory.liveReadAvailable && !inventory.isLoading && (
        <div className="mb-3 p-3 rounded-md border border-yellow-600/40 bg-yellow-50 dark:bg-yellow-900/20 text-sm text-yellow-800 dark:text-yellow-200">
          Live module verification is unavailable. Indexed history remains visible, but module actions are locked until the vault can be read on-chain.
        </div>
      )}
      {inventory.inventoryError && (
        <div className="mb-3 p-3 rounded-md border border-dark-300 dark:border-dark-600 text-sm text-dark-500">
          Module lifecycle history is temporarily unavailable. Live modules are still shown.
        </div>
      )}
      {inventory.daoError && (
        <div className="mb-3 p-3 rounded-md border border-dark-300 dark:border-dark-600 text-sm text-dark-500">
          DAO details are temporarily unavailable. Module status and emergency controls are unaffected.
        </div>
      )}
      {inventory.daoIndexer?.isStale && (
        <div className="mb-3 p-3 rounded-md border border-yellow-600/40 text-sm text-yellow-800 dark:text-yellow-200">
          DAO details may be stale while the DAO Ships indexer catches up.
        </div>
      )}

      {inventory.isLoading && inventory.modules.length === 0 ? (
        <p className="text-sm text-dark-500 py-3">Loading module inventory…</p>
      ) : inventory.activeModules.length === 0 ? (
        <p className="text-sm text-dark-500 py-3">No active modules were found for this vault.</p>
      ) : (
        <div className="space-y-3">
          {inventory.activeModules.map((module) => (
            <ModuleCard
              key={module.address}
              module={module}
              isOwner={isOwner}
              canDisable={inventory.liveReadAvailable && module.liveStatus === true}
              canEnable={false}
              onDisable={() => setModuleToDisable(module)}
              onEnable={() => undefined}
              onConfigureRecovery={() => setShowSocialRecoveryConfig(true)}
              onManageRecovery={() => setShowRecoveryManagement(true)}
              isRecoveryConfigured={isRecoveryConfigured}
            />
          ))}
        </div>
      )}

      {inventory.historicalModules.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dark-300 dark:border-dark-600">
          <button
            onClick={() => setShowHistory((value) => !value)}
            aria-expanded={showHistory}
            className="text-sm font-semibold text-primary-600 dark:text-primary-400"
          >
            {showHistory ? 'Hide' : 'Show'} module history ({inventory.historicalModuleCount})
          </button>
          {showHistory && (
            <div className="space-y-3 mt-3">
              {inventory.historyTruncated && (
                <p className="text-xs text-dark-500">Showing the 100 most recently changed modules.</p>
              )}
              {inventory.historicalModules.map((module) => (
                <ModuleCard
                  key={module.address}
                  module={module}
                  isOwner={isOwner}
                  canDisable={false}
                  canEnable={inventory.liveReadAvailable
                    && module.liveStatus === false
                    && typeof module.indexed?.enabledAtBlock === 'number'}
                  onDisable={() => undefined}
                  onEnable={() => setModuleToEnable({ address: module.address, name: module.name })}
                  onConfigureRecovery={() => undefined}
                  onManageRecovery={() => undefined}
                  isRecoveryConfigured={false}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showAddModule} onClose={() => setShowAddModule(false)} title="Add Module" size="md">
        <button
          onClick={() => {
            setShowAddModule(false);
            setModuleToEnable({
              address: CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE,
              name: 'Social Recovery',
            });
          }}
          className="w-full text-left p-4 bg-dark-100 dark:bg-vault-dark-4 rounded-md border border-dark-300 dark:border-dark-600 hover:border-primary-600/50"
        >
          <h3 className="font-semibold text-dark-700 dark:text-dark-200">Social Recovery</h3>
          <p className="text-sm text-dark-500 mt-1">Recover wallet access using guardian consensus.</p>
          <p className="text-xs font-mono text-dark-500 mt-2 break-all">{CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE}</p>
        </button>
      </Modal>

      {showSocialRecoveryConfig && (
        <SocialRecoveryConfiguration walletAddress={walletAddress} onUpdate={() => {
          setShowSocialRecoveryConfig(false);
          finishUpdate();
        }} />
      )}
      {showRecoveryManagement && (
        <SocialRecoveryManagement
          walletAddress={walletAddress}
          isOpen
          onClose={() => setShowRecoveryManagement(false)}
          onUpdate={finishUpdate}
        />
      )}
      {moduleToEnable && (
        <EnableModuleModal
          isOpen
          onClose={() => { setModuleToEnable(null); finishUpdate(); }}
          walletAddress={walletAddress}
          moduleAddress={moduleToEnable.address}
          moduleName={moduleToEnable.name}
        />
      )}
      {moduleToDisable && (
        <DisableModuleModal
          isOpen
          onClose={() => { setModuleToDisable(null); finishUpdate(); }}
          walletAddress={walletAddress}
          moduleAddress={moduleToDisable.address}
          moduleName={moduleToDisable.name}
        />
      )}
    </section>
  );
}
