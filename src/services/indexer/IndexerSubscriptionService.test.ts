import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexerSubscriptionService } from './IndexerSubscriptionService';

const WALLET = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const HASH = '0x' + 'a'.repeat(64);

/**
 * A stand-in for a Supabase realtime channel.
 *
 * `.on()` records each postgres_changes binding so a test can fire a payload at
 * the right one, and `.subscribe()` captures the status callback so a test can
 * drive SUBSCRIBED / CHANNEL_ERROR / CLOSED itself.
 */
type Binding = { event: string; table: string; filter?: string; handler: (p: unknown) => void };

function createChannelFactory() {
  const channels: {
    name: string;
    bindings: Binding[];
    setStatus: (status: string) => void;
  }[] = [];

  const channel = vi.fn((name: string) => {
    const bindings: Binding[] = [];
    let statusCallback: ((status: string) => void) | null = null;

    const api = {
      on: vi.fn((_type: string, config: Record<string, string>, handler: (p: unknown) => void) => {
        bindings.push({ event: config.event, table: config.table, filter: config.filter, handler });
        return api;
      }),
      subscribe: vi.fn((cb: (status: string) => void) => {
        statusCallback = cb;
        return api;
      }),
    };

    channels.push({
      name,
      bindings,
      setStatus: (status: string) => statusCallback?.(status),
    });
    return api;
  });

  return { channel, channels, removeChannel: vi.fn() };
}

const { client } = vi.hoisted(() => ({ client: { current: null as unknown } }));

vi.mock('../../config/supabase', () => ({
  get supabase() {
    return client.current;
  },
  INDEXER_CONFIG: { ENABLED: true, SCHEMA: 'public' },
}));

