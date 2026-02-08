import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia for responsive tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
});

// Mock window.open for block explorer tests
vi.spyOn(window, 'open').mockImplementation(() => null);

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock import.meta.env
vi.mock('../config/contracts', () => ({
  CONTRACT_ADDRESSES: {
    QUAIVAULT_IMPLEMENTATION: '0x1234567890123456789012345678901234567890',
    QUAIVAULT_FACTORY: '0x2345678901234567890123456789012345678901',
    SOCIAL_RECOVERY_MODULE: '0x3456789012345678901234567890123456789012',
    DAILY_LIMIT_MODULE: '0x4567890123456789012345678901234567890123',
    WHITELIST_MODULE: '0x5678901234567890123456789012345678901234',
    MULTISEND: '0x6789012345678901234567890123456789012345',
  },
  NETWORK_CONFIG: {
    RPC_URL: 'https://rpc.test.quai.network',
    CHAIN_ID: 9000,
    BLOCK_EXPLORER_URL: 'https://quaiscan.io',
  },
}));

// Mock quais library
vi.mock('quais', () => ({
  formatQuai: vi.fn((value: string | bigint) => {
    // String-based division to avoid floating-point precision loss for large values
    const str = typeof value === 'string' ? value : value.toString();
    const padded = str.padStart(19, '0');
    const intPart = padded.slice(0, padded.length - 18) || '0';
    const fracPart = padded.slice(padded.length - 18).replace(/0+$/, '') || '0';
    return fracPart === '0' ? intPart : `${intPart}.${fracPart}`;
  }),
  parseQuai: vi.fn((value: string) => {
    // String-based multiplication to match quais behavior
    const [intPart, fracPart = ''] = value.split('.');
    const paddedFrac = fracPart.padEnd(18, '0').slice(0, 18);
    return BigInt(intPart + paddedFrac);
  }),
  Interface: vi.fn().mockImplementation(() => ({
    parseTransaction: vi.fn(),
    parseError: vi.fn(),
    encodeFunctionData: vi.fn(),
    getFunction: vi.fn(),
  })),
  Contract: vi.fn(),
  BrowserProvider: vi.fn(),
  JsonRpcProvider: vi.fn().mockImplementation(function(this: any) {
    this.getNetwork = vi.fn();
  }),
  isAddress: vi.fn((address: string) => /^0x[a-fA-F0-9]{40}$/.test(address)),
  isQuaiAddress: vi.fn((address: string) => /^0x[a-fA-F0-9]{40}$/.test(address)),
  getAddress: vi.fn((address: string) => {
    // Simple checksum implementation - returns address as-is for valid addresses
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error('Invalid address');
    }
    return address;
  }),
  AbiCoder: {
    defaultAbiCoder: vi.fn(() => ({
      decode: vi.fn(),
    })),
  },
  ZeroAddress: '0x0000000000000000000000000000000000000000',
}));

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
