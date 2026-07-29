import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionManager } from './SubscriptionManager';
import type { WalletSubscriptionCallbacks } from './SubscriptionManager';

const MAX_SUBSCRIPTIONS = 3;

vi.mock('../../config/supabase', () => ({
  INDEXER_CONFIG: { MAX_SUBSCRIPTIONS: 3, ENABLED: true },
}));

/**
 * A stand-in for IndexerSubscriptionService. Each subscribe call hands back a
 * distinct unsubscribe spy, so a test can tell exactly which channels were
 * torn down for which wallet.
 */
function createSubscriptionService() {
  const unsubscribers: Record<string, ReturnType<typeof vi.fn>[]> = {};

  const makeSubscribe = () =>
    vi.fn((walletAddress: string) => {
      const unsub = vi.fn();
      (unsubscribers[walletAddress] ??= []).push(unsub);
      return unsub;
    });

  return {
    subscribeToTransactions: makeSubscribe(),
    subscribeToConfirmations: makeSubscribe(),
    subscribeToDeposits: makeSubscribe(),
    subscribeToWalletModules: makeSubscribe(),
    subscribeToWalletOwners: makeSubscribe(),
    subscribeToSocialRecoveries: makeSubscribe(),
    subscribeToRecoveryApprovals: makeSubscribe(),
    subscribeToTokenTransfers: makeSubscribe(),
    unsubscribers,
  };
}

type Service = ReturnType<typeof createSubscriptionService>;

const address = (n: number) => `0x${String(n).repeat(40).slice(0, 40)}`;

/** Callbacks covering enough channels to exercise subscribe/teardown. */
const callbacks = (over: Partial<WalletSubscriptionCallbacks> = {}): WalletSubscriptionCallbacks => ({
  onTransactionInsert: vi.fn(),
  onConfirmationInsert: vi.fn(),
  ...over,
});

