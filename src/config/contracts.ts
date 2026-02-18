import { isAddress } from 'quais';

// Contract addresses from environment variables
export const CONTRACT_ADDRESSES = {
  QUAIVAULT_IMPLEMENTATION: import.meta.env.VITE_QUAIVAULT_IMPLEMENTATION || '',
  QUAIVAULT_FACTORY: import.meta.env.VITE_QUAIVAULT_FACTORY || '',
  SOCIAL_RECOVERY_MODULE: import.meta.env.VITE_SOCIAL_RECOVERY_MODULE || '',
  DAILY_LIMIT_MODULE: import.meta.env.VITE_DAILY_LIMIT_MODULE || '',
  WHITELIST_MODULE: import.meta.env.VITE_WHITELIST_MODULE || '',
  MULTISEND: import.meta.env.VITE_MULTISEND || '',
};

// Network configuration
export const NETWORK_CONFIG = {
  RPC_URL: import.meta.env.VITE_RPC_URL || 'https://rpc.orchard.quai.network',
  CHAIN_ID: Number(import.meta.env.VITE_CHAIN_ID) || 15000,
  BLOCK_EXPLORER_URL: import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://orchard.quaiscan.io',
};

// Block lookback ranges for event queries (blockchain fallback when indexer is offline).
// At ~5s block time, -50000 covers ~3 days of history. The indexer is the primary data
// source; these ranges only apply when the indexer is unavailable. If the RPC node rejects
// the range (e.g. "exceeds maximum limit"), the fallback is used automatically.
export const EVENT_QUERY_RANGE = -50000;
export const EVENT_QUERY_RANGE_FALLBACK = -10000;

// UI timing constants (milliseconds)
// Quai Network block time is ~5s; indexer waits for 1 confirmation
export const TIMING = {
  /** Debounce delay for user input validation (whitelist/daily limit checks) */
  INPUT_DEBOUNCE: 500,
  /** Duration to show "Copied!" feedback after clipboard copy */
  COPY_FEEDBACK: 2000,
  /** Wait after tx submission for indexer to pick up confirmation */
  TX_MINE_WAIT: 3000,
  /** Delay before redirecting after wallet creation (shows success state) */
  WALLET_CREATED_REDIRECT: 5000,
} as const;

// Required contract addresses that must be configured for the app to function
const REQUIRED_ADDRESSES: Array<{ key: keyof typeof CONTRACT_ADDRESSES; envVar: string }> = [
  { key: 'QUAIVAULT_FACTORY', envVar: 'VITE_QUAIVAULT_FACTORY' },
  { key: 'QUAIVAULT_IMPLEMENTATION', envVar: 'VITE_QUAIVAULT_IMPLEMENTATION' },
];

/**
 * Validate that required contract addresses are configured and valid.
 * Call this at app startup to catch misconfiguration early.
 * @returns Array of error messages (empty if all valid)
 */
export function validateContractConfig(): string[] {
  const errors: string[] = [];

  for (const { key, envVar } of REQUIRED_ADDRESSES) {
    const address = CONTRACT_ADDRESSES[key];
    if (!address) {
      errors.push(`Missing required contract address: ${envVar}`);
    } else if (!isAddress(address)) {
      errors.push(`Invalid contract address for ${envVar}: "${address}"`);
    }
  }

  // Warn about optional module addresses (non-blocking)
  const optionalAddresses: Array<{ key: keyof typeof CONTRACT_ADDRESSES; name: string }> = [
    { key: 'SOCIAL_RECOVERY_MODULE', name: 'Social Recovery' },
    { key: 'DAILY_LIMIT_MODULE', name: 'Daily Limit' },
    { key: 'WHITELIST_MODULE', name: 'Whitelist' },
  ];

  for (const { key, name } of optionalAddresses) {
    const address = CONTRACT_ADDRESSES[key];
    if (address && !isAddress(address)) {
      errors.push(`Invalid ${name} module address: "${address}"`);
    }
  }

  return errors;
}
