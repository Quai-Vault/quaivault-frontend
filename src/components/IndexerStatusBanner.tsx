import { useIndexerConnection } from '../hooks/useIndexerConnection';
import { hasClockSkew, getClockSkewSeconds } from '../utils/clockSkew';

/**
 * Shows warning banners for:
 * 1. Indexer configured but unreachable
 * 2. Detected system clock skew (affects timelock/expiration displays)
 */
export function IndexerStatusBanner() {
  const { isEnabled, isConnected, isLoading } = useIndexerConnection();

  const showIndexerWarning = isEnabled && !isLoading && !isConnected;
  const showClockWarning = hasClockSkew();

  if (!showIndexerWarning && !showClockWarning) return null;

  return (
    <>
      {showIndexerWarning && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-md p-3 mb-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-yellow-400">Indexer Unavailable</p>
              <p className="text-xs text-yellow-500/80">
                Token balances and transaction history from the indexer are temporarily unavailable.
                On-chain data is still accessible.
              </p>
            </div>
          </div>
        </div>
      )}
      {showClockWarning && (
        <div className="bg-orange-900/20 border border-orange-700/50 rounded-md p-3 mb-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-orange-400">Clock Skew Detected</p>
              <p className="text-xs text-orange-500/80">
                Your system clock appears to be off by ~{Math.abs(Math.round(getClockSkewSeconds()))}s.
                Transaction timing displays (timelocks, expirations) may be inaccurate.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
