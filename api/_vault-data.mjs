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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const NETWORK_SCHEMA = process.env.VITE_NETWORK_SCHEMA || 'testnet';

/**
 * The request's own origin, scheme forced to https. Works in both runtimes:
 *  - edge: req.url is an absolute URL
 *  - node: req.url is a path, so the host comes from the Host header
 * https is forced because behind Vercel the function may observe http
 * internally; fetching the http origin can resolve to the wrong site.
 */
function requestOrigin(req) {
  try {
    const u = new URL(req.url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return `https://${u.host}`;
  } catch {
    /* req.url was a path (node runtime) — fall through to the Host header */
  }
  const host = req && req.headers && req.headers.host;
  return host ? `https://${host}` : '';
}

/** VITE_SITE_URL with the scheme forced to https; '' if unset/unparseable. */
function httpsSiteUrl() {
  const raw = (process.env.VITE_SITE_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    return `https://${new URL(raw).host}`;
  } catch {
    return '';
  }
}

/**
 * Canonical, trusted public origin for shareable absolute URLs (og:url, og:image).
 * Prefers VITE_SITE_URL (forced https) so a spoofed Host can't poison the
 * CDN-cached preview; falls back to the request's own https origin.
 */
export function canonicalOrigin(req) {
  return httpsSiteUrl() || requestOrigin(req);
}

/**
 * Origin to fetch this deployment's own static assets from. Uses the request's
 * own host (over https) so it always hits THIS deployment (preview-safe) and
 * never the env's possibly-http or canonical-apex value, which can resolve to a
 * different site internally.
 */
export function selfOrigin(req) {
  return requestOrigin(req) || httpsSiteUrl();
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
