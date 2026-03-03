import { vi } from 'vitest';
import type { WalletInfo, PendingTransaction } from '../types';

// Valid-format test addresses (40 hex chars after 0x)
const MOCK_ADDRESSES = {
  wallet: '0x1234567890abcdef1234567890abcdef12345678',
  owner1: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  owner2: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  owner3: '0xcccccccccccccccccccccccccccccccccccccccc',
  recipient: '0xdddddddddddddddddddddddddddddddddddddd',
};

// Mock wallet info for testing
export const mockWalletInfo: WalletInfo = {
  address: MOCK_ADDRESSES.wallet,
  owners: [MOCK_ADDRESSES.owner1, MOCK_ADDRESSES.owner2, MOCK_ADDRESSES.owner3],
  threshold: 2,
  balance: '5000000000000000000', // 5 QUAI
  minExecutionDelay: 0,
};

// Mock pending transactions
export const mockPendingTransactions: PendingTransaction[] = [
  {
    hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    to: MOCK_ADDRESSES.recipient,
    value: '1000000000000000000',
    data: '0x',
    numApprovals: 1,
    threshold: 2,
    executed: false,
    cancelled: false,
    timestamp: Math.floor(Date.now() / 1000), // Unix seconds (matching on-chain uint48)
    proposer: MOCK_ADDRESSES.owner1,
    approvals: { [MOCK_ADDRESSES.owner1]: true, [MOCK_ADDRESSES.owner2]: false },
    status: 'pending',
    expiration: 0,
    executionDelay: 0,
    approvedAt: 0,
    executableAfter: 0,
    isExpired: false,
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
  address: MOCK_ADDRESSES.owner1,
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
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
}
