/**
 * Common formatting utilities
 */
import { formatQuai as formatQuaiImport, formatUnits } from 'quais';

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
 * Format a token balance for display.
 * Whole numbers render with no decimals ("1"); fractional values render with
 * up to 3 decimal places and trailing zeros trimmed ("1.5", "1.234").
 * Non-zero values below the 3-decimal threshold show "<0.001".
 *
 * @param wei      Raw amount as a bigint or decimal-string in base units.
 * @param decimals Token decimals (default 18 for QUAI).
 */
export function formatBalance(wei: bigint | string, decimals = 18): string {
  let val: number;
  try {
    const big = typeof wei === 'string' ? BigInt(wei) : wei;
    val = parseFloat(formatUnits(big, decimals));
  } catch {
    return '0';
  }
  if (!Number.isFinite(val) || val === 0) return '0';
  if (Number.isInteger(val)) return val.toString();
  if (val > 0 && val < 0.001) return '<0.001';
  if (val < 0 && val > -0.001) return '>-0.001';
  return val.toFixed(3).replace(/\.?0+$/, '');
}

/**
 * Format a QUAI balance compactly for space-constrained UI (e.g. sidebar).
 * Abbreviates large values: 1,234,567.89 → "1.23M", 45,678 → "45.7K".
 * Values under 1000 delegate to formatBalance for consistent decimal handling.
 */
export function formatCompactBalance(weiString: string): string {
  const val = parseFloat(formatQuaiImport(weiString));
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 10_000) return `${(val / 1_000).toFixed(1)}K`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(2)}K`;
  return formatBalance(weiString);
}

/**
 * Format a Unix timestamp as a human-friendly relative time string.
 * Examples: "just now", "5m ago", "3h ago", "2d ago"
 * Falls back to formatTimestamp for dates older than 7 days.
 */
export function formatRelativeTime(timestamp: number | bigint): string {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts === 0) return 'Unknown';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatTimestamp(ts);
}

/**
 * Format a wallet's timelock setting for display.
 * Examples: "No timelock", "1h minimum delay", "7d minimum delay"
 */
export function formatTimelockSetting(seconds: number): string {
  if (seconds <= 0) return 'No timelock';
  return `${formatDuration(seconds)} minimum delay`;
}