/**
 * Common formatting utilities
 */

/** Zero address constant for null transaction detection */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Format an address for display (truncated with ellipsis)
 * @param address - Full address string
 * @param prefixLength - Characters to show at start (default: 6)
 * @param suffixLength - Characters to show at end (default: 4)
 */
export function formatAddress(
  address: string,
  prefixLength = 6,
  suffixLength = 4
): string {
  if (!address || address.length < prefixLength + suffixLength + 3) {
    return address;
  }
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
}

/**
 * Check if a transaction is null/not found (to address is zero address)
 * @param toAddress - The transaction destination address
 */
export function isNullTransaction(toAddress: string): boolean {
  return toAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
}

/**
 * Format a Unix timestamp for display
 * @param timestamp - Unix timestamp in seconds
 */
export function formatTimestamp(timestamp: number | bigint): string {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts === 0) {
    return 'Unknown';
  }
  const date = new Date(ts * 1000);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Format an ISO date string for display
 * @param isoString - ISO 8601 date string (e.g., from database created_at)
 */
export function formatDateString(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Format a duration in seconds to a human-readable string.
 * Examples: "2h 30m", "7 days", "30s", "1d 6h"
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 && days === 0) parts.push(`${secs}s`); // skip seconds for multi-day durations

  return parts.join(' ') || '0s';
}

/**
 * Format a unix timestamp as a relative expiration string.
 * Examples: "Expires in 2h 15m", "Expired 5m ago"
 */
export function formatExpiration(timestamp: number): string {
  if (timestamp === 0) return 'No expiration';
  const now = Date.now() / 1000;
  const diff = timestamp - now;
  if (diff <= 0) {
    return `Expired ${formatDuration(Math.abs(Math.ceil(diff)))} ago`;
  }
  return `Expires in ${formatDuration(Math.ceil(diff))}`;
}

/**
 * Format a wallet's timelock setting for display.
 * Examples: "No timelock", "1h minimum delay", "7d minimum delay"
 */
export function formatTimelockSetting(seconds: number): string {
  if (seconds <= 0) return 'No timelock';
  return `${formatDuration(seconds)} minimum delay`;
}