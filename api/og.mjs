import { ImageResponse } from '@vercel/og';
import React from 'react';
import {
  canonicalOrigin,
  fetchVaultMeta,
  fetchWithTimeout,
  normalizeAddress,
  shortenAddress,
} from './_vault-data.mjs';

/**
 * Dynamic OpenGraph image for a vault: GET /api/og?address=0x...
 * Renders a 1200x630 branded card with the vault name, shortened address,
 * and signer threshold. No balances are exposed.
 *
 * Why .mjs + React.createElement (not og.tsx + JSX): @vercel/og only runs on
 * the Node.js runtime outside Next.js, and a Node .tsx->.js was loaded as
 * CommonJS ("Cannot use import statement outside a module") and crashed at
 * module load. .mjs is always ESM; .mjs can't hold JSX, so the tree is built
 * with React.createElement (react is already a dep). Uses the legacy (req, res)
 * handler signature and writes the PNG to res.
 *
 * Unknown/invalid addresses redirect to the static og image so this CPU-heavy
 * endpoint only renders for real vaults (bounds cost / abuse surface).
 */

const h = React.createElement;
const FONT_FAMILY = 'Inter';

// Memoize the font across invocations on a warm instance (one fetch, not one
// per request). Cache the promise; on failure, reset so the next call retries.
let fontPromise = null;
function loadFont() {
  if (!fontPromise) {
    fontPromise = loadFontOnce().then((data) => {
      if (!data) fontPromise = null;
      return data;
    });
  }
  return fontPromise;
}

/** Fetch a TTF for satori (no UA -> Google Fonts serves .ttf, which satori supports). */
async function loadFontOnce() {
  try {
    const cssRes = await fetchWithTimeout('https://fonts.googleapis.com/css2?family=Inter:wght@600', {}, 2000);
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const m = css.match(/url\((https:[^)]+\.ttf)\)/);
    if (!m) return null;
    const fr = await fetchWithTimeout(m[1], {}, 2000);
    if (!fr.ok) return null;
    return await fr.arrayBuffer();
  } catch {
    return null;
  }
}

function redirectToStatic(req, res) {
  res.statusCode = 302;
  res.setHeader('location', `${canonicalOrigin(req)}/og-image.png`);
  res.setHeader('cache-control', 'public, max-age=300, s-maxage=86400');
  res.end();
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const address = normalizeAddress(url.searchParams.get('address'));
    if (!address) return redirectToStatic(req, res);

    const vault = await fetchVaultMeta(address);
    // Only render for vaults that actually exist; everything else gets the
    // static image, so attackers can't force unbounded unique renders.
    if (!vault) return redirectToStatic(req, res);

    const title = (vault.name && vault.name.trim()) || 'Multisig Vault';
    const shortAddr = shortenAddress(address);
    const signers =
      vault.ownerCount > 0
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
    // Log full detail to the function logs; don't leak internals to clients.
    console.error('og image generation failed:', err);
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Failed to generate image');
  }
}
