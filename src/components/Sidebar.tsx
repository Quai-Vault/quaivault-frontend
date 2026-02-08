import { memo, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useMultisig } from '../hooks/useMultisig';
import { useDeduplicatedWallets } from '../hooks/useDeduplicatedWallets';
import { WalletCard } from './WalletCard';
import { EmptyState } from './EmptyState';
import { formatAddress } from '../utils/formatting';

const OWNER_VAULTS_COLLAPSED_KEY = 'sidebar-owner-vaults-collapsed';
const GUARDIAN_VAULTS_COLLAPSED_KEY = 'sidebar-guardian-vaults-collapsed';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar = memo(function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { connect, disconnect, connected, address } = useWallet();
  const { userWallets, guardianWallets, isLoadingWallets, isLoadingGuardianWallets, isRefetchingWallets, isRefetchingGuardianWallets } = useMultisig();
  const location = useLocation();

  const [ownerVaultsCollapsed, setOwnerVaultsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(OWNER_VAULTS_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [guardianVaultsCollapsed, setGuardianVaultsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(GUARDIAN_VAULTS_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem(OWNER_VAULTS_COLLAPSED_KEY, String(ownerVaultsCollapsed));
  }, [ownerVaultsCollapsed]);

  useEffect(() => {
    localStorage.setItem(GUARDIAN_VAULTS_COLLAPSED_KEY, String(guardianVaultsCollapsed));
  }, [guardianVaultsCollapsed]);

  // Deduplicate: vaults where user is both owner and guardian show only in "Your Vaults"
  const { guardianOnlyWallets, dualRoleAddresses } = useDeduplicatedWallets(userWallets, guardianWallets);

  return (
    <>
      {/* Overlay for mobile when sidebar is open */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-10 lg:hidden"
          onClick={onToggle}
        />
      )}
      <aside className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-white dark:bg-vault-dark-2 border-r-2 border-dark-200 dark:border-dark-700 flex flex-col z-20 overflow-hidden transition-all duration-300 ${collapsed ? '-translate-x-full lg:translate-x-0 lg:w-0 lg:border-r-0' : 'w-64 translate-x-0'}`}>

      {/* Wallet Connect/Disconnect */}
      <div className="px-4 py-4 border-b border-dark-200 dark:border-dark-700">
        {connected && address ? (
          <div className="space-y-3">
            <div className="vault-panel px-4 py-2 border border-dark-300 dark:border-dark-600">
              <span className="text-base font-mono text-primary-600 dark:text-primary-400 font-semibold">
                {formatAddress(address)}
              </span>
            </div>
            <button
              onClick={disconnect}
              className="btn-secondary w-full"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={connect}
            className="btn-primary w-full"
          >
            Connect Wallet
          </button>
        )}
      </div>

      {/* Quick Actions */}
      {connected && (
        <div className="px-4 py-5 border-b border-dark-200 dark:border-dark-700">
          <Link
            to="/create"
            className={`flex items-center gap-4.5 px-4 py-2.5 rounded text-base font-semibold transition-all w-full ${
              location.pathname === '/create'
                ? 'text-primary-600 dark:text-primary-400 vault-text-glow bg-dark-100 dark:bg-vault-dark-4'
                : 'text-dark-500 dark:text-dark-400 hover:text-dark-700 dark:hover:text-dark-200 hover:bg-dark-100 dark:hover:bg-vault-dark-4'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create
          </Link>
        </div>
      )}

      {/* Wallets List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!connected ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-dark-100 dark:bg-vault-dark-4 border-2 border-primary-600/30 mb-5">
              <svg className="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-base text-dark-600 dark:text-dark-500 font-medium mb-2.5">Connect Wallet</p>
            <p className="text-base text-dark-500 dark:text-dark-600 font-mono uppercase tracking-wider">
              To view your vaults
            </p>
          </div>
        ) : (isLoadingWallets || isLoadingGuardianWallets) ? (
          <div className="text-center py-12">
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-primary-600/20 blur-xl animate-pulse"></div>
              <div className="relative inline-block h-10 w-10 animate-spin rounded-full border-2 border-solid border-primary-600 border-r-transparent"></div>
            </div>
            <p className="mt-5 text-base text-dark-500 dark:text-dark-400 font-semibold">Loading vaults...</p>
          </div>
        ) : (!userWallets || userWallets.length === 0) && guardianOnlyWallets.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-9 h-9 text-dark-400 dark:text-dark-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            }
            title="No Vaults"
            description="Create your first QuaiVault to get started. Vaults allow you to manage funds securely with multiple owners and configurable approval thresholds."
            action={{
              label: 'Create Vault',
              to: '/create',
            }}
            className="py-10"
          />
        ) : (
          <div className="space-y-6">
            {/* Owner Vaults */}
            {userWallets && userWallets.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-3 px-1">
                  <button
                    onClick={() => setOwnerVaultsCollapsed(!ownerVaultsCollapsed)}
                    className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                  >
                    <svg
                      className={`w-4 h-4 text-dark-500 transition-transform ${ownerVaultsCollapsed ? '-rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <h2 className="text-base font-display font-bold text-dark-700 dark:text-dark-200 uppercase tracking-wider">
                      Your Vaults
                    </h2>
                    {isRefetchingWallets && (
                      <div className="w-5 h-5 border border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                    )}
                  </button>
                  <span className="vault-badge">
                    {userWallets.length}
                  </span>
                </div>
                {!ownerVaultsCollapsed && (
                  <div className="space-y-3">
                    {userWallets.map((walletAddress) => {
                      const isActive = location.pathname === `/wallet/${walletAddress}` || location.pathname.startsWith(`/wallet/${walletAddress}/`);
                      const isDualRole = dualRoleAddresses.has(walletAddress.toLowerCase());
                      return (
                        <div
                          key={walletAddress}
                          className={`vault-panel p-4 hover:border-primary-600/50 transition-all ${
                            isActive ? 'border-primary-600/50 bg-dark-100 dark:bg-vault-dark-4' : ''
                          }`}
                        >
                          <Link
                            to={`/wallet/${walletAddress}`}
                            className="block"
                          >
                            <WalletCard walletAddress={walletAddress} compact={true} role={isDualRole ? 'owner+guardian' : 'owner'} />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Guardian Vaults (only vaults where user is guardian but NOT owner) */}
            {guardianOnlyWallets.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-3 px-1">
                  <button
                    onClick={() => setGuardianVaultsCollapsed(!guardianVaultsCollapsed)}
                    className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                  >
                    <svg
                      className={`w-4 h-4 text-dark-500 transition-transform ${guardianVaultsCollapsed ? '-rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <h2 className="text-base font-display font-bold text-dark-700 dark:text-dark-200 uppercase tracking-wider">
                      Guardian
                    </h2>
                    {isRefetchingGuardianWallets && (
                      <div className="w-5 h-5 border border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    )}
                  </button>
                  <span className="vault-badge border-blue-600/50 text-blue-400 bg-blue-900/30">
                    {guardianOnlyWallets.length}
                  </span>
                </div>
                {!guardianVaultsCollapsed && (
                  <div className="space-y-3">
                    {guardianOnlyWallets.map((walletAddress) => {
                      const isActive = location.pathname === `/wallet/${walletAddress}` || location.pathname.startsWith(`/wallet/${walletAddress}/`);
                      return (
                        <div
                          key={walletAddress}
                          className={`vault-panel p-4 border-l-2 border-l-blue-500 hover:border-blue-400/50 transition-all ${
                            isActive ? 'border-blue-400/50 bg-dark-100 dark:bg-vault-dark-4' : ''
                          }`}
                        >
                          <Link
                            to={`/wallet/${walletAddress}`}
                            className="block"
                          >
                            <WalletCard walletAddress={walletAddress} compact={true} role="guardian" />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      </aside>
    </>
  );
});
