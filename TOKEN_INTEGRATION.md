# Token Tracking — Frontend Integration Guide

The indexer now tracks ERC20 and ERC721 token transfers for all registered vaults. This document covers the new Supabase tables, how to query them, and how to get live balances.

---

## New Database Tables

### `tokens` — Token Registry

Tracked tokens (seeded + auto-discovered).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `address` | TEXT | Contract address (lowercase, unique) |
| `standard` | `token_standard` | `'ERC20'` or `'ERC721'` |
| `symbol` | TEXT | e.g. `'WQI'` |
| `name` | TEXT | e.g. `'Wrapped Qi'` |
| `decimals` | INTEGER | e.g. `18` |
| `discovered_at_block` | BIGINT | NULL for seeded tokens |
| `discovered_via` | TEXT | `'seed'`, `'calldata'`, or NULL |
| `created_at` | TIMESTAMPTZ | |

### `token_transfers` — Transfer Events

Every ERC20/ERC721 Transfer event involving a tracked vault.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `token_address` | TEXT | FK → `tokens.address` |
| `wallet_address` | TEXT | FK → `wallets.address` (the vault involved) |
| `from_address` | TEXT | Sender (may be zero address for mints) |
| `to_address` | TEXT | Receiver (may be zero address for burns) |
| `value` | TEXT | Amount as string (ERC20) or `'1'` (ERC721) |
| `token_id` | TEXT | NFT token ID (ERC721 only, NULL for ERC20) |
| `direction` | `transfer_direction` | `'inflow'` or `'outflow'` |
| `block_number` | BIGINT | |
| `transaction_hash` | TEXT | |
| `log_index` | INTEGER | |
| `created_at` | TIMESTAMPTZ | |

**Unique constraint**: `(transaction_hash, log_index, wallet_address)` — vault-to-vault transfers produce two rows (one inflow, one outflow).

---

## Zod Schemas

Add these to `src/types/database.ts`:

```typescript
export const TokenSchema = z.object({
  id: z.string(),
  address: z.string(),
  standard: z.enum(['ERC20', 'ERC721']),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number(),
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

export type Token = z.infer<typeof TokenSchema>;
export type TokenTransfer = z.infer<typeof TokenTransferSchema>;
```

---

## Supabase Queries

All queries use the configured schema (`VITE_NETWORK_SCHEMA`).

### Get all tokens a vault has interacted with

```typescript
const { data: transfers } = await supabase
  .schema(networkSchema)
  .from('token_transfers')
  .select('token_address')
  .eq('wallet_address', vaultAddress.toLowerCase())
  .order('created_at', { ascending: false });

// Deduplicate to get unique token addresses
const tokenAddresses = [...new Set(transfers?.map(t => t.token_address))];
```

### Get token metadata for those addresses

```typescript
const { data: tokens } = await supabase
  .schema(networkSchema)
  .from('tokens')
  .select('*')
  .in('address', tokenAddresses);
```

### Get transfer history for a vault + token

```typescript
const { data: history } = await supabase
  .schema(networkSchema)
  .from('token_transfers')
  .select(`
    *,
    tokens:token_address ( symbol, name, decimals, standard )
  `)
  .eq('wallet_address', vaultAddress.toLowerCase())
  .order('block_number', { ascending: false })
  .limit(50);
```

### Get transfer history for a vault (all tokens)

```typescript
const { data: history } = await supabase
  .schema(networkSchema)
  .from('token_transfers')
  .select(`
    *,
    tokens:token_address ( symbol, name, decimals, standard )
  `)
  .eq('wallet_address', vaultAddress.toLowerCase())
  .order('block_number', { ascending: false })
  .limit(100);
```

---

## Live Balances — Query On-Chain

The indexer does **not** store balances. Transfer history tells you *which* tokens a vault has touched. For current balances, call `balanceOf()` on-chain:

### ERC20 Balance

```typescript
import { Contract, JsonRpcProvider } from 'quais';

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

async function getERC20Balance(
  provider: JsonRpcProvider,
  tokenAddress: string,
  vaultAddress: string
): Promise<bigint> {
  const contract = new Contract(tokenAddress, ERC20_ABI, provider);
  return contract.balanceOf(vaultAddress);
}
```

### ERC721 Ownership Check

