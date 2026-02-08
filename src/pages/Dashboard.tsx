import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useMultisig } from '../hooks/useMultisig';
import { useDeduplicatedWallets } from '../hooks/useDeduplicatedWallets';
import { WalletCard } from '../components/WalletCard';
import { EmptyState } from '../components/EmptyState';
import { Logo } from '../components/Logo';

const DASHBOARD_OWNER_VAULTS_COLLAPSED_KEY = 'dashboard-owner-vaults-collapsed';
const DASHBOARD_GUARDIAN_VAULTS_COLLAPSED_KEY = 'dashboard-guardian-vaults-collapsed';

export function Dashboard() {
  const { connected, connect } = useWallet();
  const { userWallets, guardianWallets, isLoadingWallets, isLoadingGuardianWallets } = useMultisig();

  const [ownerVaultsCollapsed, setOwnerVaultsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(DASHBOARD_OWNER_VAULTS_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [guardianVaultsCollapsed, setGuardianVaultsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(DASHBOARD_GUARDIAN_VAULTS_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem(DASHBOARD_OWNER_VAULTS_COLLAPSED_KEY, String(ownerVaultsCollapsed));
  }, [ownerVaultsCollapsed]);

  useEffect(() => {
    localStorage.setItem(DASHBOARD_GUARDIAN_VAULTS_COLLAPSED_KEY, String(guardianVaultsCollapsed));
  }, [guardianVaultsCollapsed]);

  // Deduplicate: vaults where user is both owner and guardian show only in "Your Vaults"
  const { guardianOnlyWallets, dualRoleAddresses } = useDeduplicatedWallets(userWallets, guardianWallets);

  // Not connected - show connect wallet CTA
  if (!connected) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="vault-panel p-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-6">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 bg-primary-600/20 blur-xl rounded-full"></div>
              <Logo className="relative w-20 h-20" />
            </div>
          </div>
          <h1 className="text-xl font-display font-bold text-gradient-red mb-3 vault-text-glow">
            Quai Vault
          </h1>
          <p className="text-base text-dark-500 dark:text-dark-400 mb-6">
            Secure multisig wallet solution for Quai Network. Connect your wallet to manage your vaults.
          </p>
          <button onClick={connect} className="btn-primary">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  // Loading wallets
  if (isLoadingWallets || isLoadingGuardianWallets) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="vault-panel p-8 text-center">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-primary-600/20 blur-xl animate-pulse"></div>
            <div className="relative inline-block h-12 w-12 animate-spin rounded-full border-2 border-solid border-primary-600 border-r-transparent"></div>
          </div>
          <p className="mt-6 text-base text-dark-500 dark:text-dark-400 font-semibold">Loading your vaults...</p>
        </div>
      </div>
    );
  }

  // No vaults - show create vault CTA
  if ((!userWallets || userWallets.length === 0) && guardianOnlyWallets.length === 0) {
    return (
      <div className="max-w-xl mx-auto">
        <EmptyState
          icon={
            <svg className="w-12 h-12 text-dark-400 dark:text-dark-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
          title="No Vaults Yet"
          description="Create your first QuaiVault to securely manage funds with multiple owners and configurable approval thresholds."
          action={{
            label: 'Create Vault',
            to: '/create',
          }}
          className="vault-panel p-8"
        />
      </div>
    );
  }

  // Has vaults - show overview
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Owner Vaults */}
      {userWallets && userWallets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setOwnerVaultsCollapsed(!ownerVaultsCollapsed)}
              className="flex items-center gap-3 hover:opacity-70 transition-opacity"
            >
              <svg
                className={`w-5 h-5 text-dark-500 transition-transform ${ownerVaultsCollapsed ? '-rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <h1 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200">
                Your Vaults
              </h1>
            </button>
            <Link to="/create" className="btn-primary inline-flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Vault
            </Link>
          </div>
          {!ownerVaultsCollapsed && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userWallets.map((walletAddress) => {
                const isDualRole = dualRoleAddresses.has(walletAddress.toLowerCase());
                return (
                  <WalletCard key={walletAddress} walletAddress={walletAddress} role={isDualRole ? 'owner+guardian' : 'owner'} />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Guardian Vaults (only vaults where user is guardian but NOT owner) */}
      {guardianOnlyWallets.length > 0 && (
        <div>
          <button
            onClick={() => setGuardianVaultsCollapsed(!guardianVaultsCollapsed)}
            className="flex items-center gap-3 mb-6 hover:opacity-70 transition-opacity"
          >
            <svg
              className={`w-5 h-5 text-dark-500 transition-transform ${guardianVaultsCollapsed ? '-rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h2 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200">
              Guardian Vaults
            </h2>
          </button>
          {!guardianVaultsCollapsed && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {guardianOnlyWallets.map((walletAddress) => (
                <WalletCard key={walletAddress} walletAddress={walletAddress} role="guardian" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
