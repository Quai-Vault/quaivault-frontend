import { Link } from 'react-router-dom';
import { useState, memo, useCallback, useRef, useEffect } from 'react';
import { useMultisig } from '../hooks/useMultisig';
import { formatQuai } from 'quais';
import { formatAddress } from '../utils/formatting';
import { copyToClipboard as copyText } from '../utils/clipboard';
import { TIMING } from '../config/contracts';

type WalletRole = 'owner' | 'guardian' | 'owner+guardian';

interface WalletCardProps {
  walletAddress: string;
  compact?: boolean;
  role?: WalletRole;
}

/**
 * Memoized wallet card component to prevent unnecessary re-renders
 * when other wallets in the list change
 */
export const WalletCard = memo(function WalletCard({ walletAddress, compact = false, role = 'owner' }: WalletCardProps) {
  const { walletInfo, pendingTransactions, isLoadingInfo, isRefetchingWalletInfo } = useMultisig(walletAddress);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(copyTimerRef.current);
  }, []);

  const copyToClipboard = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const success = await copyText(walletAddress);
    if (success) {
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), TIMING.COPY_FEEDBACK);
    }
  }, [walletAddress]);

  if (isLoadingInfo || !walletInfo) {
    return (
      <div className={`${compact ? 'p-4' : 'p-6'} animate-pulse`}>
        <div className="h-4 bg-dark-200 dark:bg-vault-dark-4 rounded w-3/4 mb-3"></div>
        <div className="h-3 bg-dark-200 dark:bg-vault-dark-4 rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-dark-200 dark:bg-vault-dark-4 rounded w-1/3"></div>
      </div>
    );
  }

  const pendingCount = pendingTransactions?.length || 0;

  const isGuardianRole = role === 'guardian';
  const isDualRole = role === 'owner+guardian';

  if (compact) {
    const dotColor = isGuardianRole ? 'bg-blue-500' : 'bg-primary-600';
    const textColor = isGuardianRole
      ? 'text-blue-400 dark:text-blue-300'
      : 'text-primary-600 dark:text-primary-300';
    const copyBtnColor = isGuardianRole
      ? 'text-blue-400 hover:text-blue-300 dark:hover:text-blue-200'
      : 'text-primary-600 hover:text-primary-500 dark:hover:text-primary-400';
    const balanceColor = isGuardianRole
      ? 'text-blue-400 dark:text-blue-300'
      : 'text-primary-600 dark:text-primary-400';

    return (
      <div className="group">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0`}></div>
            <h3 className={`text-base font-mono font-semibold ${textColor} truncate`}>
              {formatAddress(walletAddress)}
            </h3>
            {isDualRole && (
              <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" title="Also a guardian">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            )}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                copyToClipboard(e);
              }}
              className={`flex-shrink-0 ${copyBtnColor} text-base p-4 rounded hover:bg-dark-100 dark:hover:bg-vault-dark-3 transition-all`}
              title="Copy full address"
            >
              {copied ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
          {pendingCount > 0 && (
            <span className="flex-shrink-0 inline-flex items-center px-5 py-2.5 rounded text-base font-bold bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700/50">
              {pendingCount}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-base">
          {isGuardianRole ? (
            <span className="text-blue-400 font-mono text-sm">Guardian</span>
          ) : (
            <span className="text-dark-500 font-mono">
              {walletInfo.threshold}/{walletInfo.owners.length}
            </span>
          )}
          <span className={`${balanceColor} font-display font-semibold`}>
            {parseFloat(formatQuai(walletInfo.balance)).toFixed(3)} QUAI
          </span>
        </div>
      </div>
    );
  }

  const fullCardIconColor = isGuardianRole ? 'text-blue-500' : 'text-primary-600';
  const fullCardDotColor = isGuardianRole ? 'bg-blue-500' : 'bg-primary-600 animate-glow-pulse';
  const fullCardTextColor = isGuardianRole
    ? 'text-blue-400 dark:text-blue-300 group-hover:text-blue-300 dark:group-hover:text-blue-200'
    : 'text-primary-600 dark:text-primary-400 group-hover:text-primary-500 dark:group-hover:text-primary-300';
  const fullCardCopyColor = isGuardianRole
    ? 'text-blue-400 hover:text-blue-300 dark:hover:text-blue-200 border-blue-600/50 dark:border-blue-700/50 hover:border-blue-400 dark:hover:border-blue-500'
    : 'text-primary-600 hover:text-primary-500 dark:hover:text-primary-400 border-primary-300 dark:border-primary-700/50 hover:border-primary-500 dark:hover:border-primary-600';

  return (
    <Link
      to={`/wallet/${walletAddress}`}
      className="card-glow p-6 block group relative"
    >
      {/* Vault icon overlay */}
      <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
        {isGuardianRole ? (
          <svg className={`w-12 h-12 ${fullCardIconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ) : (
          <svg className={`w-12 h-12 ${fullCardIconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        )}
      </div>

      <div className="flex items-start justify-between mb-6 relative z-10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-4 mb-3">
            <div className={`flex-shrink-0 w-2 h-2 rounded-full ${fullCardDotColor}`}></div>
            <h3 className={`text-lg font-mono font-bold truncate transition-colors ${fullCardTextColor}`}>
              {formatAddress(walletAddress)}
            </h3>
            <button
              onClick={copyToClipboard}
              className={`flex-shrink-0 ${fullCardCopyColor} text-base px-4 py-2 rounded border bg-dark-100 dark:bg-vault-dark-4 hover:bg-dark-200 dark:hover:bg-vault-dark-3 transition-all`}
              title="Copy full address"
            >
              {copied ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-base font-mono">
            {isGuardianRole ? (
              <span className="vault-badge border-blue-600/50 text-blue-400 bg-blue-900/30">
                Guardian
              </span>
            ) : (
              <>
                <span className="vault-badge">
                  {walletInfo.owners.length} Owner{walletInfo.owners.length !== 1 ? 's' : ''}
                </span>
                <span className="vault-badge border-primary-600/30 text-primary-600 dark:text-primary-400">
                  {walletInfo.threshold}/{walletInfo.owners.length} Required
                </span>
              </>
            )}
            {isDualRole && (
              <span className="vault-badge border-blue-600/50 text-blue-400 bg-blue-900/30">
                <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Guardian
              </span>
            )}
          </div>
        </div>
        {pendingCount > 0 && (
          <span className="flex-shrink-0 inline-flex items-center px-4 py-2 rounded-md text-base font-bold bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700/50 shadow-red-glow">
            <div className="w-2.5 h-2.5 rounded-full bg-primary-500 dark:bg-primary-400 mr-2.5 animate-pulse"></div>
            {pendingCount}
          </span>
        )}
      </div>

      <div className="vault-divider pt-4 mt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4.5">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Balance</span>
            {isRefetchingWalletInfo && (
              <div className="w-5 h-5 border border-primary-600 border-t-transparent rounded-full animate-spin"></div>
            )}
          </div>
          <span className={`text-xl font-display font-bold ${isGuardianRole ? 'text-blue-400' : 'text-gradient-red'}`}>
            {parseFloat(formatQuai(walletInfo.balance)).toFixed(3)}
            <span className="text-lg text-dark-500 ml-1">QUAI</span>
          </span>
        </div>
      </div>
    </Link>
  );
});
