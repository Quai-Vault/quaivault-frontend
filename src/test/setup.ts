import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';

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

// Mock localStorage. Backed by a real store rather than bare spies: without
// one, setItem records the call but getItem always returns undefined, so
// anything that round-trips a value (preferences, zustand persist) silently
// behaves as though storage were empty. Still spies, so call assertions work.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => (key in store ? store[key] : null)),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    get length() {
      return Object.keys(store).length;
    },
  };
})();
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock import.meta.env
vi.mock('../config/contracts', () => ({
  CONTRACT_ADDRESSES: {
    QUAIVAULT_IMPLEMENTATION: '0x1234567890123456789012345678901234567890',
    QUAIVAULT_FACTORY: '0x2345678901234567890123456789012345678901',
    SOCIAL_RECOVERY_MODULE: '0x3456789012345678901234567890123456789012',
    MULTISEND_CALL_ONLY: '0x6789012345678901234567890123456789012345',
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
  formatUnits: vi.fn((value: string | bigint, decimals: number = 18) => {
    const str = typeof value === 'string' ? value : value.toString();
    const negative = str.startsWith('-');
    const digits = negative ? str.slice(1) : str;
    if (decimals === 0) return (negative ? '-' : '') + digits;
    const padded = digits.padStart(decimals + 1, '0');
    const intPart = padded.slice(0, padded.length - decimals) || '0';
    const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, '');
    const result = fracPart ? `${intPart}.${fracPart}` : intPart;
    return negative ? `-${result}` : result;
  }),
  parseUnits: vi.fn((value: string, decimals: number = 18) => {
    const [intPart, fracPart = ''] = value.split('.');
    const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(intPart + paddedFrac);
  }),
  // Declared with `function` rather than an arrow so `new Interface(...)`
  // works — several modules construct one at module scope.
  Interface: vi.fn().mockImplementation(function (this: any) {
    this.parseTransaction = vi.fn();
    this.parseError = vi.fn();
    this.encodeFunctionData = vi.fn(() => '0xENCODED');
    this.getFunction = vi.fn();
    this.forEachFunction = vi.fn();
  }),
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
  isHexString: vi.fn((value: unknown) => typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)),
  toUtf8Bytes: vi.fn((value: string) => new TextEncoder().encode(value)),
  hexlify: vi.fn((bytes: Uint8Array | string) =>
    typeof bytes === 'string'
      ? bytes
      : '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  ),
  // Not a real keccak — tests only assert that a hash is shown, never its value.
  keccak256: vi.fn((value: string) => '0x' + 'ab'.repeat(32) + `:${String(value).length}`),
}));

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
