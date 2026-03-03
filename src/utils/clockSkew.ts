/**
 * Clock skew detection utility.
 * Compares client Date.now() against the latest blockchain block timestamp
 * to detect if the user's system clock is significantly off.
 *
 * This matters because transaction timelock/expiration calculations use
 * Date.now() and compare against on-chain timestamps.
 */

const SKEW_THRESHOLD_SECONDS = 60;

let clockOffsetSeconds = 0;
let hasDetected = false;

/**
 * Detect clock skew by comparing local time to a blockchain block timestamp.
 * Call this once after fetching a recent block.
 *
 * @param blockTimestampSeconds - The block's timestamp in seconds (from provider.getBlock())
 */
export function detectClockSkew(blockTimestampSeconds: number): void {
  const localNowSeconds = Date.now() / 1000;
  clockOffsetSeconds = localNowSeconds - blockTimestampSeconds;
  hasDetected = true;
}

/**
 * Get the current time in seconds, adjusted for detected clock skew.
 * Falls back to raw Date.now()/1000 if no skew has been detected yet.
 */
export function getAdjustedNowSeconds(): number {
  if (!hasDetected) return Date.now() / 1000;
  // Subtract the offset to get time aligned with blockchain
  return Date.now() / 1000 - clockOffsetSeconds;
}

/**
 * Returns true if the detected clock skew exceeds the threshold.
 */
export function hasClockSkew(): boolean {
  return hasDetected && Math.abs(clockOffsetSeconds) > SKEW_THRESHOLD_SECONDS;
}

/**
 * Returns the raw clock offset in seconds (positive = client ahead of chain).
 */
export function getClockSkewSeconds(): number {
  return clockOffsetSeconds;
}