```typescript
const ERC721_ABI = ['function ownerOf(uint256) view returns (address)'];

async function isNFTOwner(
  provider: JsonRpcProvider,
  tokenAddress: string,
  tokenId: string,
  vaultAddress: string
): Promise<boolean> {
  const contract = new Contract(tokenAddress, ERC721_ABI, provider);
  const owner = await contract.ownerOf(tokenId);
  return owner.toLowerCase() === vaultAddress.toLowerCase();
}
```

### Recommended Pattern

1. Query `token_transfers` to discover which tokens the vault has used
2. Fetch metadata from `tokens` table (symbol, decimals, name)
3. Call `balanceOf()` on-chain for each token to get current balance
4. Cache results with React Query (stale time ~30s)

```typescript
// Example React Query hook
function useVaultTokenBalances(vaultAddress: string) {
  // Step 1: Get unique tokens from transfer history
  const { data: tokens } = useQuery({
    queryKey: ['vault-tokens', vaultAddress],
    queryFn: async () => {
      const { data: transfers } = await supabase
        .schema(networkSchema)
        .from('token_transfers')
        .select('token_address')
        .eq('wallet_address', vaultAddress.toLowerCase());

      const addresses = [...new Set(transfers?.map(t => t.token_address))];

      const { data: tokenMeta } = await supabase
        .schema(networkSchema)
        .from('tokens')
        .select('*')
        .in('address', addresses);

      return tokenMeta ?? [];
    },
  });

  // Step 2: Fetch on-chain balances
  const { data: balances } = useQuery({
    queryKey: ['vault-token-balances', vaultAddress, tokens],
    queryFn: async () => {
      if (!tokens?.length) return [];
      return Promise.all(
        tokens.map(async (token) => {
          const balance = await getERC20Balance(provider, token.address, vaultAddress);
          return { ...token, balance: balance.toString() };
        })
      );
    },
    enabled: !!tokens?.length,
    staleTime: 30_000,
  });

  return balances;
}
```

---

## Real-Time Subscriptions

Both tables are published to Supabase Realtime. Subscribe to new transfers:

```typescript
const channel = supabase
  .channel('token-transfers')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: networkSchema,
      table: 'token_transfers',
      filter: `wallet_address=eq.${vaultAddress.toLowerCase()}`,
    },
    (payload) => {
      // New token transfer — invalidate balance queries
      queryClient.invalidateQueries({
        queryKey: ['vault-token-balances', vaultAddress],
      });
    }
  )
  .subscribe();
```

---

## Transaction Type: `erc20_transfer`

The `transactions` table includes the `transaction_type` value `'erc20_transfer'` when a vault proposes a call to `transfer()`, `approve()`, or `transferFrom()` on an ERC20 contract.

The `decoded_params` for these transactions contain:
- **transfer**: `{ to: string, amount: string }`
- **approve**: `{ spender: string, amount: string }`
- **transferFrom**: `{ from: string, to: string, amount: string }`

You can use this to show "Send 100 WQI to 0x..." in the transaction approval UI instead of raw hex.

---

## Transaction Type: `erc721_transfer`

The `transaction_type` value `'erc721_transfer'` is set when a vault proposes a `safeTransferFrom()` call on an ERC721 (NFT) contract.

The `decoded_params` for these transactions contain:
- **safeTransferFrom**: `{ from: string, to: string, tokenId: string }`
- **safeTransferFrom (with data)**: `{ from: string, to: string, tokenId: string, data: string }`

Note: `transferFrom()` and `approve()` share the same function selector between ERC20 and ERC721. When targeting an NFT contract, these will appear as `erc20_transfer` at the calldata level, but the indexer's auto-discovery will detect the contract as ERC721 (via fallback probe) and track it correctly.

---

## Summary

| What | Where |
|------|-------|
| Which tokens has this vault used? | `token_transfers` filtered by `wallet_address` |
| Token metadata (symbol, decimals) | `tokens` table |
| Current ERC20 balance | On-chain `balanceOf()` call |
| Current NFT ownership | On-chain `ownerOf()` call |
| Transfer history | `token_transfers` with `tokens` join |
| Real-time updates | Supabase Realtime subscription on `token_transfers` |
| Decoded ERC20 proposals | `transactions.decoded_params` where `transaction_type = 'erc20_transfer'` |
| Decoded ERC721 proposals | `transactions.decoded_params` where `transaction_type = 'erc721_transfer'` |
