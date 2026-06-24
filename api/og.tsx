import { ImageResponse } from '@vercel/og';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchVaultMeta, normalizeAddress, shortenAddress } from './_vault-data';

/**
 * Dynamic OpenGraph image for a vault: GET /api/og?address=0x...
 * Renders a 1200x630 branded card with the vault name, shortened address,
 * and signer threshold. No balances are exposed.
 *
 * Uses the Node.js runtime + the legacy (req, res) handler signature: this
 * non-Next project's /api functions don't honor a returned web Response (a
 * returned Response is silently dropped -> FUNCTION_INVOCATION_FAILED), so we
 * write the PNG bytes to `res` directly. @vercel/og is only supported on the
 * Node.js runtime outside Next.js (the edge runtime can't bundle its assets).
 *
 * We load an explicit font at runtime rather than relying on @vercel/og's
 * bundled fallback font, which the function bundler can prune.
 */

const FONT_FAMILY = 'Inter';

/** Fetch a TTF for satori. Returns null on any failure (caller degrades). */
async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    // No User-Agent header -> Google Fonts serves a .ttf (truetype), which
    // satori supports (it does not support woff2).
    const cssRes = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@600');
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const match = css.match(/url\((https:[^)]+\.ttf)\)/);
    if (!match) return null;
    const fontRes = await fetch(match[1]);
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    // req.url is a path (e.g. "/api/og?address=0x..") in the legacy runtime.
    const url = new URL(req.url ?? '/', 'http://localhost');
    const address = normalizeAddress(url.searchParams.get('address'));

    const vault = address ? await fetchVaultMeta(address) : null;

    const title = vault?.name?.trim() || 'Multisig Vault';
    const shortAddr = address ? shortenAddress(address) : 'QuaiVault';
    const signers =
      vault && vault.ownerCount > 0
        ? `${vault.threshold} of ${vault.ownerCount} signers`
        : 'Secure multisig wallet';

    const fontData = await loadFont();
    const fonts = fontData
      ? [{ name: FONT_FAMILY, data: fontData, weight: 400 as const, style: 'normal' as const }]
      : undefined;

    const image = new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '72px',
            background: 'radial-gradient(ellipse at top left, #1a0505 0%, #000000 70%)',
            fontFamily: FONT_FAMILY,
          }}
        >
          {/* Header / wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div
              style={{
                display: 'flex',
                width: '56px',
                height: '56px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)',
                boxShadow: '0 0 24px rgba(220, 38, 38, 0.5)',
              }}
            />
            <div
              style={{
                fontSize: '34px',
                fontWeight: 700,
                letterSpacing: '2px',
                color: '#ffffff',
              }}
            >
              QUAIVAULT
            </div>
          </div>

          {/* Main content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div
              style={{
                display: 'flex',
                fontSize: '76px',
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.05,
                maxWidth: '1000px',
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: '40px',
                fontWeight: 500,
                color: '#f87171',
              }}
            >
              {shortAddr}
            </div>
          </div>

          {/* Footer pill */}
          <div style={{ display: 'flex' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '16px 32px',
                borderRadius: '9999px',
                border: '1px solid rgba(220, 38, 38, 0.4)',
                background: 'rgba(220, 38, 38, 0.12)',
                fontSize: '30px',
                fontWeight: 600,
                color: '#fca5a5',
              }}
            >
              {signers}
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630, fonts },
    );

    const png = Buffer.from(await image.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('content-type', 'image/png');
    // Cache at the CDN; vault metadata changes rarely.
    res.setHeader('cache-control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
    res.end(png);
  } catch (err) {
    // Surface the real cause in the body so a failed deploy is diagnosable.
    // (Temporary — tighten to a generic 500 once the image is confirmed working.)
    const detail = err instanceof Error ? err.stack || err.message : String(err);
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(`OG_ERROR: ${detail}`);
  }
}
