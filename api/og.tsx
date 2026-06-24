import { ImageResponse } from '@vercel/og';
import { fetchVaultMeta, normalizeAddress, shortenAddress } from './_vault-data';

export const config = { runtime: 'edge' };

/**
 * Dynamic OpenGraph image for a vault: GET /api/og?address=0x...
 * Renders a 1200x630 branded card with the vault name, shortened address,
 * and signer threshold. No balances are exposed.
 */
export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const address = normalizeAddress(searchParams.get('address'));

  const vault = address ? await fetchVaultMeta(address) : null;

  const title = vault?.name?.trim() || 'Multisig Vault';
  const shortAddr = address ? shortenAddress(address) : 'QuaiVault';
  const signers =
    vault && vault.ownerCount > 0
      ? `${vault.threshold} of ${vault.ownerCount} signers`
      : 'Secure multisig wallet';

  return new ImageResponse(
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
          fontFamily: 'sans-serif',
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
              fontFamily: 'monospace',
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
    {
      width: 1200,
      height: 630,
      headers: {
        // Cache at the CDN; vault metadata changes rarely.
        'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
}
