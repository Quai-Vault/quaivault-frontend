/**
 * Utility functions for block time calculations
 * Quai Network block time: ~5 seconds per block
 */

const SECONDS_PER_BLOCK = 5;
const BLOCK_RANGE_LIMIT = 5000;

/**
 * Calculate the time period covered by a block range
 * @param blocks Number of blocks
 * @param blockTimeSeconds Block time in seconds (default: 5 for Quai Network)
 * @returns Time period in milliseconds
 */
export function blocksToMilliseconds(blocks: number, blockTimeSeconds: number = SECONDS_PER_BLOCK): number {
  return blocks * blockTimeSeconds * 1000;
}

/**
 * Format a time period in a human-readable way
 * @param milliseconds Time period in milliseconds
 * @returns Formatted string (e.g., "7 hours", "2 days")
 */
export function formatTimePeriod(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.round(minutes / 60); // Round to nearest hour for better UX
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
}

/**
 * Get the time period covered by the current block range limit
 * @returns Formatted time period string
 */
export function getBlockRangeTimePeriod(): string {
  const milliseconds = blocksToMilliseconds(BLOCK_RANGE_LIMIT);
  return formatTimePeriod(milliseconds);
}

/**
 * Get the block range limit constant
 */
export function getBlockRangeLimit(): number {
  return BLOCK_RANGE_LIMIT;
}
