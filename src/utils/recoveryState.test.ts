import { describe, it, expect } from 'vitest';
import { isRecoveryEffectivelyExpired, getEffectiveRecoveryStatus } from './recoveryState';

const NOW = Math.floor(Date.now() / 1000);
const PAST = NOW - 3600;
const FUTURE = NOW + 3600;

describe('isRecoveryEffectivelyExpired', () => {
  it('flags a pending recovery past its deadline', () => {
    expect(isRecoveryEffectivelyExpired({ status: 'pending', expiration: PAST })).toBe(true);
  });

  it('leaves a pending recovery before its deadline alone', () => {
    expect(isRecoveryEffectivelyExpired({ status: 'pending', expiration: FUTURE })).toBe(false);
  });

  it('treats expiration 0 as no expiry', () => {
    expect(isRecoveryEffectivelyExpired({ status: 'pending', expiration: 0 })).toBe(false);
  });

  it('treats a null expiration as no expiry', () => {
    expect(isRecoveryEffectivelyExpired({ status: 'pending', expiration: null })).toBe(false);
  });

  it('assumes pending when status is omitted', () => {
    expect(isRecoveryEffectivelyExpired({ expiration: PAST })).toBe(true);
  });

  // cancelRecovery deletes the on-chain struct, so the stored status is the only
  // record that it happened — the clock must never overwrite it.
  it.each(['executed', 'cancelled', 'invalidated', 'expired'])(
    'never rewrites terminal status %s',
    (status) => {
      expect(isRecoveryEffectivelyExpired({ status, expiration: PAST })).toBe(false);
    }
  );
});

describe('getEffectiveRecoveryStatus', () => {
  it('rewrites a past-deadline pending recovery to expired', () => {
    expect(getEffectiveRecoveryStatus({ status: 'pending', expiration: PAST })).toBe('expired');
  });

  it('passes through a live pending recovery', () => {
    expect(getEffectiveRecoveryStatus({ status: 'pending', expiration: FUTURE })).toBe('pending');
  });

  it.each(['executed', 'cancelled', 'invalidated', 'expired'] as const)(
    'passes through stored status %s unchanged',
    (status) => {
      expect(getEffectiveRecoveryStatus({ status, expiration: PAST })).toBe(status);
    }
  );

  it('falls back to pending for an unrecognized status', () => {
    expect(getEffectiveRecoveryStatus({ status: 'bogus', expiration: 0 })).toBe('pending');
  });
});
