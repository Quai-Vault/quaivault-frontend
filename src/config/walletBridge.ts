import { BrowserProvider } from 'quais';
import { NETWORK_CONFIG } from './contracts';
import type { Signer } from '../types';

/**
 * Bridge a raw EIP-1193 provider to a quais Signer.
 *
 * Uses the provider's `request` method directly, so this works for both
 * injected wallets (Pelagus) and WalletConnect (Tangem) without requiring
 * wagmi's chain validation to pass.
 *
 * We pass the chain ID explicitly so BrowserProvider doesn't need to call
 * _detectNetwork via the RPC (which can hang if the public RPC has CORS issues).
 */
export async function providerToQuaisSigner(
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
): Promise<Signer> {
  const quaisProvider = new BrowserProvider(provider, NETWORK_CONFIG.CHAIN_ID);
  const signer = await quaisProvider.getSigner();
  return signer;
}