const transactionRow = () => ({
  id: '1',
  wallet_address: WALLET.toLowerCase(),
  tx_hash: HASH,
  to_address: WALLET.toLowerCase(),
  value: '0',
  data: '0x',
  transaction_type: 'transfer',
  decoded_params: null,
  status: 'pending',
  confirmation_count: 0,
  submitted_by: WALLET.toLowerCase(),
  submitted_at_block: 1,
  submitted_at_tx: HASH,
  executed_at_block: null,
  executed_at_tx: null,
  executed_by: null,
  cancelled_at_block: null,
  cancelled_at_tx: null,
  expiration: 0,
  execution_delay: 0,
  approved_at: 0,
  executable_after: 0,
  is_expired: false,
  failed_return_data: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('IndexerSubscriptionService', () => {
  let factory: ReturnType<typeof createChannelFactory>;
  let service: IndexerSubscriptionService;

  beforeEach(() => {
    vi.useFakeTimers();
    factory = createChannelFactory();
    client.current = factory;
    service = new IndexerSubscriptionService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const latest = () => factory.channels[factory.channels.length - 1];

  describe('subscribing', () => {
    it('opens a channel and counts it as active', () => {
      service.subscribeToTransactions(WALLET, {});

      expect(factory.channel).toHaveBeenCalledTimes(1);
      expect(service.getActiveSubscriptionCount()).toBe(1);
    });

    // Two views of the same vault must not collide on one channel name, or the
    // second would silently replace the first.
    it('gives each subscription a distinct channel name', () => {
      service.subscribeToTransactions(WALLET, {});
      service.subscribeToTransactions(WALLET, {});

      const [first, second] = factory.channels;
      expect(first.name).not.toBe(second.name);
      expect(service.getActiveSubscriptionCount()).toBe(2);
    });

    // A wrong filter would deliver another vault's transactions.
    it('filters to the wallet, lowercased', () => {
      service.subscribeToTransactions(WALLET, {});

      latest().bindings.forEach((binding) => {
        expect(binding.filter).toBe(`wallet_address=eq.${WALLET.toLowerCase()}`);
      });
    });

    it('listens for both inserts and updates', () => {
      service.subscribeToTransactions(WALLET, {});

      expect(latest().bindings.map((b) => b.event).sort()).toEqual(['INSERT', 'UPDATE']);
    });

    it('subscribes to bounded module execution activity for the selected wallet', () => {
      service.subscribeToModuleExecutions(WALLET, {});

      expect(latest().bindings).toEqual([
        expect.objectContaining({
          event: 'INSERT',
          table: 'module_executions',
          filter: `wallet_address=eq.${WALLET.toLowerCase()}`,
        }),
      ]);
    });
  });

  describe('payload handling', () => {
    const fire = (event: string, row: unknown) => {
      const binding = latest().bindings.find((b) => b.event === event);
      binding?.handler({ new: row });
    };

    it('delivers a valid insert', () => {
      const onInsert = vi.fn();
      service.subscribeToTransactions(WALLET, { onInsert });

      fire('INSERT', transactionRow());

      expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ tx_hash: HASH }));
    });

    it('delivers a valid module execution insert', () => {
      const onInsert = vi.fn();
      service.subscribeToModuleExecutions(WALLET, { onInsert });
      fire('INSERT', {
        id: 'execution-1',
        wallet_address: WALLET.toLowerCase(),
        module_address: WALLET.toLowerCase(),
        success: true,
        operation_type: null,
        to_address: null,
        value: null,
        data_hash: null,
        executed_at_block: 42,
        executed_at_tx: HASH,
        log_index: 3,
        created_at: '2026-08-16T00:00:00Z',
      });

      expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ log_index: 3, success: true }));
    });

    it('delivers a valid update', () => {
      const onUpdate = vi.fn();
      service.subscribeToTransactions(WALLET, { onUpdate });

      fire('UPDATE', transactionRow());

      expect(onUpdate).toHaveBeenCalled();
    });

    // A row the schema rejects must be reported, not passed on as though it
    // were a transaction.
    it('reports a malformed payload instead of delivering it', () => {
      const onInsert = vi.fn();
      const onError = vi.fn();
      service.subscribeToTransactions(WALLET, { onInsert, onError });

      fire('INSERT', { nonsense: true });

      expect(onInsert).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/Invalid transaction payload/) }));
    });
  });

  describe('reconnection', () => {
    it('does not report a first successful subscribe as a reconnect', () => {
      const onReconnect = vi.fn();
      service.subscribeToTransactions(WALLET, { onReconnect });

      latest().setStatus('SUBSCRIBED');

      expect(onReconnect).not.toHaveBeenCalled();
    });

    it('retries after a channel error', () => {
      service.subscribeToTransactions(WALLET, {});
      expect(factory.channel).toHaveBeenCalledTimes(1);

      latest().setStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(1000);

      expect(factory.channel).toHaveBeenCalledTimes(2);
    });

    it('backs off exponentially between attempts', () => {
      service.subscribeToTransactions(WALLET, {});

      latest().setStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(999);
      expect(factory.channel).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(factory.channel).toHaveBeenCalledTimes(2);

      latest().setStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(1999);
      expect(factory.channel).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1);
      expect(factory.channel).toHaveBeenCalledTimes(3);
    });

    it('treats a timeout the same as an error', () => {
      service.subscribeToTransactions(WALLET, {});

      latest().setStatus('TIMED_OUT');
      vi.advanceTimersByTime(1000);

      expect(factory.channel).toHaveBeenCalledTimes(2);
    });

    // Two errors before the retry fires must not schedule two retries, or the
    // channel count doubles on every blip.
    it('schedules only one retry per channel', () => {
      service.subscribeToTransactions(WALLET, {});

      latest().setStatus('CHANNEL_ERROR');
      latest().setStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(10_000);

      expect(factory.channel).toHaveBeenCalledTimes(2);
    });

    it('reports a reconnect once the retry subscribes', () => {
      const onReconnect = vi.fn();
      service.subscribeToTransactions(WALLET, { onReconnect });

      latest().setStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(1000);
      latest().setStatus('SUBSCRIBED');

      expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('does not report a reconnect twice for one recovery', () => {
      const onReconnect = vi.fn();
      service.subscribeToTransactions(WALLET, { onReconnect });

      latest().setStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(1000);
      latest().setStatus('SUBSCRIBED');
      latest().setStatus('SUBSCRIBED');

      expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('gives up after the attempt limit and says so', () => {
      const onError = vi.fn();
      service.subscribeToTransactions(WALLET, { onError });

      // Five retries, each after a longer delay, then one more failure.
      for (let i = 0; i < 5; i++) {
        latest().setStatus('CHANNEL_ERROR');
        vi.advanceTimersByTime(1000 * 2 ** i);
      }
      latest().setStatus('CHANNEL_ERROR');

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringMatching(/Failed to reconnect/) })
      );
      expect(service.getActiveSubscriptionCount()).toBe(0);
    });

    it('forgets the failure count once a subscribe succeeds', () => {
      service.subscribeToTransactions(WALLET, {});

      latest().setStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(1000);
      latest().setStatus('SUBSCRIBED');

      // Back to the first delay rather than continuing the previous backoff.
      latest().setStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(1000);

      expect(factory.channel).toHaveBeenCalledTimes(3);
    });
  });

  describe('teardown', () => {
    it('removes the channel and stops counting it', () => {
      const unsubscribe = service.subscribeToTransactions(WALLET, {});

      unsubscribe();

      expect(factory.removeChannel).toHaveBeenCalled();
      expect(service.getActiveSubscriptionCount()).toBe(0);
    });

    // A retry already scheduled would otherwise fire after teardown and open a
    // channel nobody is listening to.
    it('cancels a pending retry so no channel is resurrected', () => {
      const unsubscribe = service.subscribeToTransactions(WALLET, {});

      latest().setStatus('CHANNEL_ERROR');
      unsubscribe();
      vi.advanceTimersByTime(10_000);

      expect(factory.channel).toHaveBeenCalledTimes(1);
      expect(service.getActiveSubscriptionCount()).toBe(0);
    });

    it('cancels a pending retry when the channel closes', () => {
      service.subscribeToTransactions(WALLET, {});

      latest().setStatus('CHANNEL_ERROR');
      latest().setStatus('CLOSED');
      vi.advanceTimersByTime(10_000);

      expect(factory.channel).toHaveBeenCalledTimes(1);
    });

    it('is safe to unsubscribe twice', () => {
      const unsubscribe = service.subscribeToTransactions(WALLET, {});

      unsubscribe();
      unsubscribe();

      expect(factory.removeChannel).toHaveBeenCalledTimes(1);
    });

    it('unsubscribeAll clears every channel and pending retry', () => {
      service.subscribeToTransactions(WALLET, {});
      service.subscribeToConfirmations(WALLET, {});
      latest().setStatus('CHANNEL_ERROR');

      service.unsubscribeAll();
      vi.advanceTimersByTime(10_000);

      expect(service.getActiveSubscriptionCount()).toBe(0);
      expect(factory.removeChannel).toHaveBeenCalledTimes(2);
      expect(factory.channel).toHaveBeenCalledTimes(2);
    });
  });
});
