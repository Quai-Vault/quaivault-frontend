/**
 * Shared helpers for the OpenGraph serverless functions (api/og.mjs is Node.js,
 * api/vault.ts is edge). Both runtimes provide `fetch`, `process.env`, and
 * `AbortSignal.timeout`.
 *
 * This is .mjs (not .ts) on purpose: api/og.mjs runs on the Node.js runtime
 * where a plain `.js`/`.ts` helper can be loaded as CommonJS and crash on its
 * `export` statements. `.mjs` is unconditionally ESM in every context. The edge
 * function bundles it, so the extension is irrelevant there. Keeping ONE copy
 * avoids the schema-drift risk of duplicating fetchVaultMeta in both functions.
 */

const SITE_URL = (process.env.VITE_SITE_URL || '').replace(/\/+$/, '');
const SELF_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const NETWORK_SCHEMA = process.env.VITE_NETWORK_SCHEMA || 'testnet';

/** Last-resort origin from the request (only when env vars are absent, e.g. local dev). */
function reqOrigin(req) {
  try {
    return new URL((req && req.url) || '/', 'http://localhost').origin;
  } catch {
    return '';
  }
}

/**
 * Canonical, trusted public origin for shareable absolute URLs (og:url, og:image).
 * Pinned to VITE_SITE_URL so a spoofed Host can't poison the CDN-cached preview.
 */
export function canonicalOrigin(req) {
  return SITE_URL || SELF_URL || reqOrigin(req);
}

/**
 * This deployment's own origin, for fetching its own static assets. Uses the
 * Vercel-provided VERCEL_URL (deployment-pinned, not Host-derived) so preview
 * deployments fetch their own index.html with the correct asset hashes.
 */
export function selfOrigin(req) {
  return SELF_URL || SITE_URL || reqOrigin(req);
}

/** fetch() with a hard timeout so a hung upstream can't stall the function. */
export function fetchWithTimeout(url, options = {}, ms = 2500) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
}

/** Quai/EVM address: 0x + 40 hex. Returns null if invalid. */
export function normalizeAddress(input) {
  if (!input) return null;
  const t = String(input).trim();
  return /^0x[0-9a-fA-F]{40}$/.test(t) ? t : null;
}

/** 0x1234…abcd — short form for display. */
export function shortenAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Escape a string for safe interpolation into an HTML attribute value. */
export function escapeHtmlAttr(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Fetch vault details from the Supabase indexer via PostgREST (anon key, same
 * one the frontend uses). Returns null when the indexer is unconfigured, the
 * vault is unknown, or the request fails/times out — callers degrade gracefully.
 */
export async function fetchVaultMeta(address) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const url =
    `${SUPABASE_URL}/rest/v1/wallets` +
    `?address=eq.${address.toLowerCase()}` +
    `&select=address,name,threshold,owner_count&limit=1`;

  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        // PostgREST: select from a non-public schema on read requests.
        'Accept-Profile': NETWORK_SCHEMA,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;

    const rows = await res.json();
    const row = rows && rows[0];
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
