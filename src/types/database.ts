import { z } from 'zod';

// ============ Core Tables ============

export const WalletSchema = z.object({
  id: z.string(),
  address: z.string(),
  name: z.string().nullable(),
  threshold: z.number(),
  owner_count: z.number(),
  created_at_block: z.number(),
  created_at_tx: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const WalletOwnerSchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  owner_address: z.string(),
  added_at_block: z.number(),
  added_at_tx: z.string(),
  removed_at_block: z.number().nullable(),
  removed_at_tx: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
});

export const TransactionSchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  tx_hash: z.string(),
  to_address: z.string(),
  value: z.string(), // BigInt as string
  data: z.string().nullable(),
  transaction_type: z.string(),
  decoded_params: z.record(z.unknown()).nullable(),
  status: z.enum(['pending', 'executed', 'cancelled']),
  confirmation_count: z.number(),
  submitted_by: z.string(),
  submitted_at_block: z.number(),
  submitted_at_tx: z.string(),
  executed_at_block: z.number().nullable(),
  executed_at_tx: z.string().nullable(),
  executed_by: z.string().nullable(),
  cancelled_at_block: z.number().nullable(),
  cancelled_at_tx: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ConfirmationSchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  tx_hash: z.string(),
  owner_address: z.string(),
  confirmed_at_block: z.number(),
  confirmed_at_tx: z.string(),
  revoked_at_block: z.number().nullable(),
  revoked_at_tx: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
});

export const DepositSchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  sender_address: z.string(),
  amount: z.string(), // BigInt as string
  deposited_at_block: z.number(),
  deposited_at_tx: z.string(),
  created_at: z.string(),
});

// ============ Module Tables ============

export const WalletModuleSchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  module_address: z.string(),
  enabled_at_block: z.number(),
  enabled_at_tx: z.string(),
  disabled_at_block: z.number().nullable(),
  disabled_at_tx: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const DailyLimitStateSchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  daily_limit: z.string(), // BigInt as string
  spent_today: z.string(), // BigInt as string
  last_reset_day: z.string(),
  updated_at: z.string(),
});

export const WhitelistEntrySchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  whitelisted_address: z.string(),
  limit_amount: z.string().nullable(), // BigInt as string
  added_at_block: z.number(),
  added_at_tx: z.string().nullable(),
  removed_at_block: z.number().nullable(),
  removed_at_tx: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
});

// ============ Social Recovery Tables ============

export const SocialRecoveryConfigSchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  threshold: z.number(),
  recovery_period: z.number(),
  setup_at_block: z.number(),
  setup_at_tx: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SocialRecoveryGuardianSchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  guardian_address: z.string(),
  added_at_block: z.number(),
  added_at_tx: z.string(),
  removed_at_block: z.number().nullable(),
  removed_at_tx: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
});

export const SocialRecoverySchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  recovery_hash: z.string(),
  new_owners: z.array(z.string()),
  new_threshold: z.number(),
  initiator_address: z.string(),
  approval_count: z.number(),
  required_threshold: z.number(),
  execution_time: z.number(),
  status: z.enum(['pending', 'executed', 'cancelled']),
  initiated_at_block: z.number(),
  initiated_at_tx: z.string(),
  executed_at_block: z.number().nullable(),
  executed_at_tx: z.string().nullable(),
  cancelled_at_block: z.number().nullable(),
  cancelled_at_tx: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const RecoveryApprovalSchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  recovery_hash: z.string(),
  guardian_address: z.string(),
  approved_at_block: z.number(),
  approved_at_tx: z.string(),
  revoked_at_block: z.number().nullable(),
  revoked_at_tx: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
});

// ============ Module Transaction Table ============

export const ModuleTransactionSchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  module_type: z.string(), // 'whitelist' | 'daily_limit'
  module_address: z.string(),
  to_address: z.string(),
  value: z.string(), // BigInt as string
  remaining_limit: z.string().nullable(), // Remaining daily limit after tx
  executed_at_block: z.number(),
  executed_at_tx: z.string(),
  created_at: z.string(),
});

// ============ Module Execution Table (Zodiac) ============

export const ModuleExecutionSchema = z.object({
  id: z.string(),
  wallet_address: z.string(),
  module_address: z.string(),
  success: z.boolean(),
  operation_type: z.number().nullable(),
  to_address: z.string().nullable(),
  value: z.string().nullable(),
  data_hash: z.string().nullable(),
  executed_at_block: z.number(),
  executed_at_tx: z.string(),
  created_at: z.string(),
});

// ============ Token Tables ============

export const TokenSchema = z.object({
  id: z.string(),
  address: z.string(),
  standard: z.enum(['ERC20', 'ERC721']),
  symbol: z.string().nullable(),
  name: z.string().nullable(),
  decimals: z.number().nullable(),
  discovered_at_block: z.number().nullable(),
  discovered_via: z.string().nullable(),
  created_at: z.string(),
});

export const TokenTransferSchema = z.object({
  id: z.string(),
  token_address: z.string(),
  wallet_address: z.string(),
  from_address: z.string(),
  to_address: z.string(),
  value: z.string(),
  token_id: z.string().nullable(),
  direction: z.enum(['inflow', 'outflow']),
  block_number: z.number(),
  transaction_hash: z.string(),
  log_index: z.number(),
  created_at: z.string(),
});

// ============ Type Exports ============

export type Wallet = z.infer<typeof WalletSchema>;
export type WalletOwner = z.infer<typeof WalletOwnerSchema>;
export type IndexerTransaction = z.infer<typeof TransactionSchema>;
export type Confirmation = z.infer<typeof ConfirmationSchema>;
export type Deposit = z.infer<typeof DepositSchema>;
export type WalletModule = z.infer<typeof WalletModuleSchema>;
export type DailyLimitState = z.infer<typeof DailyLimitStateSchema>;
export type WhitelistEntry = z.infer<typeof WhitelistEntrySchema>;
export type SocialRecoveryConfig = z.infer<typeof SocialRecoveryConfigSchema>;
export type SocialRecoveryGuardian = z.infer<typeof SocialRecoveryGuardianSchema>;
export type SocialRecovery = z.infer<typeof SocialRecoverySchema>;
export type RecoveryApproval = z.infer<typeof RecoveryApprovalSchema>;
export type ModuleTransaction = z.infer<typeof ModuleTransactionSchema>;
export type ModuleExecution = z.infer<typeof ModuleExecutionSchema>;
export type Token = z.infer<typeof TokenSchema>;
export type TokenTransfer = z.infer<typeof TokenTransferSchema>;
