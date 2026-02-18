import { useEffect, useCallback, useRef } from 'react';
import { useWalletStore } from '../store/walletStore';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useConnectorClient, useDisconnect } from 'wagmi';
import { multisigService } from '../services/MultisigService';
import { indexerService } from '../services/indexer';
import { connectorClientToQuaisSigner } from '../config/walletBridge';
import type { Signer } from '../types';

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

  // Get the raw connector client (has EIP-1193 transport)
  const { data: connectorClient } = useConnectorClient();

  // Keep a ref to the signer for signMessage and to avoid duplicate bridging
  const signerRef = useRef<Signer | null>(null);
  const lastClientRef = useRef<typeof connectorClient | null>(null);

  // Bridge wagmi connector client -> quais Signer -> multisigService
  useEffect(() => {
    if (connectorClient === lastClientRef.current) return;
    lastClientRef.current = connectorClient;

    // Guard against stale async callbacks during rapid account switches
    let isActive = true;

    if (connectorClient && isConnected && address) {
      connectorClientToQuaisSigner(connectorClient)
        .then((signer) => {
          if (!isActive) return;
          signerRef.current = signer;
          multisigService.setSigner(signer);
          setConnected(true, address);
        })
        .catch((err) => {
          if (!isActive) return;
          console.error('Failed to create quais signer from connector:', err);
          setError(err instanceof Error ? err.message : 'Failed to initialize signer');
        });
    } else if (!isConnected) {
      signerRef.current = null;
      multisigService.setSigner(null);
      indexerService.cleanup();
      setConnected(false, null);
    }

    return () => { isActive = false; };
  }, [connectorClient, isConnected, address, setConnected, setError]);

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
