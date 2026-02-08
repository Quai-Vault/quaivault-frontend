import { vi } from 'vitest';
import type { WalletInfo, PendingTransaction } from '../types';

// Mock wallet info for testing
export const mockWalletInfo: WalletInfo = {
  address: '0x1234567890123456789012345678901234567890',
  owners: ['0xOwner1', '0xOwner2', '0xOwner3'],
  threshold: 2,
  balance: '5000000000000000000', // 5 QUAI
};

// Mock pending transactions
export const mockPendingTransactions: PendingTransaction[] = [
  {
    hash: '0xTxHash1234567890123456789012345678901234567890123456789012345678',
    to: '0xRecipient12345678901234567890123456789012',
    value: '1000000000000000000',
    data: '0x',
    numApprovals: 1,
    threshold: 2,
    executed: false,
    cancelled: false,
    timestamp: Date.now(),
    proposer: '0xOwner1',
    approvals: { '0xOwner1': true, '0xOwner2': false },
  },
];

// Mock useMultisig hook
export const mockUseMultisig = {
  walletInfo: mockWalletInfo,
  pendingTransactions: mockPendingTransactions,
  executedTransactions: [],
  isLoadingInfo: false,
  isLoadingPending: false,
  isLoadingExecuted: false,
  isRefetchingWalletInfo: false,
  refetchWalletInfo: vi.fn(),
  refetchPendingTransactions: vi.fn(),
  refetchExecutedTransactions: vi.fn(),
  refetchAll: vi.fn(),
};

// Create mock for useMultisig with custom overrides
export function createMockUseMultisig(overrides: Partial<typeof mockUseMultisig> = {}) {
  return {
    ...mockUseMultisig,
    ...overrides,
  };
}

// Mock useWallet hook
export const mockUseWallet = {
  connected: true,
  address: '0xOwner1',
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnecting: false,
};

// Test render wrapper utilities
export function createTestQueryClient() {
  const { QueryClient } = require('@tanstack/react-query');
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
        staleTime: 0,
      },
    },
  });
}
