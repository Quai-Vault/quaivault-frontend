import { JsonRpcProvider } from 'quais';
import { NETWORK_CONFIG } from './contracts';
import type { Provider } from '../types';

/**
 * Shared JsonRpcProvider singleton.
 * quais JsonRpcProvider is safe for concurrent requests — no need for
 * multiple instances pointing at the same RPC URL.
 *
 * NOTE: This provider's _detectNetwork() blocks all requests until the RPC
 * responds. When the RPC is down, operations will hang until retries exhaust.
 * Use getActiveProvider() to prefer the wallet's BrowserProvider when available.
 */
export const sharedProvider = new JsonRpcProvider(
  NETWORK_CONFIG.RPC_URL,
  undefined,
  { usePathing: true }
);

// Wallet's BrowserProvider — set when wallet connects, cleared on disconnect.
// The BrowserProvider routes reads through the wallet extension's own RPC
// connection, which works even when the public RPC endpoint is down.
let walletProvider: Provider | null = null;

/**
 * Set or clear the wallet's BrowserProvider.
 * Called by useWallet on connect/disconnect.
 */
export function setWalletProvider(provider: Provider | null): void {
  walletProvider = provider;
}

/**
 * Get the best available provider for read operations.
 * Prefers the wallet's BrowserProvider (already authenticated, working RPC)
 * when connected; falls back to the shared JsonRpcProvider.
 */
export function getActiveProvider(): Provider {
  return walletProvider || sharedProvider;
}
