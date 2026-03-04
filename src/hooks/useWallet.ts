import { useEffect, useCallback, useRef } from 'react';
import { useWalletStore } from '../store/walletStore';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useAccount, useDisconnect } from 'wagmi';
import { multisigService } from '../services/MultisigService';
import { indexerService } from '../services/indexer';
import { providerToQuaisSigner } from '../config/walletBridge';
import { setWalletProvider } from '../config/provider';
import type { Signer, Provider } from '../types';

export function useWallet() {
  const {
    setConnected,
    setError,
    setLoading,
  } = useWalletStore();

  // AppKit hooks for connection state
  const { address, isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  // Get the active connector (provides raw EIP-1193 provider, no chain validation)
  const { connector } = useAccount();

  // Keep a ref to the signer for signMessage
  const signerRef = useRef<Signer | null>(null);

  // Sync connection state immediately so wallet list loads without waiting for the signer bridge.
  // The signer bridge can fail if the wallet's chain ID doesn't match wagmi's configured chain,
  // but read-only operations (wallet list, balances) only need the address.
  useEffect(() => {
    if (isConnected && address) {
      setConnected(true, address);
    } else if (!isConnected) {
      signerRef.current = null;
      multisigService.setSigner(null);
      setWalletProvider(null);
      indexerService.cleanup();
      setConnected(false, null);
    }
  }, [isConnected, address, setConnected]);

  // Bridge connector raw EIP-1193 provider -> quais Signer -> multisigService (for signing txs).
  // Uses connector.getProvider() directly to bypass wagmi's chain validation, which blocks
  // useConnectorClient() when the wallet reports a chain ID not in wagmi's configured list.
  // NOTE: no ref-guard here — the isActive flag handles cancellation. A ref guard would cause
  // the signer to never be set under React 18 strict mode (effects run twice, second run skipped).
  useEffect(() => {
    if (!connector || !isConnected || !address) return;
    // Connector may not have getProvider (e.g. during HMR or with certain connector types)
    if (typeof connector.getProvider !== 'function') return;

    // Guard against stale async callbacks during rapid account switches / strict mode double-invoke
    let isActive = true;

    connector.getProvider()
      .then(async (rawProvider) => {
        if (!isActive || !rawProvider) return;

        const typedProvider = rawProvider as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

        const signer = await providerToQuaisSigner(typedProvider);
        if (!isActive) return;
        signerRef.current = signer;
        setWalletProvider(signer.provider as Provider);
        multisigService.setSigner(signer);
      })
      .catch((err) => {
        if (!isActive) return;
        console.error('Failed to create quais signer from connector:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize signer');
      });

    return () => { isActive = false; };
  }, [connector, isConnected, address, setError]);

  // Connect: open the AppKit modal
  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await open();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';
      setError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [open, setError, setLoading]);

  // Disconnect: use wagmi disconnect
  const disconnect = useCallback(() => {
    wagmiDisconnect();
    signerRef.current = null;
    multisigService.setSigner(null);
    setWalletProvider(null);
    indexerService.cleanup();
    setConnected(false, null);
  }, [wagmiDisconnect, setConnected]);

  // Sign message using the bridged quais signer
  const signMessage = useCallback(async (message: string) => {
    if (!signerRef.current) {
      throw new Error('Wallet not connected');
    }
    try {
      return await signerRef.current.signMessage(message);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign message';
      setError(errorMessage);
      throw error;
    }
  }, [setError]);

  return {
    connected: isConnected,
    address: address ?? null,
    connect,
    disconnect,
    signMessage,
  };
}
