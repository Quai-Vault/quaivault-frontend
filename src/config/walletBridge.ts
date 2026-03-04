import { BrowserProvider } from 'quais';
import type { Signer } from '../types';

/**
 * Bridge a raw EIP-1193 provider to a quais Signer.
 *
 * Uses the provider's `request` method directly, so this works for both
 * injected wallets (Pelagus) and WalletConnect (Tangem) without requiring
 * wagmi's chain validation to pass.
 *
 * We query the chain ID from the wallet itself so BrowserProvider doesn't
 * need to call _detectNetwork (which can hang with CORS-blocked public RPCs)
 * and the ID always matches what the wallet actually reports.
 */
export async function providerToQuaisSigner(
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
): Promise<Signer> {
  const hexChainId = await provider.request({ method: 'eth_chainId' }) as string;
  const chainId = Number(hexChainId);
  const quaisProvider = new BrowserProvider(provider, chainId);
  const signer = await quaisProvider.getSigner();
  return signer;
}
