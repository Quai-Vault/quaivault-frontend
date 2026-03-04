import type { Provider } from '../types';

// Wallet's BrowserProvider — set when wallet connects, cleared on disconnect.
// Routes reads through the wallet extension's own RPC connection (Pelagus or
// WalletConnect), bypassing CORS issues with the public RPC endpoint.
let walletProvider: Provider | null = null;

/**
 * Set or clear the wallet's BrowserProvider.
 * Called by useWallet on connect/disconnect.
 */
export function setWalletProvider(provider: Provider | null): void {
  walletProvider = provider;
}

/**
 * Get the wallet's BrowserProvider for read operations.
 * Throws if no wallet is connected — callers must either guard with
 * hasWalletProvider() or handle the error.
 */
export function getActiveProvider(): Provider {
  if (!walletProvider) {
    throw new Error('No wallet provider available. Connect wallet first.');
  }
  return walletProvider;
}

/**
 * Whether the wallet's BrowserProvider is available.
 * Use this to guard read-only operations that should be skipped
 * when no wallet is connected.
 */
export function hasWalletProvider(): boolean {
  return walletProvider !== null;
}
