import { INDEXER_CONFIG } from '../../config/supabase';

export interface HealthStatus {
  available: boolean;
  synced: boolean;
  blocksBehind: number | null;
  lastChecked: number;
}

export class IndexerHealthService {
  private cache: HealthStatus | null = null;

  async isAvailable(): Promise<boolean> {
    const status = await this.getStatus();
    return status.available;
  }

  async getStatus(): Promise<HealthStatus> {
    // Return cached result if fresh
    if (this.cache && Date.now() - this.cache.lastChecked < INDEXER_CONFIG.HEALTH_CACHE_MS) {
      return this.cache;
    }

    // If indexer is not configured, return unavailable
    if (!INDEXER_CONFIG.ENABLED) {
      this.cache = {
        available: false,
        synced: false,
        blocksBehind: null,
        lastChecked: Date.now(),
      };
      return this.cache;
    }

    try {
      // Remove trailing slash to avoid double slashes in URL
      const baseUrl = INDEXER_CONFIG.HEALTH_URL.replace(/\/+$/, '');
      const healthUrl = `${baseUrl}/health`;

      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(5000),
      });

      // Validate HTTP status before parsing response
      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }

      const data = await response.json();

      this.cache = {
        available: data.status === 'healthy',
        synced: !data.details?.isSyncing && (data.details?.blocksBehind ?? 0) < 10,
        blocksBehind: data.details?.blocksBehind ?? null,
        lastChecked: Date.now(),
      };
    } catch {
      this.cache = {
        available: false,
        synced: false,
        blocksBehind: null,
        lastChecked: Date.now(),
      };
    }

    return this.cache;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}
