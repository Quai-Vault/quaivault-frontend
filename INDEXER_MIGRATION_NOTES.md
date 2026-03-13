# Indexer Migration Notes — Audit Remediation (2026-03-13)

The indexer underwent a security and backend audit resulting in 23 fixes. Most changes are backend-only, but the following require frontend awareness.

## Breaking: `owner_count` Now Trigger-Driven

**What changed:** Wallets are now created with `owner_count = 0`. A database trigger on the `wallet_owners` table automatically increments/decrements `owner_count` as owner rows are inserted or deactivated.

**Why:** The old approach set `owner_count` in application code AND via an RPC function, creating a race condition where the count could drift from reality. The trigger ensures the count always matches the actual `wallet_owners` rows.

**Frontend impact:** If you subscribe to the `wallets` table via Supabase Realtime and a new wallet is created, you may briefly see `owner_count: 0` before the trigger fires and updates it to the correct value. This happens within milliseconds but could surface in a Realtime subscription.

**Recommended action:**
- If displaying owner count, derive it from `wallet_owners` where `is_active = true` rather than trusting `wallets.owner_count` as sole source of truth, OR
- Treat `owner_count = 0` as a loading state and re-fetch after a short delay, OR
- Accept the brief inconsistency — by the time the indexer finishes processing the block, the count will be correct

## Non-Breaking: `social_recovery_guardians` Constraint Change

**What changed:** The unique constraint changed from `UNIQUE(wallet_address, guardian_address, added_at_block)` to `UNIQUE(wallet_address, guardian_address)`.

**Why:** Guardian management is now atomic (single stored procedure). There is at most one row per wallet-guardian pair, updated in place rather than creating history rows.

**Frontend impact:** None for queries. The columns and data shape are unchanged. If the frontend was relying on multiple rows for the same guardian (different `added_at_block` values), those will no longer exist.

## Non-Breaking: New `/health` Field

**What changed:** The health endpoint response `details` object now includes `skippedEvents: number`.

**Frontend impact:** Additive field. Safe to ignore or display in a monitoring dashboard.

## Schema Rebuild Required

If deploying alongside the indexer update, the database schema must be recreated:

```sql
-- Run updated schema.sql first, then:
SELECT drop_quaivault_schema('testnet');   -- or 'mainnet', 'dev'
SELECT create_quaivault_schema('testnet');
```

This is a destructive operation — all indexed data will be re-populated from chain during the next backfill.
