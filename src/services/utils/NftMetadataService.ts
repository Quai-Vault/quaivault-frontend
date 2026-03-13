import { Contract as QuaisContract, getAddress } from 'quais';
import { NETWORK_CONFIG } from '../../config/contracts';
import { getActiveProvider } from '../../config/provider';

const ERC721_TOKEN_URI_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
];

const ERC1155_URI_ABI = [
  'function uri(uint256 id) view returns (string)',
];

const FETCH_TIMEOUT_MS = 10_000;
const BATCH_CONCURRENCY = 5;

/** Derive allowed NFT metadata hosts from the configured VITE_NFT_IPFS_GATEWAY */
function getAllowedMetadataHosts(): string[] {
  try {
    const parsed = new URL(NETWORK_CONFIG.NFT_IPFS_GATEWAY);
    return [parsed.hostname];
  } catch {
    return [];
  }
}

function isAllowedMetadataUrl(url: string): boolean {
  if (url.startsWith('data:')) return true;
  try {
    const parsed = new URL(url);
    const allowed = getAllowedMetadataHosts();
    return parsed.protocol === 'https:' &&
      allowed.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

export interface NftMetadata {
  name: string | null;
  description: string | null;
  image: string | null;
  rawTokenUri: string | null;
}

export interface NftHolding {
  tokenAddress: string;
  tokenId: string;
  collectionName: string | null;
  collectionSymbol: string | null;
}

/**
 * Resolve an IPFS, data, or HTTP URI to a fetchable URL.
 * - `ipfs://Qm...` → `${gateway}/ipfs/Qm...`
 * - `ipfs://baf...` → `${gateway}/ipfs/baf...`
 * - `data:...` → pass through
 * - `https://...` → pass through
 */
export function resolveIpfsUri(uri: string, gateway: string): string {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice(7); // strip "ipfs://"
    return `${gateway.replace(/\/$/, '')}/ipfs/${cid}`;
  }
  if (uri.startsWith('ipfs:')) {
    // Handle non-standard `ipfs:Qm...` (no double slash)
    const cid = uri.slice(5);
    return `${gateway.replace(/\/$/, '')}/ipfs/${cid}`;
  }
  return uri;
}

/**
 * Call tokenURI(uint256) on an ERC721 contract.
 * Returns null if the contract doesn't implement tokenURI (optional in spec).
 */
export async function getTokenUri(
  tokenAddress: string,
  tokenId: string,
): Promise<string | null> {
  try {
    const contract = new QuaisContract(getAddress(tokenAddress), ERC721_TOKEN_URI_ABI, getActiveProvider());
    const uri: string = await contract.tokenURI(tokenId);
    return uri || null;
  } catch (e) {
    console.warn(`[NftMetadataService] tokenURI not supported for ${tokenAddress}#${tokenId}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Decode a data: URI containing JSON metadata.
 * Supports `data:application/json;base64,...` and `data:application/json,...` (URL-encoded).
 */
function decodeDataUri(uri: string): Record<string, unknown> | null {
  try {
    const commaIdx = uri.indexOf(',');
    if (commaIdx === -1) return null;
    const header = uri.slice(0, commaIdx).toLowerCase();
    const body = uri.slice(commaIdx + 1);

    if (header.includes('base64')) {
      return JSON.parse(atob(body));
    }
    return JSON.parse(decodeURIComponent(body));
  } catch {
    return null;
  }
}

/**
 * Fetch and parse NFT metadata from a resolved token URI.
 * Handles IPFS, HTTP, and data: URIs.
 */
export async function fetchNftMetadata(
  tokenUri: string,
  gateway: string,
): Promise<NftMetadata> {
  const empty: NftMetadata = { name: null, description: null, image: null, rawTokenUri: tokenUri };

  try {
    let json: Record<string, unknown> | null = null;

    if (tokenUri.startsWith('data:')) {
      json = decodeDataUri(tokenUri);
    } else {
      const resolvedUrl = resolveIpfsUri(tokenUri, gateway);
      if (!isAllowedMetadataUrl(resolvedUrl)) return empty;
      const response = await fetch(resolvedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) return empty;

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('json') && !contentType.includes('text')) {
        return empty;
      }
      json = await response.json();
    }

    if (!json || typeof json !== 'object') return empty;

    const name = typeof json.name === 'string' ? json.name : null;
    const description = typeof json.description === 'string' ? json.description : null;
    let image: string | null = null;

    if (typeof json.image === 'string' && json.image) {
      image = resolveIpfsUri(json.image, gateway);
    } else if (typeof json.image_url === 'string' && json.image_url) {
      image = resolveIpfsUri(json.image_url, gateway);
    }

    return { name, description, image, rawTokenUri: tokenUri };
  } catch (e) {
    console.warn(`[NftMetadataService] Failed to fetch metadata from ${tokenUri}:`, e instanceof Error ? e.message : e);
    return empty;
  }
}

/**
 * Fetch metadata for multiple NFT holdings, processing in batches to avoid
 * hammering the IPFS gateway.
 *
 * Returns a Map keyed by `${tokenAddress}:${tokenId}`.
 */
export async function getNftMetadataBatch(
  holdings: NftHolding[],
  gateway: string = NETWORK_CONFIG.NFT_IPFS_GATEWAY,
): Promise<Map<string, NftMetadata>> {
  const results = new Map<string, NftMetadata>();
  if (holdings.length === 0) return results;

  // Process in batches of BATCH_CONCURRENCY
  for (let i = 0; i < holdings.length; i += BATCH_CONCURRENCY) {
    const batch = holdings.slice(i, i + BATCH_CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (h) => {
        const key = `${h.tokenAddress}:${h.tokenId}`;
        const uri = await getTokenUri(h.tokenAddress, h.tokenId);
        if (!uri) {
          return { key, metadata: { name: null, description: null, image: null, rawTokenUri: null } as NftMetadata };
        }
        const metadata = await fetchNftMetadata(uri, gateway);
        return { key, metadata };
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.set(result.value.key, result.value.metadata);
      }
    }
  }

  return results;
}

// --- ERC1155 ---

/**
 * Call uri(uint256) on an ERC1155 contract and apply {id} substitution per spec.
 * ERC1155 spec: replace `{id}` in the URI with the hex-encoded tokenId,
 * zero-padded to 64 lowercase hex characters (no 0x prefix).
 */
export async function getErc1155Uri(
  tokenAddress: string,
  tokenId: string,
): Promise<string | null> {
  try {
    const contract = new QuaisContract(getAddress(tokenAddress), ERC1155_URI_ABI, getActiveProvider());
    let uri: string = await contract.uri(tokenId);
    if (!uri) return null;

    // ERC1155 {id} substitution: zero-padded 64-char lowercase hex
    if (uri.includes('{id}')) {
      const hex = BigInt(tokenId).toString(16).padStart(64, '0');
      uri = uri.replace('{id}', hex);
    }

    return uri;
  } catch (e) {
    console.warn(`[NftMetadataService] ERC1155 uri() not supported for ${tokenAddress}#${tokenId}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Fetch metadata for multiple ERC1155 holdings, processing in batches.
 * Uses getErc1155Uri instead of getTokenUri; otherwise identical to getNftMetadataBatch.
 */
export async function getErc1155MetadataBatch(
  holdings: Array<{ tokenAddress: string; tokenId: string }>,
  gateway: string = NETWORK_CONFIG.NFT_IPFS_GATEWAY,
): Promise<Map<string, NftMetadata>> {
  const results = new Map<string, NftMetadata>();
  if (holdings.length === 0) return results;

  for (let i = 0; i < holdings.length; i += BATCH_CONCURRENCY) {
    const batch = holdings.slice(i, i + BATCH_CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (h) => {
        const key = `${h.tokenAddress}:${h.tokenId}`;
        const uri = await getErc1155Uri(h.tokenAddress, h.tokenId);
        if (!uri) {
          return { key, metadata: { name: null, description: null, image: null, rawTokenUri: null } as NftMetadata };
        }
        const metadata = await fetchNftMetadata(uri, gateway);
        return { key, metadata };
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.set(result.value.key, result.value.metadata);
      }
    }
  }

  return results;
}
