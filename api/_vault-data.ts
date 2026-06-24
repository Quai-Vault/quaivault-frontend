/**
 * Shared helpers for the OpenGraph serverless functions (api/og.tsx, api/vault.ts).
 *
 * These run in the Vercel Edge runtime — NOT part of the Vite/React bundle and
 * NOT type-checked by the project `tsc` build (tsconfig only includes `src`).
 * They reuse the same env vars the frontend build consumes (VITE_*), which are
 * available to functions via process.env on Vercel.
 */

export interface VaultMeta {
  address: string;
  name: string | null;
  threshold: number;
  ownerCount: number;
}

/** Quai/EVM address: 0x followed by 40 hex chars. Returns null if invalid. */
export function normalizeAddress(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? trimmed : null;
}

/** 0x1234…abcd — short form for display. */
export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Escape a string for safe interpolation into an HTML attribute value. */
export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const NETWORK_SCHEMA = process.env.VITE_NETWORK_SCHEMA || 'testnet';

/**
 * Fetch vault details directly from the Supabase indexer via PostgREST.
 * Uses the anon key (same one the frontend uses). Returns null when the
 * indexer is not configured, the vault is unknown, or the request fails —
 * callers fall back to a generic preview.
 */
export async function fetchVaultMeta(address: string): Promise<VaultMeta | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const url =
    `${SUPABASE_URL}/rest/v1/wallets` +
    `?address=eq.${address.toLowerCase()}` +
    `&select=address,name,threshold,owner_count&limit=1`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        // PostgREST: select from a non-public schema on read requests.
        'Accept-Profile': NETWORK_SCHEMA,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;

    const rows = (await res.json()) as Array<{
      address: string;
      name: string | null;
      threshold: number;
      owner_count: number;
    }>;
    const row = rows?.[0];
    if (!row) return null;

    return {
      address: row.address,
      name: row.name,
      threshold: row.threshold,
      ownerCount: row.owner_count,
    };
  } catch {
    return null;
  }
}
