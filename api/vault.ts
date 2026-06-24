import {
  escapeHtmlAttr,
  fetchVaultMeta,
  normalizeAddress,
  shortenAddress,
} from './_vault-data';

export const config = { runtime: 'edge' };

/**
 * Serves the SPA's index.html with per-vault OpenGraph / Twitter meta tags
 * injected, so social and chat crawlers (which don't run JS) render a vault-
 * specific link preview. Wired via a `/wallet/:address` -> `/api/vault` rewrite
 * in vercel.json. The React app still boots normally and takes over routing.
 */
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = url.origin;
  const address = normalizeAddress(url.searchParams.get('address'));

  // Always serve the real built HTML so asset hashes / inline-script CSP hash
  // stay valid; fall back to passthrough on any fetch error.
  let html: string;
  try {
    const res = await fetch(`${origin}/index.html`, {
      headers: { 'x-og-passthrough': '1' },
    });
    html = await res.text();
    if (!res.ok || !html.includes('<head>')) {
      return new Response(html, {
        status: res.status,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
  } catch {
    return Response.redirect(`${origin}/`, 302);
  }

  // Invalid address -> serve the default (unmodified) document.
  if (!address) {
    return htmlResponse(html);
  }

  const vault = await fetchVaultMeta(address);

  const name = vault?.name?.trim() || 'Multisig Vault';
  const shortAddr = shortenAddress(address);
  const title = `${name} (${shortAddr}) · QuaiVault`;
  const description =
    vault && vault.ownerCount > 0
      ? `${name} — a ${vault.threshold} of ${vault.ownerCount} multisig vault on Quai Network, secured by QuaiVault.`
      : `View this multisig vault (${shortAddr}) on QuaiVault — secure collaborative fund management on Quai Network.`;

  const pageUrl = `${origin}/wallet/${address}`;
  const imageUrl = `${origin}/api/og?address=${address}`;

  const safeTitle = escapeHtmlAttr(title);
  const safeDesc = escapeHtmlAttr(description);

  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  out = setMeta(out, 'name', 'title', safeTitle);
  out = setMeta(out, 'name', 'description', safeDesc);
  out = setMeta(out, 'property', 'og:title', safeTitle);
  out = setMeta(out, 'property', 'og:description', safeDesc);
  out = setMeta(out, 'property', 'og:url', pageUrl);
  out = setMeta(out, 'property', 'og:image', imageUrl);
  out = setMeta(out, 'name', 'twitter:title', safeTitle);
  out = setMeta(out, 'name', 'twitter:description', safeDesc);
  out = setMeta(out, 'name', 'twitter:image', imageUrl);

  return htmlResponse(out);
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}

/**
 * Replace the `content` value of a single <meta {attr}="{key}" content="..."> tag.
 * Tolerates either attribute order (content before or after the identifier).
 */
function setMeta(html: string, attr: 'name' | 'property', key: string, value: string): string {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // <meta name="x" content="...">
  const after = new RegExp(`(<meta\\s+${attr}=["']${k}["']\\s+content=["'])[\\s\\S]*?(["']\\s*/?>)`, 'i');
  if (after.test(html)) return html.replace(after, `$1${value}$2`);
  // <meta content="..." name="x">
  const before = new RegExp(`(<meta\\s+content=["'])[\\s\\S]*?(["']\\s+${attr}=["']${k}["']\\s*/?>)`, 'i');
  return html.replace(before, `$1${value}$2`);
}
