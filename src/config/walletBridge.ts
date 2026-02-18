import { BrowserProvider } from 'quais';
import type { Signer } from '../types';

/**
 * Bridge a raw EIP-1193 provider to a quais Signer.
 *
 * Uses the provider's `request` method directly, so this works for both
 * injected wallets (Pelagus) and WalletConnect (Tangem) without requiring
 * wagmi's chain validation to pass.
 */
export async function providerToQuaisSigner(
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
): Promise<Signer> {
  const quaisProvider = new BrowserProvider(provider, undefined);
  const signer = await quaisProvider.getSigner();
  return signer;
}
