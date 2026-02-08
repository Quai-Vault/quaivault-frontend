import { useEffect, useCallback } from 'react';
import { useWalletStore } from '../store/walletStore';
import { walletConnectionService } from '../services/WalletConnectionService';
import { multisigService } from '../services/MultisigService';
import { indexerService } from '../services/indexer';

export function useWallet() {
  const {
    connected,
    address,
    setConnected,
    setError,
    setLoading,
  } = useWalletStore();

  useEffect(() => {
    // Subscribe to wallet connection changes first so we don't miss the reconnect event
    const unsubscribe = walletConnectionService.subscribe((state) => {
      setConnected(state.connected, state.address);

      // Update multisig service signer when connected
      if (state.signer) {
        multisigService.setSigner(state.signer);
      } else {
        // Clear signer when disconnected
        multisigService.setSigner(null);
        // Tear down all indexer subscriptions to prevent channel leaks
        indexerService.cleanup();
      }
    });

    // Sync initial state (may already be connected from a previous hook mount)
    const initialState = walletConnectionService.getState();
    if (initialState.connected) {
      if (initialState.signer) {
        multisigService.setSigner(initialState.signer);
      }
      setConnected(initialState.connected, initialState.address);
    } else {
      // Try to silently reconnect from an existing Pelagus session
      walletConnectionService.tryReconnect();
    }

    return unsubscribe;
  }, [setConnected]);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await walletConnectionService.connect();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';
      setError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setError, setLoading]);

  const disconnect = useCallback(() => {
    walletConnectionService.disconnect();
  }, []);

  const signMessage = useCallback(async (message: string) => {
    try {
      return await walletConnectionService.signMessage(message);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign message';
      setError(errorMessage);
      throw error;
    }
  }, [setError]);

  return {
    connected,
    address,
    connect,
    disconnect,
    signMessage,
  };
}
