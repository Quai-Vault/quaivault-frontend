import { z } from 'zod';

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const exactIntegerSchema = z.union([z.string(), z.number().safe()]).transform(String);

export const DaoShipSummarySchema = z.object({
  id: addressSchema,
  avatar: addressSchema,
  launcher_contract: addressSchema,
  new_vault: z.boolean(),
  created_at: z.string(),
  updated_at: z.string().nullable().optional(),
  tx_hash: txHashSchema,
  name: z.string().max(255).nullable().optional(),
  description: z.string().max(4_000).nullable().optional(),
  avatar_img: z.string().max(2_048).nullable().optional(),
  profile_source: z.enum(['vault', 'launcher']).nullable(),
  share_token_name: z.string().max(255).nullable().optional(),
  share_token_symbol: z.string().max(32).nullable().optional(),
  loot_token_name: z.string().max(255).nullable().optional(),
  loot_token_symbol: z.string().max(32).nullable().optional(),
  voting_period: z.number().nonnegative(),
  grace_period: z.number().nonnegative(),
  proposal_offering: exactIntegerSchema,
  quorum_percent: exactIntegerSchema,
  sponsor_threshold: exactIntegerSchema,
  min_retention_percent: exactIntegerSchema,
  default_expiry_window: z.number().nonnegative(),
  active_member_count: exactIntegerSchema,
  proposal_count: exactIntegerSchema,
  total_shares: exactIntegerSchema,
  total_loot: exactIntegerSchema,
});

export const DaoShipsIndexerStateSchema = z.object({
  last_block_number: z.number().nonnegative(),
  last_indexed_at: z.string().nullable(),
  chain_id: z.number().int().positive(),
  is_syncing: z.boolean(),
  requires_full_reindex: z.boolean(),
});

export type DaoShipSummary = z.infer<typeof DaoShipSummarySchema>;
export type DaoShipsIndexerState = z.infer<typeof DaoShipsIndexerStateSchema>;

declare const untrusted: unique symbol;
export type Untrusted<T> = T & { readonly [untrusted]: true };

export interface DaoShipDisplay {
  id: string;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  profileSource: 'vault' | 'launcher' | null;
}
