import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const NETWORK_SCHEMA = import.meta.env.VITE_NETWORK_SCHEMA || 'testnet';

// Supabase client is only available if credentials are configured
export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: NETWORK_SCHEMA },
    })
  : null;

export const INDEXER_CONFIG = {
  HEALTH_URL: import.meta.env.VITE_INDEXER_URL || 'http://localhost:8081',
  SCHEMA: NETWORK_SCHEMA,
  HEALTH_CACHE_MS: 5000, // Cache health check for 5 seconds for faster recovery detection
  MAX_SUBSCRIPTIONS: 10, // Max concurrent wallet subscriptions per client
  // Feature flag - enable indexer when credentials are available
  ENABLED: !!(SUPABASE_URL && SUPABASE_ANON_KEY),
};
