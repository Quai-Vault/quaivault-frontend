import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectContractType, fetchTokenMetadata } from './ContractMetadataService';
import type { ContractAbi } from './ContractMetadataService';

const { contractCalls } = vi.hoisted(() => ({
  contractCalls: {
    name: vi.fn(),
    symbol: vi.fn(),
    decimals: vi.fn(),
  },
}));

vi.mock('quais', () => ({
  getAddress: (a: string) => a,
  Contract: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.name = contractCalls.name;
    this.symbol = contractCalls.symbol;
    this.decimals = contractCalls.decimals;
  }),
  Interface: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.parseTransaction = vi.fn();
  }),
}));

vi.mock('../../config/provider', () => ({
  getActiveProvider: () => ({}),
}));

/** Build an ABI from function names, plus non-function noise. */
function abiWith(...functionNames: string[]): ContractAbi {
  return [
    { type: 'event', name: 'Transfer' },
    { type: 'constructor' },
    ...functionNames.map((name) => ({ type: 'function', name })),
  ] as ContractAbi;
}

const ERC20 = ['transfer', 'balanceOf', 'approve', 'totalSupply', 'transferFrom'];
const ERC721 = ['ownerOf', 'safeTransferFrom', 'approve', 'setApprovalForAll', 'balanceOf'];
const ERC1155 = ['balanceOfBatch', 'safeBatchTransferFrom', 'setApprovalForAll', 'safeTransferFrom', 'balanceOf'];

describe('detectContractType', () => {
  it('identifies an ERC-20', () => {
    expect(detectContractType(abiWith(...ERC20))).toBe('erc20');
  });

  it('identifies an ERC-721', () => {
    expect(detectContractType(abiWith(...ERC721))).toBe('erc721');
  });

  it('identifies an ERC-1155', () => {
    expect(detectContractType(abiWith(...ERC1155))).toBe('erc1155');
  });

  // ERC-1155 shares safeTransferFrom and setApprovalForAll with ERC-721, so
  // check order decides this. Getting it wrong shows a single-token transfer
  // form for a contract that needs an amount as well as an id.
  it('does not mistake an ERC-1155 for an ERC-721', () => {
    const ambiguous = abiWith(...ERC1155, 'ownerOf', 'approve');

    expect(detectContractType(ambiguous)).toBe('erc1155');
  });

  // An NFT also has balanceOf and approve; without the ownerOf exclusion it
  // could read as a fungible token and offer an amount field.
  it('does not mistake an ERC-721 for an ERC-20', () => {
    const ambiguous = abiWith(...ERC721, 'transfer', 'totalSupply');

    expect(detectContractType(ambiguous)).toBe('erc721');
  });

  it('refuses to call something an ERC-20 when it exposes ownerOf', () => {
    const ambiguous = abiWith('transfer', 'balanceOf', 'approve', 'totalSupply', 'ownerOf');

    expect(detectContractType(ambiguous)).not.toBe('erc20');
  });

  describe('falls back to generic', () => {
    it('for an unrelated contract', () => {
      expect(detectContractType(abiWith('doSomething', 'configure'))).toBe('generic');
    });

    it('for an empty ABI', () => {
      expect(detectContractType([])).toBe('generic');
    });

    it.each([
      ['ERC-20 without totalSupply', ['transfer', 'balanceOf', 'approve']],
      ['ERC-721 without setApprovalForAll', ['ownerOf', 'safeTransferFrom', 'approve']],
      ['ERC-1155 without balanceOfBatch', ['safeBatchTransferFrom', 'setApprovalForAll']],
    ])('for a partial %s', (_label, names) => {
      expect(detectContractType(abiWith(...names))).toBe('generic');
    });
  });

  it('ignores events and other non-function entries', () => {
    const withNoise = [
      { type: 'event', name: 'ownerOf' },
      { type: 'error', name: 'balanceOfBatch' },
      ...ERC20.map((name) => ({ type: 'function', name })),
    ] as ContractAbi;

    expect(detectContractType(withNoise)).toBe('erc20');
  });
});

describe('fetchTokenMetadata', () => {
  let nextAddress = 0;
  const freshAddress = () =>
    '0x' + String(++nextAddress).padStart(40, '0');

  beforeEach(() => {
    vi.clearAllMocks();
    contractCalls.name.mockResolvedValue('Test Token');
    contractCalls.symbol.mockResolvedValue('TT');
    contractCalls.decimals.mockResolvedValue(18n);
  });

  it('returns the metadata a token reports', async () => {
    expect(await fetchTokenMetadata(freshAddress())).toEqual({
      name: 'Test Token',
      symbol: 'TT',
      decimals: 18,
    });
  });

  it('converts decimals from bigint to number', async () => {
    contractCalls.decimals.mockResolvedValue(6n);

    expect((await fetchTokenMetadata(freshAddress())).decimals).toBe(6);
  });

  // Plenty of tokens omit one of these; a single failure must not lose the
  // fields that did resolve.
  it('keeps the fields that resolved when one call fails', async () => {
    contractCalls.symbol.mockRejectedValue(new Error('not implemented'));

    expect(await fetchTokenMetadata(freshAddress())).toEqual({
      name: 'Test Token',
      symbol: null,
      decimals: 18,
    });
  });

  it('reports nulls rather than throwing when every call fails', async () => {
    contractCalls.name.mockRejectedValue(new Error('nope'));
    contractCalls.symbol.mockRejectedValue(new Error('nope'));
    contractCalls.decimals.mockRejectedValue(new Error('nope'));

    expect(await fetchTokenMetadata(freshAddress())).toEqual({
      name: null,
      symbol: null,
      decimals: null,
    });
  });

  // Caching belongs to the caller: the only call site is a react-query with
  // staleTime Infinity. This function now always asks the contract, so the
  // retry above it can actually reach the network.
  describe('caching', () => {
    it('asks the contract every time rather than memoising', async () => {
      const address = freshAddress();

      await fetchTokenMetadata(address);
      await fetchTokenMetadata(address);

      expect(contractCalls.name).toHaveBeenCalledTimes(2);
    });

    it('recovers once a failing call starts succeeding', async () => {
      const address = freshAddress();
      contractCalls.name.mockRejectedValue(new Error('rpc down'));
      contractCalls.symbol.mockRejectedValue(new Error('rpc down'));
      contractCalls.decimals.mockRejectedValue(new Error('rpc down'));

      expect(await fetchTokenMetadata(address)).toEqual({
        name: null,
        symbol: null,
        decimals: null,
      });

      contractCalls.name.mockResolvedValue('Recovered');
      contractCalls.symbol.mockResolvedValue('REC');
      contractCalls.decimals.mockResolvedValue(18n);

      expect(await fetchTokenMetadata(address)).toEqual({
        name: 'Recovered',
        symbol: 'REC',
        decimals: 18,
      });
    });
  });
});
