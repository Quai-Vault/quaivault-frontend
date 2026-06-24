import { ImageResponse } from '@vercel/og';
import React from 'react';

/**
 * Dynamic OpenGraph image for a vault: GET /api/og?address=0x...
 * Renders a 1200x630 branded card with the vault name, shortened address,
 * and signer threshold. No balances are exposed.
 *
 * Why this file is .mjs + React.createElement (not og.tsx + JSX):
 *  - @vercel/og only runs on the Node.js runtime outside Next.js (the edge
 *    runtime can't bundle its font/WASM assets).
 *  - On the Node.js runtime, this non-Next project compiled api/og.tsx to a
 *    .js emitted as ESM but loaded as CommonJS ("Cannot use import statement
 *    outside a module"), crashing at module load before the handler ran. The
 *    .mjs extension is always treated as ESM, which fixes it. .mjs can't hold
 *    JSX, so the element tree is built with React.createElement.
 *  - Helpers are inlined (no ./_vault-data import) so there's no .ts module to
 *    resolve from this .mjs file.
 *
 * Uses the legacy (req, res) Node handler signature and writes the PNG to res.
 */

const h = React.createElement;
const FONT_FAMILY = 'Inter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const NETWORK_SCHEMA = process.env.VITE_NETWORK_SCHEMA || 'testnet';

/** Quai/EVM address: 0x + 40 hex. Returns null if invalid. */
function normalizeAddress(input) {
  if (!input) return null;
  const t = String(input).trim();
  return /^0x[0-9a-fA-F]{40}$/.test(t) ? t : null;
}

function shortenAddress(a) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Fetch vault details from the Supabase indexer via PostgREST. */
async function fetchVaultMeta(address) {
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

/** Fetch a TTF for satori (no UA -> Google Fonts serves .ttf, which satori supports). */
async function loadFont() {
  try {
    const cssRes = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@600');
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const m = css.match(/url\((https:[^)]+\.ttf)\)/);
    if (!m) return null;
    const fr = await fetch(m[1]);
    if (!fr.ok) return null;
    return await fr.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const address = normalizeAddress(url.searchParams.get('address'));
    const vault = address ? await fetchVaultMeta(address) : null;

    const title = (vault && vault.name && vault.name.trim()) || 'Multisig Vault';
    const shortAddr = address ? shortenAddress(address) : 'QuaiVault';
    const signers =
      vault && vault.ownerCount > 0
        ? `${vault.threshold} of ${vault.ownerCount} signers`
        : 'Secure multisig wallet';

    const fontData = await loadFont();
    const fonts = fontData
      ? [{ name: FONT_FAMILY, data: fontData, weight: 400, style: 'normal' }]
      : undefined;

    const tree = h(
      'div',
      {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: 'radial-gradient(ellipse at top left, #1a0505 0%, #000000 70%)',
          fontFamily: FONT_FAMILY,
        },
      },
      // Header / wordmark
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '20px' } },
        h('div', {
          style: {
            display: 'flex',
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)',
            boxShadow: '0 0 24px rgba(220, 38, 38, 0.5)',
          },
        }),
        h(
          'div',
          { style: { fontSize: '34px', fontWeight: 700, letterSpacing: '2px', color: '#ffffff' } },
          'QUAIVAULT',
        ),
      ),
      // Main content
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '24px' } },
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: '76px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.05,
              maxWidth: '1000px',
            },
          },
          title,
        ),
        h(
          'div',
          { style: { display: 'flex', fontSize: '40px', fontWeight: 500, color: '#f87171' } },
          shortAddr,
        ),
      ),
      // Footer pill
      h(
        'div',
        { style: { display: 'flex' } },
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              padding: '16px 32px',
              borderRadius: '9999px',
              border: '1px solid rgba(220, 38, 38, 0.4)',
              background: 'rgba(220, 38, 38, 0.12)',
              fontSize: '30px',
              fontWeight: 600,
              color: '#fca5a5',
            },
          },
          signers,
        ),
      ),
    );

    const image = new ImageResponse(tree, { width: 1200, height: 630, fonts });
    const png = Buffer.from(await image.arrayBuffer());

    res.statusCode = 200;
    res.setHeader('content-type', 'image/png');
    res.setHeader(
      'cache-control',
      'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
    );
    res.end(png);
  } catch (err) {
    // Surface the real cause so a failed deploy is diagnosable.
    // (Temporary — tighten to a generic 500 once the image is confirmed working.)
    const detail = err && err.stack ? err.stack : String(err);
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(`OG_ERROR: ${detail}`);
  }
}
