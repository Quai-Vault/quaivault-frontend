import { createClient } from '@supabase/supabase-js';
import { NETWORK_CONFIG } from './contracts';
import { quoteUnsafeIntegers } from '../utils/jsonBigInt';

const DEDICATED_SUPABASE_URL = import.meta.env.VITE_DAOSHIPS_SUPABASE_URL;
const DEDICATED_SUPABASE_ANON_KEY = import.meta.env.VITE_DAOSHIPS_SUPABASE_ANON_KEY;
const HAS_PARTIAL_DEDICATED_CONFIG = Boolean(DEDICATED_SUPABASE_URL) !== Boolean(DEDICATED_SUPABASE_ANON_KEY);
const SUPABASE_URL = HAS_PARTIAL_DEDICATED_CONFIG
  ? undefined
  : DEDICATED_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = HAS_PARTIAL_DEDICATED_CONFIG
  ? undefined
  : DEDICATED_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const NETWORK_SCHEMA = import.meta.env.VITE_DAOSHIPS_NETWORK_SCHEMA
  || import.meta.env.VITE_NETWORK_SCHEMA
  || 'testnet';

async function bigIntSafeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if ([204, 205, 304].includes(response.status)) return response;
  if (!(response.headers.get('content-type') ?? '').includes('json')) return response;

  const body = quoteUnsafeIntegers(await response.text());
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const daoShipsSupabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: NETWORK_SCHEMA },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: bigIntSafeFetch },
    })
  : null;

if (HAS_PARTIAL_DEDICATED_CONFIG) {
  console.error('[DAO Ships] Both dedicated Supabase URL and anon key must be configured together.');
}

function trustedAppBaseUrl(): string {
  const fallback = NETWORK_CONFIG.CHAIN_ID === 9
    ? 'https://daoships.org'
    : 'https://testnet.daoships.org';

  try {
    const url = new URL(import.meta.env.VITE_DAOSHIPS_APP_URL || fallback);
    if (url.protocol !== 'https:') return fallback;
    return url.origin;
  } catch {
    return fallback;
  }
}

export const DAO_SHIPS_CONFIG = {
  ENABLED: !!daoShipsSupabase,
  NETWORK_SCHEMA,
  EXPECTED_CHAIN_ID: NETWORK_CONFIG.CHAIN_ID,
  APP_BASE_URL: trustedAppBaseUrl(),
  STALE_AFTER_MS: 10 * 60 * 1000,
  QUERY_CHUNK_SIZE: 25,
} as const;

export function getDaoShipsDaoUrl(daoAddress: string): string {
  return `${DAO_SHIPS_CONFIG.APP_BASE_URL}/dao/${encodeURIComponent(daoAddress.toLowerCase())}`;
}
