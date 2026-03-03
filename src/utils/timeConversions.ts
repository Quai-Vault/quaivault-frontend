export type DelayUnit = 'minutes' | 'hours' | 'days';

const UNIT_MULTIPLIERS: Record<DelayUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

/**
 * Convert the expiration datetime-local string to a unix timestamp (seconds).
 * Returns undefined if empty or invalid.
 */
export function expirationToTimestamp(expiration: string): number | undefined {
  if (!expiration) return undefined;
  const ts = new Date(expiration).getTime();
  if (isNaN(ts)) return undefined;
  return Math.floor(ts / 1000);
}

/**
 * Convert the execution delay value + unit to seconds.
 * Returns undefined if empty or zero.
 */
export function delayToSeconds(value: string, unit: DelayUnit): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  if (isNaN(num) || num <= 0) return undefined;
  return Math.round(num * UNIT_MULTIPLIERS[unit]);
}
