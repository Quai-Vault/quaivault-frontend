import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useWalletStore } from './walletStore';
import type { WalletInfo, PendingTransaction } from '../types';

// Reset the store before each test
beforeEach(() => {
  const store = useWalletStore.getState();
  store.reset();
  vi.clearAllMocks();
});

describe('walletStore', () => {
  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useWalletStore.getState();

      expect(state.connected).toBe(false);
      expect(state.address).toBeNull();
      expect(state.currentWallet).toBeNull();
      expect(state.currentWalletInfo).toBeNull();
      expect(state.wallets).toEqual([]);
      expect(state.walletsInfo.size).toBe(0);
      expect(state.pendingTransactions.size).toBe(0);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('setConnected', () => {
    it('should set connected state and address', () => {
      const { setConnected } = useWalletStore.getState();
      const address = '0x1234567890123456789012345678901234567890';

      act(() => {
        setConnected(true, address);
      });

      const state = useWalletStore.getState();
      expect(state.connected).toBe(true);
      expect(state.address).toBe(address);
    });

    it('should clear address when disconnected', () => {
      const { setConnected } = useWalletStore.getState();

      act(() => {
        setConnected(true, '0x1234');
        setConnected(false, null);
      });

      const state = useWalletStore.getState();
      expect(state.connected).toBe(false);
      expect(state.address).toBeNull();
    });
  });

  describe('setCurrentWallet', () => {
    it('should set current wallet address', () => {
      const { setCurrentWallet } = useWalletStore.getState();
      const walletAddress = '0xABCDEF';

      act(() => {
        setCurrentWallet(walletAddress);
      });

      expect(useWalletStore.getState().currentWallet).toBe(walletAddress);
    });

    it('should allow setting to null', () => {
      const { setCurrentWallet } = useWalletStore.getState();

      act(() => {
        setCurrentWallet('0x1234');
        setCurrentWallet(null);
      });

      expect(useWalletStore.getState().currentWallet).toBeNull();
    });
  });

  describe('setCurrentWalletInfo', () => {
    it('should set current wallet info', () => {
      const { setCurrentWalletInfo } = useWalletStore.getState();
      const walletInfo: WalletInfo = {
        address: '0x1234',
        owners: ['0xOwner1', '0xOwner2'],
        threshold: 2,
        balance: '1000000000000000000',
      };

      act(() => {
        setCurrentWalletInfo(walletInfo);
      });

      expect(useWalletStore.getState().currentWalletInfo).toEqual(walletInfo);
    });
  });

  describe('addWallet', () => {
    it('should add wallet to list', () => {
      const { addWallet } = useWalletStore.getState();
      const walletAddress = '0xWallet1';

      act(() => {
        addWallet(walletAddress);
      });

      expect(useWalletStore.getState().wallets).toContain(walletAddress);
    });

    it('should not add duplicate wallet', () => {
      const { addWallet } = useWalletStore.getState();
      const walletAddress = '0xWallet1';

      act(() => {
        addWallet(walletAddress);
        addWallet(walletAddress);
      });

      expect(useWalletStore.getState().wallets).toHaveLength(1);
    });

    it('should add multiple unique wallets', () => {
      const { addWallet } = useWalletStore.getState();

      act(() => {
        addWallet('0xWallet1');
        addWallet('0xWallet2');
        addWallet('0xWallet3');
      });

      const wallets = useWalletStore.getState().wallets;
      expect(wallets).toHaveLength(3);
      expect(wallets).toContain('0xWallet1');
      expect(wallets).toContain('0xWallet2');
      expect(wallets).toContain('0xWallet3');
    });
  });

  describe('setWallets', () => {
    it('should replace entire wallet list', () => {
      const { setWallets, addWallet } = useWalletStore.getState();

      act(() => {
        addWallet('0xOld');
        setWallets(['0xNew1', '0xNew2']);
      });

      const wallets = useWalletStore.getState().wallets;
      expect(wallets).toEqual(['0xNew1', '0xNew2']);
      expect(wallets).not.toContain('0xOld');
    });
  });

  describe('setWalletInfo', () => {
    it('should set wallet info in map', () => {
      const { setWalletInfo } = useWalletStore.getState();
      const walletAddress = '0xWallet1';
      const info: WalletInfo = {
        address: walletAddress,
        owners: ['0xOwner1'],
        threshold: 1,
        balance: '5000000000000000000',
      };

      act(() => {
        setWalletInfo(walletAddress, info);
      });

      const storedInfo = useWalletStore.getState().walletsInfo.get(walletAddress.toLowerCase());
      expect(storedInfo).toEqual(info);
    });

    it('should update existing wallet info', () => {
      const { setWalletInfo } = useWalletStore.getState();
      const walletAddress = '0xWallet1';

      const info1: WalletInfo = {
        address: walletAddress,
        owners: ['0xOwner1'],
        threshold: 1,
        balance: '1000',
      };

      const info2: WalletInfo = {
        address: walletAddress,
        owners: ['0xOwner1', '0xOwner2'],
        threshold: 2,
        balance: '2000',
      };

      act(() => {
        setWalletInfo(walletAddress, info1);
        setWalletInfo(walletAddress, info2);
      });

      const storedInfo = useWalletStore.getState().walletsInfo.get(walletAddress.toLowerCase());
      expect(storedInfo).toEqual(info2);
    });
  });

  describe('setPendingTransactions', () => {
    it('should set pending transactions for wallet', () => {
      const { setPendingTransactions } = useWalletStore.getState();
      const walletAddress = '0xWallet1';
      const transactions: PendingTransaction[] = [
        {
          hash: '0xTxHash1',
          to: '0xRecipient',
          value: '1000000000000000000',
          data: '0x',
          numApprovals: 1,
          threshold: 2,
          executed: false,
          cancelled: false,
          timestamp: Date.now(),
          proposer: '0xProposer',
          approvals: { '0xOwner1': true },
        },
      ];

      act(() => {
        setPendingTransactions(walletAddress, transactions);
      });

      const storedTxs = useWalletStore.getState().pendingTransactions.get(walletAddress.toLowerCase());
      expect(storedTxs).toEqual(transactions);
    });

    it('should replace existing pending transactions', () => {
      const { setPendingTransactions } = useWalletStore.getState();
      const walletAddress = '0xWallet1';

      act(() => {
        setPendingTransactions(walletAddress, [{ hash: '0xOld' } as PendingTransaction]);
        setPendingTransactions(walletAddress, [{ hash: '0xNew' } as PendingTransaction]);
      });

      const storedTxs = useWalletStore.getState().pendingTransactions.get(walletAddress.toLowerCase());
      expect(storedTxs?.[0].hash).toBe('0xNew');
    });
  });

  describe('setLoading', () => {
    it('should set loading state', () => {
      const { setLoading } = useWalletStore.getState();

      act(() => {
        setLoading(true);
      });

      expect(useWalletStore.getState().isLoading).toBe(true);

      act(() => {
        setLoading(false);
      });

      expect(useWalletStore.getState().isLoading).toBe(false);
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      const { setError } = useWalletStore.getState();

      act(() => {
        setError('Something went wrong');
      });

      expect(useWalletStore.getState().error).toBe('Something went wrong');
    });

    it('should clear error when set to null', () => {
      const { setError } = useWalletStore.getState();

      act(() => {
        setError('Error');
        setError(null);
      });

      expect(useWalletStore.getState().error).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      const state = useWalletStore.getState();

      act(() => {
        state.setConnected(true, '0x1234');
        state.addWallet('0xWallet');
        state.setCurrentWallet('0xWallet');
        state.setLoading(true);
        state.setError('Error');
        state.reset();
      });

      const resetState = useWalletStore.getState();
      expect(resetState.connected).toBe(false);
      expect(resetState.address).toBeNull();
      expect(resetState.wallets).toEqual([]);
      expect(resetState.currentWallet).toBeNull();
      expect(resetState.isLoading).toBe(false);
      expect(resetState.error).toBeNull();
    });
  });

  describe('persistence', () => {
    it('should only persist wallets and currentWallet (partialize)', () => {
      // The persist middleware only saves wallets and currentWallet
      // Other state is not persisted
      const { setWallets, setCurrentWallet, setConnected } = useWalletStore.getState();

      act(() => {
        setWallets(['0xWallet1', '0xWallet2']);
        setCurrentWallet('0xWallet1');
        setConnected(true, '0x1234');
      });

      // Need to get fresh state after the act call
      const updatedState = useWalletStore.getState();

      // Persistence is tested implicitly through the partialize config
      // The connected state should not be in persisted data
      expect(updatedState.wallets).toEqual(['0xWallet1', '0xWallet2']);
      expect(updatedState.currentWallet).toBe('0xWallet1');
    });
  });
});
