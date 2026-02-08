import { useIndexerConnection } from '../hooks/useIndexerConnection';

/**
 * Displays the current indexer connection and sync status
 * Shows in the header to indicate real-time update availability
 */
export function SyncStatusBadge() {
  const { isConnected, isSynced, blocksBehind, isLoading, isEnabled } = useIndexerConnection();

  // Don't show anything if indexer is not configured
  if (!isEnabled) {
    return null;
  }

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-dark-500"
        title="Checking indexer connection..."
      >
        <div className="w-2 h-2 rounded-full bg-dark-500 animate-pulse" />
        <span className="hidden sm:inline">Connecting...</span>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400"
        title="Using blockchain directly (slower updates)"
      >
        <div className="w-2 h-2 rounded-full bg-yellow-500 dark:bg-yellow-400" />
        <span className="hidden sm:inline">Direct Mode</span>
      </div>
    );
  }

  if (!isSynced && blocksBehind !== null) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400"
        title={`Indexer is ${blocksBehind} blocks behind`}
      >
        <div className="w-2 h-2 rounded-full bg-yellow-500 dark:bg-yellow-400 animate-pulse" />
        <span className="hidden sm:inline">Syncing...</span>
        <span className="text-yellow-600/70 dark:text-yellow-500/70 hidden sm:inline">({blocksBehind} behind)</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400"
      title="Real-time updates enabled"
    >
      <div className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400" />
      <span className="hidden sm:inline">Live</span>
    </div>
  );
}
