import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WalletInfo, PendingTransaction } from '../types';

// Maximum number of wallets to store in memory (prevents unbounded growth)
const MAX_STORED_WALLETS = 100;

interface WalletState {
  // Connection state
  connected: boolean;
  address: string | null;

  // Current wallet
  currentWallet: string | null;
  currentWalletInfo: WalletInfo | null;

  // User's wallets
  wallets: string[];
  walletsInfo: Map<string, WalletInfo>;

  // Pending transactions
  pendingTransactions: Map<string, PendingTransaction[]>;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  setConnected: (connected: boolean, address: string | null) => void;
  setCurrentWallet: (walletAddress: string | null) => void;
  setCurrentWalletInfo: (info: WalletInfo | null) => void;
  addWallet: (walletAddress: string) => void;
  setWallets: (wallets: string[]) => void;
  setWalletInfo: (walletAddress: string, info: WalletInfo) => void;
  setPendingTransactions: (walletAddress: string, txs: PendingTransaction[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  connected: false,
  address: null,
  currentWallet: null,
  currentWalletInfo: null,
  wallets: [],
  walletsInfo: new Map(),
  pendingTransactions: new Map(),
  isLoading: false,
  error: null,
};

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      ...initialState,

      setConnected: (connected, address) =>
        set({ connected, address }),

      setCurrentWallet: (walletAddress) =>
        set({ currentWallet: walletAddress }),

      setCurrentWalletInfo: (info) =>
        set({ currentWalletInfo: info }),

      addWallet: (walletAddress) =>
        set((state) => ({
          wallets: state.wallets.some(w => w.toLowerCase() === walletAddress.toLowerCase())
            ? state.wallets
            : [...state.wallets, walletAddress],
        })),

      setWallets: (wallets) =>
        set({ wallets }),

      setWalletInfo: (walletAddress, info) =>
        set((state) => {
          const newMap = new Map(state.walletsInfo);
          newMap.set(walletAddress.toLowerCase(), info);
          // Enforce max size by removing oldest entries (FIFO)
          while (newMap.size > MAX_STORED_WALLETS) {
            const oldestKey = newMap.keys().next().value;
            if (oldestKey !== undefined) {
              newMap.delete(oldestKey);
            } else {
              break;
            }
          }
          return { walletsInfo: newMap };
        }),

      setPendingTransactions: (walletAddress, txs) =>
        set((state) => {
          const newMap = new Map(state.pendingTransactions);
          newMap.set(walletAddress.toLowerCase(), txs);
          // Enforce max size by removing oldest entries (FIFO)
          while (newMap.size > MAX_STORED_WALLETS) {
            const oldestKey = newMap.keys().next().value;
            if (oldestKey !== undefined) {
              newMap.delete(oldestKey);
            } else {
              break;
            }
          }
          return { pendingTransactions: newMap };
        }),

      setLoading: (loading) =>
        set({ isLoading: loading }),

      setError: (error) =>
        set({ error }),

      reset: () =>
        set(initialState),
    }),
    {
      name: 'wallet-storage',
      partialize: (state) => ({
        wallets: state.wallets,
        currentWallet: state.currentWallet,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Validate wallets is an array of strings
        if (!Array.isArray(state.wallets) || !state.wallets.every((w: unknown) => typeof w === 'string')) {
          state.wallets = [];
        }
        // Validate currentWallet is a string or null
        if (state.currentWallet !== null && typeof state.currentWallet !== 'string') {
          state.currentWallet = null;
        }
      },
    }
  )
);
