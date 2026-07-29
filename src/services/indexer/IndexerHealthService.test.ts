import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexerHealthService } from './IndexerHealthService';

const { config } = vi.hoisted(() => ({
  config: { ENABLED: true, HEALTH_URL: 'https://indexer.example', HEALTH_CACHE_MS: 5000 },
}));

vi.mock('../../config/supabase', () => ({ INDEXER_CONFIG: config }));

const NOW = 1_700_000_000_000;

describe('IndexerHealthService', () => {
  let service: IndexerHealthService;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    config.ENABLED = true;
    service = new IndexerHealthService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const health = (body: unknown, ok = true) => ({
    ok,
    status: ok ? 200 : 503,
    json: async () => body,
  });

  describe('availability', () => {
    it('is available when the indexer reports healthy', async () => {
      fetchMock.mockResolvedValue(health({ status: 'healthy' }));

      expect(await service.isAvailable()).toBe(true);
    });

    it('is unavailable for any status other than healthy', async () => {
      fetchMock.mockResolvedValue(health({ status: 'degraded' }));

      expect(await service.isAvailable()).toBe(false);
    });

    it('is unavailable on a non-ok response', async () => {
      fetchMock.mockResolvedValue(health({ status: 'healthy' }, false));

      expect(await service.isAvailable()).toBe(false);
    });

    it('is unavailable when the request fails outright', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      expect(await service.isAvailable()).toBe(false);
    });

    it('is unavailable without querying when the indexer is not configured', async () => {
      config.ENABLED = false;

      expect(await service.isAvailable()).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('strips a trailing slash rather than requesting a doubled path', async () => {
      config.HEALTH_URL = 'https://indexer.example/';
      fetchMock.mockResolvedValue(health({ status: 'healthy' }));

      await service.getStatus();

      expect(fetchMock).toHaveBeenCalledWith('https://indexer.example/health', expect.anything());
      config.HEALTH_URL = 'https://indexer.example';
    });
  });

  describe('sync state', () => {
    it('is synced when not syncing and close to the head', async () => {
      fetchMock.mockResolvedValue(
        health({ status: 'healthy', details: { isSyncing: false, blocksBehind: 2 } })
      );

      const status = await service.getStatus();

      expect(status.synced).toBe(true);
      expect(status.blocksBehind).toBe(2);
    });

    it('is not synced while the indexer reports syncing', async () => {
      fetchMock.mockResolvedValue(
        health({ status: 'healthy', details: { isSyncing: true, blocksBehind: 3 } })
      );

      expect((await service.getStatus()).synced).toBe(false);
    });

    it('is not synced once it falls ten blocks behind', async () => {
      fetchMock.mockResolvedValue(
        health({ status: 'healthy', details: { isSyncing: false, blocksBehind: 10 } })
      );

      expect((await service.getStatus()).synced).toBe(false);
    });

    // The block count is reported separately from the synced flag, and may be
    // absent even while the indexer says it is syncing.
    it('reports an unknown block count as null while still marking it unsynced', async () => {
      fetchMock.mockResolvedValue(health({ status: 'healthy', details: { isSyncing: true } }));

      const status = await service.getStatus();

      expect(status.synced).toBe(false);
      expect(status.blocksBehind).toBeNull();
    });

    it('assumes synced when the response carries no details at all', async () => {
      fetchMock.mockResolvedValue(health({ status: 'healthy' }));

      const status = await service.getStatus();

      expect(status.synced).toBe(true);
      expect(status.blocksBehind).toBeNull();
    });
  });

  describe('caching', () => {
    it('reuses a fresh result rather than re-querying', async () => {
      fetchMock.mockResolvedValue(health({ status: 'healthy' }));

      await service.getStatus();
      await service.getStatus();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('re-queries once the cache window has passed', async () => {
      fetchMock.mockResolvedValue(health({ status: 'healthy' }));

      await service.getStatus();
      vi.setSystemTime(NOW + config.HEALTH_CACHE_MS + 1);
      await service.getStatus();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // Caching a failure briefly is deliberate — it stops a down indexer being
    // hammered — but the window is short so recovery is picked up quickly.
    it('caches a failure only for the same short window', async () => {
      fetchMock.mockRejectedValue(new Error('down'));
      expect(await service.isAvailable()).toBe(false);

      fetchMock.mockResolvedValue(health({ status: 'healthy' }));
      expect(await service.isAvailable()).toBe(false);

      vi.setSystemTime(NOW + config.HEALTH_CACHE_MS + 1);
      expect(await service.isAvailable()).toBe(true);
    });

    it('re-queries immediately once the cache is invalidated', async () => {
      fetchMock.mockResolvedValue(health({ status: 'healthy' }));
      await service.getStatus();

      service.invalidateCache();
      await service.getStatus();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