describe('SubscriptionManager', () => {
  let service: Service;
  let manager: SubscriptionManager;

  beforeEach(() => {
    service = createSubscriptionService();
    manager = new SubscriptionManager(service as never);
  });

  describe('activating a wallet', () => {
    it('subscribes and reports the wallet active', () => {
      manager.activateWallet(address(1), callbacks());

      expect(manager.isWalletActive(address(1))).toBe(true);
      expect(manager.getActiveWalletCount()).toBe(1);
      expect(service.subscribeToTransactions).toHaveBeenCalledTimes(1);
    });

    it('normalises the address, so casing cannot double-subscribe', () => {
      manager.activateWallet('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', callbacks());

      expect(manager.isWalletActive('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
      expect(manager.getActiveWalletCount()).toBe(1);
    });

    // Re-entering a wallet already being watched must not open a second set of
    // channels, which would leak and deliver every event twice.
    it('is idempotent for an already-active wallet', () => {
      manager.activateWallet(address(1), callbacks());
      manager.activateWallet(address(1), callbacks());

      expect(service.subscribeToTransactions).toHaveBeenCalledTimes(1);
      expect(manager.getActiveWalletCount()).toBe(1);
    });

    it('only opens channels for the callbacks it was given', () => {
      manager.activateWallet(address(1), { onTransactionInsert: vi.fn() });

      expect(service.subscribeToTransactions).toHaveBeenCalled();
      expect(service.subscribeToConfirmations).not.toHaveBeenCalled();
    });
  });

  describe('eviction at the subscription limit', () => {
    const fill = () => {
      for (let i = 1; i <= MAX_SUBSCRIPTIONS; i++) {
        manager.activateWallet(address(i), callbacks());
      }
    };

    it('never exceeds the limit', () => {
      fill();
      manager.activateWallet(address(MAX_SUBSCRIPTIONS + 1), callbacks());

      expect(manager.getActiveWalletCount()).toBe(MAX_SUBSCRIPTIONS);
    });

    it('drops the oldest wallet rather than the newest', () => {
      fill();
      manager.activateWallet(address(MAX_SUBSCRIPTIONS + 1), callbacks());

      expect(manager.isWalletActive(address(1))).toBe(false);
      expect(manager.isWalletActive(address(MAX_SUBSCRIPTIONS))).toBe(true);
      expect(manager.isWalletActive(address(MAX_SUBSCRIPTIONS + 1))).toBe(true);
    });

    it('tears down the evicted wallet’s channels', () => {
      fill();
      const evictedUnsubs = service.unsubscribers[address(1)];

      manager.activateWallet(address(MAX_SUBSCRIPTIONS + 1), callbacks());

      expect(evictedUnsubs.length).toBeGreaterThan(0);
      evictedUnsubs.forEach((unsub) => expect(unsub).toHaveBeenCalled());
    });

    // The evicted view needs to know it has gone stale, so it can fall back to
    // polling rather than silently showing data that no longer updates.
    it('notifies the evicted wallet before tearing it down', () => {
      const onEvicted = vi.fn();
      manager.activateWallet(address(1), callbacks({ onEvicted }));
      for (let i = 2; i <= MAX_SUBSCRIPTIONS; i++) {
        manager.activateWallet(address(i), callbacks());
      }

      manager.activateWallet(address(MAX_SUBSCRIPTIONS + 1), callbacks());

      expect(onEvicted).toHaveBeenCalledWith(address(1));
    });

    it('does not notify wallets that were not evicted', () => {
      const onEvicted = vi.fn();
      manager.activateWallet(address(1), callbacks());
      manager.activateWallet(address(2), callbacks({ onEvicted }));
      for (let i = 3; i <= MAX_SUBSCRIPTIONS; i++) {
        manager.activateWallet(address(i), callbacks());
      }

      manager.activateWallet(address(MAX_SUBSCRIPTIONS + 1), callbacks());

      expect(onEvicted).not.toHaveBeenCalled();
    });
  });

  describe('deactivating a wallet', () => {
    it('unsubscribes every channel it opened', () => {
      manager.activateWallet(address(1), callbacks());
      const unsubs = service.unsubscribers[address(1)];

      manager.deactivateWallet(address(1));

      unsubs.forEach((unsub) => expect(unsub).toHaveBeenCalledTimes(1));
      expect(manager.isWalletActive(address(1))).toBe(false);
    });

    it('leaves other wallets subscribed', () => {
      manager.activateWallet(address(1), callbacks());
      manager.activateWallet(address(2), callbacks());

      manager.deactivateWallet(address(1));

      expect(manager.isWalletActive(address(2))).toBe(true);
      service.unsubscribers[address(2)].forEach((u) => expect(u).not.toHaveBeenCalled());
    });

    it('is safe to call for a wallet that was never active', () => {
      expect(() => manager.deactivateWallet(address(9))).not.toThrow();
    });

    it('is safe to call twice', () => {
      manager.activateWallet(address(1), callbacks());
      const unsubs = service.unsubscribers[address(1)];

      manager.deactivateWallet(address(1));
      manager.deactivateWallet(address(1));

      unsubs.forEach((unsub) => expect(unsub).toHaveBeenCalledTimes(1));
    });

    // One channel failing to close must not strand the rest.
    it('keeps tearing down after an unsubscribe throws', () => {
      manager.activateWallet(address(1), callbacks());
      const unsubs = service.unsubscribers[address(1)];
      unsubs[0].mockImplementation(() => {
        throw new Error('channel already closed');
      });

      expect(() => manager.deactivateWallet(address(1))).not.toThrow();
      expect(unsubs[unsubs.length - 1]).toHaveBeenCalled();
    });

    it('frees a slot so a new wallet can subscribe', () => {
      for (let i = 1; i <= MAX_SUBSCRIPTIONS; i++) {
        manager.activateWallet(address(i), callbacks());
      }

      manager.deactivateWallet(address(2));
      manager.activateWallet(address(99), callbacks());

      expect(manager.getActiveWalletCount()).toBe(MAX_SUBSCRIPTIONS);
      expect(manager.isWalletActive(address(1))).toBe(true);
      expect(manager.isWalletActive(address(99))).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('unsubscribes everything and empties the manager', () => {
      manager.activateWallet(address(1), callbacks());
      manager.activateWallet(address(2), callbacks());
      const all = [...service.unsubscribers[address(1)], ...service.unsubscribers[address(2)]];

      manager.cleanup();

      all.forEach((unsub) => expect(unsub).toHaveBeenCalled());
      expect(manager.getActiveWalletCount()).toBe(0);
    });

    it('keeps going when an unsubscribe throws', () => {
      manager.activateWallet(address(1), callbacks());
      manager.activateWallet(address(2), callbacks());
      service.unsubscribers[address(1)][0].mockImplementation(() => {
        throw new Error('already closed');
      });

      expect(() => manager.cleanup()).not.toThrow();
      expect(manager.getActiveWalletCount()).toBe(0);
      service.unsubscribers[address(2)].forEach((u) => expect(u).toHaveBeenCalled());
    });

    it('is safe on an empty manager', () => {
      expect(() => manager.cleanup()).not.toThrow();
    });
  });
});
