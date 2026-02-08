import { IndexerWalletService } from './IndexerWalletService';
import { IndexerTransactionService } from './IndexerTransactionService';
import { IndexerModuleService } from './IndexerModuleService';
import { IndexerSubscriptionService } from './IndexerSubscriptionService';
import { IndexerHealthService, type HealthStatus } from './IndexerHealthService';
import { SubscriptionManager } from './SubscriptionManager';

export class IndexerService {
  readonly wallet: IndexerWalletService;
  readonly transaction: IndexerTransactionService;
  readonly module: IndexerModuleService;
  readonly subscription: IndexerSubscriptionService;
  readonly health: IndexerHealthService;
  readonly subscriptionManager: SubscriptionManager;

  constructor() {
    this.health = new IndexerHealthService();
    this.wallet = new IndexerWalletService();
    this.transaction = new IndexerTransactionService();
    this.module = new IndexerModuleService();
    this.subscription = new IndexerSubscriptionService();
    this.subscriptionManager = new SubscriptionManager(this.subscription);
  }

  async isAvailable(): Promise<boolean> {
    return this.health.isAvailable();
  }

  async getHealthStatus(): Promise<HealthStatus> {
    return this.health.getStatus();
  }

  /**
   * Cleanup all subscriptions and connections
   * Should be called on logout or app unmount
   */
  cleanup(): void {
    this.subscriptionManager.cleanup();
    this.subscription.unsubscribeAll();
  }
}

// Singleton instance
export const indexerService = new IndexerService();
