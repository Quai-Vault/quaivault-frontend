# Contract Changes Impact — quaivault-frontend

**Date:** 2026-03-12
**Source:** quaivault-contracts audit fixes (M-3, M-4, L-1, L-3, L-4, L-5)

This document lists required frontend changes to support the latest contract updates.
All changes are in SocialRecoveryModule unless noted otherwise.

---

## BREAKING: L-5 — Recovery Hash Now Includes `address(this)`

`getRecoveryHash` now encodes `address(this)` (the module address) as the first
element. The ABI signature is unchanged (it's a view function that handles this
internally), but **the returned hash values will differ from the old contract**.

Any cached or stored recovery hashes from the old contract are now invalid.

### Required changes:

1. **`src/config/abi/SocialRecoveryModule.json`** — Refresh from contract artifacts
2. No code change needed — the frontend calls the contract view function, not
   computing hashes locally

---

## BREAKING: Pre-existing Bug — `getRecoveryHashForCurrentNonce` Does Not Exist

**File:** `src/services/modules/SocialRecoveryModuleService.ts:187`

```typescript
return await module.getRecoveryHashForCurrentNonce(walletAddress, normalizedOwners, newThreshold);
```

This calls `getRecoveryHashForCurrentNonce` which does NOT exist in the ABI or
contract. The correct function name is `predictNextRecoveryHash`. The ABI at
`src/config/abi/SocialRecoveryModule.json:615` has `predictNextRecoveryHash`.

### Required fix:

```typescript
// Before (broken):
return await module.getRecoveryHashForCurrentNonce(walletAddress, normalizedOwners, newThreshold);

// After (correct):
return await module.predictNextRecoveryHash(walletAddress, normalizedOwners, newThreshold);
```

Also update the mock in `SocialRecoveryModuleService.test.ts:60,183`.

---

## NEW: Recovery `expiration` Field (M-4)

The `Recovery` struct now includes an `expiration` field (uint256). Recoveries
expire at `executionTime + recoveryPeriod` (2x total lifetime).

### Required changes:

1. **`src/services/modules/SocialRecoveryModuleService.ts`** — Update `Recovery` interface:
   ```typescript
   export interface Recovery {
     newOwners: string[];
     newThreshold: bigint;
     approvalCount: bigint;
     executionTime: bigint;
     expiration: bigint;        // NEW (M-4)
     requiredThreshold: bigint; // Was missing — present in contract struct
     executed: boolean;
   }
   ```

2. **`src/types/database.ts`** — Update `SocialRecoverySchema`:
   ```typescript
   expiration: z.number().default(0),  // NEW (M-4)
   ```

3. **`src/services/indexer/IndexerModuleService.ts`** — Update `PendingRecovery` if
   it extends the Recovery interface (should inherit automatically)

4. **`src/components/SocialRecoveryManagement.tsx`** — Consider displaying:
   - Time remaining until recovery expires
   - Whether a recovery is expired (greyed out / with "Expired" badge)
   - An "Expire" button for permissionless cleanup (calls `expireRecovery`)

5. **`src/config/abi/SocialRecoveryModule.json`** — Refresh from contract artifacts
   (the `recoveries` getter and `getRecovery` return type now include `expiration`)

---

## NEW: `expireRecovery(address wallet, bytes32 recoveryHash)` Function (M-4)

Permissionless function to clean up expired recoveries. Anyone can call it.

### Required changes:

1. **`src/services/modules/SocialRecoveryModuleService.ts`** — Add method:
   ```typescript
   async expireRecovery(walletAddress: string, recoveryHash: string): Promise<void> {
     const module = this.getModuleContract(true); // needs signer
     const tx = await module.expireRecovery(walletAddress, recoveryHash);
     await tx.wait();
   }
   ```

2. **`src/services/MultisigService.ts`** — Add facade method if desired

3. **UI** — Add "Expire" action on recoveries that have passed their expiration
   timestamp. This helps unblock `setupRecovery` when stale recoveries exist.

---

## NEW: Recovery Invalidation on Execution (M-3)

When a recovery executes, all OTHER pending recoveries for that wallet are
automatically invalidated. The contract emits `RecoveryInvalidated` for each.

### Frontend impact:

- The indexer will mark invalidated recoveries with a new status. The frontend
  should handle this status in its recovery list display.
- If the frontend reads recovery status from the indexer (Supabase), add handling
  for status `'invalidated'` (or `'cancelled'` if the indexer reuses that status).
- If the frontend reads directly from the contract, `recoveries[wallet][hash]`
  will return a zeroed struct (deleted) — the existing `executionTime == 0` check
  in `getPendingRecoveries` already handles this correctly.

### Required changes:

1. **`src/types/database.ts`** — If indexer adds `'invalidated'` status:
   ```typescript
   status: z.enum(['pending', 'executed', 'cancelled', 'invalidated', 'expired']),
   ```

2. **`src/components/SocialRecoveryManagement.tsx`** — Display invalidated/expired
   recoveries with appropriate styling and labels

---

## NEW ERROR: `initiateRecovery` Reverts When Module Disabled (L-4)

`initiateRecovery` now checks `isModuleEnabled` and reverts with `ModuleNotEnabled()`
if the module is disabled. Previously this was only checked in `approveRecovery`
and `executeRecovery`.

### Required changes:

1. **`src/services/utils/TransactionErrorHandler.ts`** — If not already handled,
   add `ModuleNotEnabled` to the error mapping for the SocialRecoveryModule context

---

## FACTORY: `MAX_EXECUTION_DELAY` = 30 Days (L-1)

`QuaiVaultFactory.createWallet` (4-param) now rejects `minExecutionDelay > 30 days`.

### Required changes:

1. **Wallet creation UI** — Add client-side validation: max 30 days (2,592,000 seconds)
2. **Error handling** — Map `ExecutionDelayTooLong()` error to user-friendly message
3. **`src/config/abi/QuaiVaultFactory.json`** — Refresh from contract artifacts

---

## ABI Refresh Required

All ABIs must be refreshed from `quaivault-contracts/artifacts/`:

| ABI File | Reason |
|----------|--------|
| `SocialRecoveryModule.json` | New struct field, new function, new events, new errors |
| `QuaiVaultFactory.json` | New error, new constant |
| `MultiSend.json` | No ABI change but good practice |
| `QuaiVault.json` | No change — refresh for consistency |

---

## Summary of Required Actions

| Priority | Action | Files |
|----------|--------|-------|
| **CRITICAL** | Fix `getRecoveryHashForCurrentNonce` → `predictNextRecoveryHash` | `SocialRecoveryModuleService.ts` |
| **HIGH** | Refresh all ABIs from contract artifacts | `src/config/abi/*.json` |
| **HIGH** | Add `expiration` to Recovery interface and DB schema | `SocialRecoveryModuleService.ts`, `database.ts` |
| **HIGH** | Add `requiredThreshold` to Recovery interface (was missing) | `SocialRecoveryModuleService.ts` |
| **MEDIUM** | Add `expireRecovery` service method and UI action | `SocialRecoveryModuleService.ts`, UI components |
| **MEDIUM** | Handle `'invalidated'` and `'expired'` recovery statuses | `database.ts`, `SocialRecoveryManagement.tsx` |
| **MEDIUM** | Add 30-day max validation to wallet creation UI | Wallet creation component |
| **LOW** | Map new errors (`ModuleNotEnabled`, `ExecutionDelayTooLong`) | `TransactionErrorHandler.ts` |
