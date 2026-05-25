import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useWalletStore } from '../store/walletStore';
import { multisigService } from '../services/MultisigService';
import { indexerService } from '../services/indexer';
import { providerToQuaisSigner } from '../config/walletBridge';
import { setWalletProvider } from '../config/provider';
import type { Signer, Provider } from '../types';

export function useWallet() {
  const queryClient = useQueryClient();
  const {
    setConnected,
    setError,
    setLoading,
    setConnectModalOpen,
  } = useWalletStore();

  const { address, isConnected, connector } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  const signerRef = useRef<Signer | null>(null);
  const prevAddressRef = useRef<string | null>(null);

  // Mirror wagmi connection state into our store so the rest of the app
  // (which reads from zustand) stays in sync. Clear stale signer/provider on
  // account switch so queries don't briefly use the previous account's signer.
  useEffect(() => {
    if (isConnected && address) {
      if (prevAddressRef.current && prevAddressRef.current !== address) {
        signerRef.current = null;
        multisigService.setSigner(null);
        setWalletProvider(null);
      }
      prevAddressRef.current = address;
      setConnected(true, address);
    } else if (!isConnected) {
      prevAddressRef.current = null;
      signerRef.current = null;
      multisigService.setSigner(null);
      setWalletProvider(null);
      indexerService.cleanup();
      setConnected(false, null);
    }
  }, [isConnected, address, setConnected]);

  // Bridge connector raw EIP-1193 provider -> quais Signer.
  // We call getProvider() directly to bypass wagmi's chain validation, which
  // would otherwise reject Pelagus's zone-specific chain IDs.
  useEffect(() => {
    if (!connector || !isConnected || !address) return;
    if (typeof connector.getProvider !== 'function') return;

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
        queryClient.invalidateQueries({ queryKey: ['walletInfo'] });
      })
      .catch((err) => {
        if (!isActive) return;
        console.error('Failed to create quais signer from connector:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize signer');
      });

    return () => { isActive = false; };
  }, [connector, isConnected, address, setError, queryClient]);

  const connect = useCallback(() => {
    setError(null);
    setConnectModalOpen(true);
  }, [setError, setConnectModalOpen]);

  const connectWith = useCallback(async (connectorId: 'injected' | 'walletConnect') => {
    const target = connectors.find((c) => c.id === connectorId);
    if (!target) {
      setError(`Connector "${connectorId}" not available`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await connectAsync({ connector: target });
      setConnectModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect wallet';
      setError(message);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [connectAsync, connectors, setError, setLoading, setConnectModalOpen]);

  const disconnect = useCallback(() => {
    wagmiDisconnect();
    signerRef.current = null;
    multisigService.setSigner(null);
    setWalletProvider(null);
    indexerService.cleanup();
    setConnected(false, null);
  }, [wagmiDisconnect, setConnected]);

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
    connectWith,
    disconnect,
    signMessage,
  };
}
