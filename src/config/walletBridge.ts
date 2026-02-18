import { BrowserProvider } from 'quais';
import type { Signer } from '../types';

/**
 * Bridge a wagmi/viem connector client to a quais Signer.
 *
 * The connector client's `transport` property implements the EIP-1193 interface
 * (has a `request` method), which is what quais BrowserProvider accepts.
 * This keeps the entire existing service layer unchanged.
 */
export async function connectorClientToQuaisSigner(
  client: { transport: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }
): Promise<Signer> {
  const { transport } = client;
  const provider = new BrowserProvider(transport, undefined);
  const signer = await provider.getSigner();
  return signer;
}
