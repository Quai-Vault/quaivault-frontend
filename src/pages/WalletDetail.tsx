import { useParams, Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMultisig } from '../hooks/useMultisig';
import { useWallet } from '../hooks/useWallet';
import { useIndexerConnection } from '../hooks/useIndexerConnection';
import { TransactionList } from '../components/TransactionList';
import { OwnerManagement } from '../components/OwnerManagement';
import { ModuleManagement } from '../components/ModuleManagement';
import { SocialRecoveryManagement } from '../components/SocialRecoveryManagement';
import { ChangeThresholdModal } from '../components/transactionModals';
import { EmptyState } from '../components/EmptyState';
import { getBlockRangeTimePeriod } from '../utils/blockTime';
import { multisigService } from '../services/MultisigService';
import { CONTRACT_ADDRESSES, TIMING } from '../config/contracts';
import { formatQuai } from 'quais';
import { ExplorerLink } from '../components/ExplorerLink';
import { TokenBalancePanel } from '../components/TokenBalancePanel';

export function WalletDetail() {
  const { address: walletAddress } = useParams<{ address: string }>();
  const { address: connectedAddress } = useWallet();
  const { isConnected: isIndexerConnected } = useIndexerConnection();
  const {
    walletInfo,
    pendingTransactions,
    isLoadingInfo,
    isLoadingTransactions,
    isRefetchingWalletInfo,
    isRefetchingPending,
    refresh,
  } = useMultisig(walletAddress);
  const [copied, setCopied] = useState(false);
  const [showRecoveryManagement, setShowRecoveryManagement] = useState(false);
  const [showChangeThreshold, setShowChangeThreshold] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Clean up copy feedback timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Check if connected user is a Social Recovery guardian
  const { data: isGuardian } = useQuery({
    queryKey: ['isGuardian', walletAddress, connectedAddress],
    queryFn: async () => {
      if (!connectedAddress || !walletAddress) return false;
      return await multisigService.isGuardian(walletAddress, connectedAddress);
    },
    enabled: !!walletAddress && !!connectedAddress,
  });

  // Check if Social Recovery module is enabled
  const { data: isSocialRecoveryEnabled } = useQuery({
    queryKey: ['socialRecoveryEnabled', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return false;
      return await multisigService.isModuleEnabled(walletAddress, CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE);
    },
    enabled: !!walletAddress,
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), TIMING.COPY_FEEDBACK);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!walletAddress) {
    return (
      <div className="text-center py-12">
        <p className="text-primary-600">Invalid wallet address</p>
      </div>
    );
  }

  if (isLoadingInfo) {
    return (
      <div className="text-center py-20">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-primary-600/20 blur-xl animate-pulse"></div>
          <div className="relative inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
        </div>
        <p className="mt-6 text-dark-500 dark:text-dark-400 font-semibold">Loading vault details...</p>
        <p className="mt-2 text-base font-mono text-dark-600 uppercase tracking-wider">Accessing secure storage</p>
      </div>
    );
  }

  if (!walletInfo) {
    return (
      <div className="text-center py-20">
        <div className="vault-panel max-w-md mx-auto p-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-dark-100 dark:bg-vault-dark-4 border-2 border-primary-600/30 mb-6">
            <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200 mb-2">Vault Not Found</h2>
          <p className="text-dark-500">The requested vault could not be found or accessed.</p>
        </div>
      </div>
    );
  }

  const isOwner = walletInfo.owners.some(
    (owner) => owner.toLowerCase() === connectedAddress?.toLowerCase()
  );

  return (
    <div className="space-y-2">
      {/* Header - Compact */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-display font-bold text-gradient-red vault-text-glow">Vault Details</h1>
            <p className="text-base font-mono text-dark-600 uppercase tracking-wider">Secure QuaiVault</p>
          </div>
        </div>
        {isOwner && (
          <div className="flex flex-wrap gap-4">
            <Link
              to={`/wallet/${walletAddress}/transaction/new`}
              className="btn-primary text-lg px-5 py-2.5 inline-flex items-center gap-4.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Transaction
            </Link>
            <Link
              to={`/wallet/${walletAddress}/history`}
              className="btn-secondary text-lg px-5 py-2.5 inline-flex items-center gap-4.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </Link>
            <Link
              to={`/wallet/${walletAddress}/lookup`}
              className="btn-secondary text-lg px-5 py-2.5 inline-flex items-center gap-4.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Lookup TX
            </Link>
          </div>
        )}
      </div>

      {/* Wallet Info and Owners Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Wallet Info */}
        <div className="vault-panel p-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Address - Full width */}
            <div className="col-span-2">
              <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1.5">Address</h3>
              <button
                onClick={() => copyToClipboard(walletAddress)}
                className="group relative w-full text-left cursor-pointer"
                title="Click to copy address"
              >
                <div className="flex items-center gap-4 bg-dark-100 dark:bg-vault-dark-4 px-5 py-3 rounded-md border border-dark-300 dark:border-dark-600 hover:border-primary-600/50 hover:bg-dark-50 dark:hover:bg-vault-dark-3 transition-all duration-200">
                  <p className="text-base font-mono text-primary-600 dark:text-primary-300 truncate flex-1 group-hover:text-primary-200 transition-colors">
                    {walletAddress}
                  </p>
                  <div className={`flex-shrink-0 transition-all duration-200 ${copied ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`}>
                    {copied ? (
                      <svg className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-primary-500 group-hover:text-primary-600 dark:text-primary-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                </div>
                {copied && (
                  <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-primary-900 text-primary-200 px-4 py-2 rounded text-base font-semibold border border-primary-700 shadow-red-glow z-10">
                    Copied!
                  </div>
                )}
              </button>
              <ExplorerLink type="address" value={walletAddress} className="text-xs mt-2">
                View on Explorer
              </ExplorerLink>
            </div>

            {/* Balance */}
            <div>
              <div className="flex items-center gap-4.5 mb-1.5">
                <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider">Balance</h3>
                {isRefetchingWalletInfo && (
                  <div className="w-2.5 h-2.5 border border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                )}
              </div>
              <p className="text-lg font-display font-bold text-gradient-red vault-text-glow">
                {parseFloat(formatQuai(walletInfo.balance)).toFixed(4)}
                <span className="text-base text-primary-600 dark:text-primary-400 ml-1">QUAI</span>
              </p>
            </div>
            
            {/* Threshold */}
            <div>
              <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1.5">Threshold</h3>
              <div className="flex items-center gap-3">
                <p className="text-lg font-semibold text-dark-700 dark:text-dark-200">
                  <span className="text-primary-600 dark:text-primary-400">{walletInfo.threshold}</span>
                  <span className="text-dark-500 mx-1">/</span>
                  <span className="text-dark-600 dark:text-dark-300">{walletInfo.owners.length}</span>
                </p>
                {isOwner && (
                  <button
                    onClick={() => setShowChangeThreshold(true)}
                    className="text-xs text-primary-500 hover:text-primary-400 transition-colors px-2 py-1 rounded border border-primary-600/30 hover:border-primary-600/50 bg-primary-900/20 hover:bg-primary-900/30"
                    title="Change threshold"
                  >
                    Change
                  </button>
                )}
              </div>
            </div>
            
            {/* Status */}
            <div className="col-span-2">
              <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1.5">Your Status</h3>
              <div className="flex flex-wrap gap-2">
                {isOwner ? (
                  <span className="inline-flex items-center gap-1.5 text-primary-600 dark:text-primary-400 text-lg font-semibold">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-600"></div>
                    Owner
                  </span>
                ) : null}
                {isGuardian && (
                  <span className="inline-flex items-center gap-1.5 text-blue-400 text-lg font-semibold">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                    Guardian
                  </span>
                )}
                {!isOwner && !isGuardian && (
                  <span className="text-dark-500 text-lg">Viewer</span>
                )}
              </div>
            </div>

            {/* Token Balances */}
            {walletAddress && <TokenBalancePanel walletAddress={walletAddress} />}
          </div>
        </div>

        {/* Right Column: Owners */}
        {isOwner ? (
          <OwnerManagement
            walletAddress={walletAddress}
            owners={walletInfo.owners}
            threshold={walletInfo.threshold}
            onUpdate={refresh}
          />
        ) : (
          <div className="vault-panel p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200">Owners</h2>
              <span className="vault-badge text-base">
                {walletInfo.owners.length}
              </span>
            </div>
            <div className="max-h-[400px] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {walletInfo.owners.map((owner, index) => (
                  <div
                    key={owner}
                    className="flex items-center justify-between p-3 bg-dark-100 dark:bg-vault-dark-4 rounded-md border border-dark-300 dark:border-dark-600 hover:border-primary-600/30 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-6 h-6 bg-gradient-to-br from-primary-700 to-primary-900 rounded-full flex items-center justify-center border border-primary-600/50 flex-shrink-0">
                        <span className="text-xs font-bold text-primary-200">
                          {index + 1}
                        </span>
                      </div>
                      <span className="font-mono text-sm text-primary-600 dark:text-primary-300 truncate">{owner}</span>
                    </div>
                    {owner.toLowerCase() === connectedAddress?.toLowerCase() && (
                      <span className="vault-badge text-xs border-primary-600/50 text-primary-600 dark:text-primary-400 bg-primary-900/30 ml-2 flex-shrink-0">
                        You
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Module Management */}
      {isOwner && (
        <ModuleManagement
          walletAddress={walletAddress}
          onUpdate={refresh}
        />
      )}

      {/* Guardian Actions - For guardians who are not owners */}
      {!isOwner && isGuardian && isSocialRecoveryEnabled && (
        <div className="vault-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 border border-blue-600/50 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200">Guardian Actions</h2>
                <p className="text-base text-dark-500">You are a Social Recovery guardian for this vault</p>
              </div>
            </div>
            <span className="vault-badge text-base border-blue-600/50 text-blue-400 bg-blue-900/30">
              Guardian
            </span>
          </div>
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md border border-dark-300 dark:border-dark-600 p-4">
            <p className="text-base text-dark-500 dark:text-dark-400 mb-3">
              As a guardian, you can help recover this vault if the owners lose access.
              You can initiate recovery, approve pending recoveries, or revoke your approval.
            </p>
            <button
              onClick={() => setShowRecoveryManagement(true)}
              className="btn-primary text-base px-4 py-2 inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Manage Social Recovery
            </button>
          </div>
        </div>
      )}

      {/* Social Recovery Management Modal for Guardians */}
      {showRecoveryManagement && (
        <SocialRecoveryManagement
          walletAddress={walletAddress}
          isOpen={showRecoveryManagement}
          onClose={() => setShowRecoveryManagement(false)}
          onUpdate={refresh}
        />
      )}

      {/* Change Threshold Modal */}
      <ChangeThresholdModal
        isOpen={showChangeThreshold}
        onClose={() => {
          setShowChangeThreshold(false);
          refresh();
        }}
        walletAddress={walletAddress}
        currentThreshold={walletInfo.threshold}
        ownerCount={walletInfo.owners.length}
      />

      {/* Pending Transactions - Compact */}
      <div className="vault-panel p-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="flex items-center gap-4.5">
              <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200">Pending Transactions</h2>
              {/* Only show refresh indicator when manually refreshing or polling (not during subscription updates) */}
              {isRefetchingPending && (
                <div className="w-2.5 h-2.5 border border-primary-600 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
            {!isIndexerConnected && (
              <p className="text-base font-mono text-dark-600 mt-0.5">
                Showing last {getBlockRangeTimePeriod()}
              </p>
            )}
          </div>
          <button
            onClick={refresh}
            className="text-base text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 transition-colors font-semibold flex items-center gap-4.5 disabled:opacity-50"
            disabled={isRefetchingPending}
          >
            <svg className={`w-3.5 h-3.5 ${isRefetchingPending ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {isLoadingTransactions ? (
          <div className="text-center py-8">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-primary-600/20 blur-xl animate-pulse"></div>
              <div className="relative inline-block h-6 w-6 animate-spin rounded-full border-3 border-solid border-primary-600 border-r-transparent"></div>
            </div>
            <p className="mt-3 text-lg text-dark-500 dark:text-dark-400 font-semibold">Loading...</p>
          </div>
        ) : !pendingTransactions || pendingTransactions.length === 0 ? (
          <EmptyState
            icon={
              <svg
                className="w-6 h-6 text-dark-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            }
            title="No Pending Transactions"
            description="All transactions have been processed. Propose a new transaction to get started."
            action={
              walletAddress
                ? {
                    label: 'Propose Transaction',
                    to: `/wallet/${walletAddress}/transaction/new`,
                  }
                : undefined
            }
            className="py-8"
          />
        ) : (
          <TransactionList
            transactions={pendingTransactions}
            walletAddress={walletAddress}
            isOwner={isOwner}
          />
        )}
      </div>
    </div>
  );
}
