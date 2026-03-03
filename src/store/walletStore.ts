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
  walletsInfo: Record<string, WalletInfo>;

  // Pending transactions
  pendingTransactions: Record<string, PendingTransaction[]>;

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
  walletsInfo: {} as Record<string, WalletInfo>,
  pendingTransactions: {} as Record<string, PendingTransaction[]>,
  isLoading: false,
  error: null,
};

/** Enforce max size on a Record by removing oldest keys (FIFO by insertion order). */
function enforceRecordLimit<T>(record: Record<string, T>, max: number): Record<string, T> {
  const keys = Object.keys(record);
  if (keys.length <= max) return record;
  const trimmed = { ...record };
  for (let i = 0; i < keys.length - max; i++) {
    delete trimmed[keys[i]];
  }
  return trimmed;
}

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
        set((state) => {
          if (state.wallets.some(w => w.toLowerCase() === walletAddress.toLowerCase())) {
            return { wallets: state.wallets };
          }
          const updated = [...state.wallets, walletAddress].slice(-MAX_STORED_WALLETS);
          return { wallets: updated };
        }),

      setWallets: (wallets) =>
        set({ wallets }),

      setWalletInfo: (walletAddress, info) =>
        set((state) => {
          const key = walletAddress.toLowerCase();
          const updated = { ...state.walletsInfo, [key]: info };
          return { walletsInfo: enforceRecordLimit(updated, MAX_STORED_WALLETS) };
        }),

      setPendingTransactions: (walletAddress, txs) =>
        set((state) => {
          const key = walletAddress.toLowerCase();
          const updated = { ...state.pendingTransactions, [key]: txs };
          return { pendingTransactions: enforceRecordLimit(updated, MAX_STORED_WALLETS) };
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
      // Only wallets list and current wallet are persisted.
      // BigInt fields (balance, etc.) live in walletsInfo which is NOT persisted,
      // so JSON serialization of BigInt is not an issue.
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
