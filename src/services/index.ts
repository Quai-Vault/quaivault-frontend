/**
 * Service exports for the Quai Multisig application
 *
 * Usage patterns:
 *
 * 1. **Indexer-first reads** - Use multisigService methods for reads that
 *    benefit from faster indexer responses with blockchain fallback:
 *    ```typescript
 *    import { multisigService } from '../services';
 *    const info = await multisigService.getWalletInfo(address);
 *    const pending = await multisigService.getPendingTransactions(address);
 *    ```
 *
 * 2. **Direct service access** - For writes and operations that don't need
 *    indexer optimization, access services via multisigService:
 *    ```typescript
 *    import { multisigService } from '../services';
 *    await multisigService.transaction.approveTransaction(address, hash);
 *    await multisigService.owner.addOwner(address, newOwner);
 *    await multisigService.wallet.deployWallet(config);
 *    ```
 */

// Main facade - use this for most operations
export { multisigService, MultisigService } from './MultisigService';

// Re-export types
export type { RecoveryConfig, Recovery, PendingRecovery } from './modules/SocialRecoveryModuleService';

// Re-export service classes for custom instantiation (rare use case)
export { WalletService } from './core/WalletService';
export { TransactionService } from './core/TransactionService';
export { OwnerService } from './core/OwnerService';
export { WhitelistModuleService } from './modules/WhitelistModuleService';
export { DailyLimitModuleService } from './modules/DailyLimitModuleService';
export { SocialRecoveryModuleService } from './modules/SocialRecoveryModuleService';

// Re-export indexer service
export { indexerService } from './indexer';

// Re-export utility services
export { transactionBuilderService } from './TransactionBuilderService';
