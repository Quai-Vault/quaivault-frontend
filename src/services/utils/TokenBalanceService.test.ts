import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getERC20Balance,
  getERC20Balances,
  getERC1155Balance,
  getERC1155Balances,
} from './TokenBalanceService';
import type { Token } from '../../types/database';

const WALLET = '0x1111111111111111111111111111111111111111';
const TOKEN_A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/**
 * One contract instance per address, so a test can make a specific token's
 * calls behave differently — which is what the batch fallback needs.
 */
const { contractsByAddress } = vi.hoisted(() => ({
  contractsByAddress: new Map<string, {
    balanceOf: ReturnType<typeof vi.fn>;
    balanceOfBatch: ReturnType<typeof vi.fn>;
  }>(),
}));

vi.mock('quais', () => ({
  Contract: vi.fn().mockImplementation(function (this: Record<string, unknown>, address: string) {
    const key = address.toLowerCase();
    if (!contractsByAddress.has(key)) {
      contractsByAddress.set(key, { balanceOf: vi.fn(), balanceOfBatch: vi.fn() });
    }
    const stub = contractsByAddress.get(key)!;
    this.balanceOf = stub.balanceOf;
    this.balanceOfBatch = stub.balanceOfBatch;
  }),
  formatUnits: (value: string | bigint, decimals = 18) => {
    const str = String(value).padStart(decimals + 1, '0');
    const int = str.slice(0, str.length - decimals) || '0';
    const frac = str.slice(str.length - decimals).replace(/0+$/, '');
    return frac ? `${int}.${frac}` : int;
  },
}));

vi.mock('../../config/provider', () => ({ getActiveProvider: () => ({}) }));

const contractFor = (address: string) => {
  const key = address.toLowerCase();
  if (!contractsByAddress.has(key)) {
    contractsByAddress.set(key, { balanceOf: vi.fn(), balanceOfBatch: vi.fn() });
  }
  return contractsByAddress.get(key)!;
};

const token = (address: string, over: Partial<Token> = {}): Token =>
  ({
    id: `t-${address}`,
    address,
    standard: 'ERC20',
    symbol: 'TT',
    name: 'Test Token',
    decimals: 18,
    discovered_at_block: 1,
    discovered_via: 'transfer',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }) as Token;

describe('TokenBalanceService', () => {
  beforeEach(() => {
    contractsByAddress.clear();
    vi.clearAllMocks();
  });

  describe('getERC20Balance', () => {
    it('reports the raw balance alongside a formatted one', async () => {
      contractFor(TOKEN_A).balanceOf.mockResolvedValue(1_500_000_000_000_000_000n);

      const result = await getERC20Balance(WALLET, token(TOKEN_A));

      expect(result.balance).toBe('1500000000000000000');
      expect(result.formatted).toBe('1.5');
      expect(result.symbol).toBe('TT');
    });

    it('formats using the token’s own decimals', async () => {
      contractFor(TOKEN_A).balanceOf.mockResolvedValue(2_500_000n);

      const result = await getERC20Balance(WALLET, token(TOKEN_A, { decimals: 6 }));

      expect(result.formatted).toBe('2.5');
      expect(result.decimals).toBe(6);
    });

    // A token that never reported its decimals is assumed to use the usual 18.
    it('assumes eighteen decimals when the token does not say', async () => {
      contractFor(TOKEN_A).balanceOf.mockResolvedValue(1_000_000_000_000_000_000n);

      const result = await getERC20Balance(WALLET, token(TOKEN_A, { decimals: null }));

      expect(result.decimals).toBe(18);
      expect(result.formatted).toBe('1');
    });

    it('falls back to a placeholder symbol', async () => {
      contractFor(TOKEN_A).balanceOf.mockResolvedValue(1n);

      const result = await getERC20Balance(WALLET, token(TOKEN_A, { symbol: null }));

      expect(result.symbol).toBe('UNKNOWN');
    });
  });

  describe('getERC20Balances', () => {
    it('returns a balance per token held', async () => {
      contractFor(TOKEN_A).balanceOf.mockResolvedValue(5n);
      contractFor(TOKEN_B).balanceOf.mockResolvedValue(7n);

      const result = await getERC20Balances(WALLET, [token(TOKEN_A), token(TOKEN_B)]);

      expect(result).toHaveLength(2);
    });

    it('ignores tokens that are not ERC-20', async () => {
      contractFor(TOKEN_A).balanceOf.mockResolvedValue(5n);

      const result = await getERC20Balances(WALLET, [
        token(TOKEN_A),
        token(TOKEN_B, { standard: 'ERC721' }),
      ]);

      expect(result).toHaveLength(1);
      expect(contractFor(TOKEN_B).balanceOf).not.toHaveBeenCalled();
    });

    it('makes no calls when there are no ERC-20 tokens', async () => {
      const result = await getERC20Balances(WALLET, [token(TOKEN_B, { standard: 'ERC1155' })]);

      expect(result).toEqual([]);
      expect(contractFor(TOKEN_B).balanceOf).not.toHaveBeenCalled();
    });

    // One unreadable token must not cost the user the rest of their balances.
    it('keeps the balances that resolved when one token fails', async () => {
      contractFor(TOKEN_A).balanceOf.mockRejectedValue(new Error('reverted'));
      contractFor(TOKEN_B).balanceOf.mockResolvedValue(7n);

      const result = await getERC20Balances(WALLET, [token(TOKEN_A), token(TOKEN_B)]);

      expect(result).toHaveLength(1);
      expect(result[0].tokenAddress).toBe(TOKEN_B);
    });

    // Tokens the wallet has fully spent are dropped rather than listed at zero.
    it('omits a token with a zero balance', async () => {
      contractFor(TOKEN_A).balanceOf.mockResolvedValue(0n);
      contractFor(TOKEN_B).balanceOf.mockResolvedValue(7n);

      const result = await getERC20Balances(WALLET, [token(TOKEN_A), token(TOKEN_B)]);

      expect(result.map((b) => b.tokenAddress)).toEqual([TOKEN_B]);
    });
  });

  describe('getERC1155Balance', () => {
    it('asks the contract for that wallet and token id', async () => {
      contractFor(TOKEN_A).balanceOf.mockResolvedValue(3n);

      expect(await getERC1155Balance(WALLET, TOKEN_A, '7')).toBe(3n);
      expect(contractFor(TOKEN_A).balanceOf).toHaveBeenCalledWith(WALLET, '7');
    });
  });

  describe('getERC1155Balances', () => {
    const holding = (tokenAddress: string, tokenId: string) => ({ tokenAddress, tokenId });

    it('returns nothing for no holdings', async () => {
      expect(await getERC1155Balances(WALLET, [], [])).toEqual([]);
    });

    // Ids for one contract go out as a single balanceOfBatch rather than one
    // call per id.
    it('batches every id of a contract into one call', async () => {
      contractFor(TOKEN_A).balanceOfBatch.mockResolvedValue([1n, 2n]);

      const result = await getERC1155Balances(
        WALLET,
        [holding(TOKEN_A, '1'), holding(TOKEN_A, '2')],
        [token(TOKEN_A, { standard: 'ERC1155' })]
      );

      expect(contractFor(TOKEN_A).balanceOfBatch).toHaveBeenCalledTimes(1);
      expect(contractFor(TOKEN_A).balanceOfBatch).toHaveBeenCalledWith([WALLET, WALLET], ['1', '2']);
      expect(result).toHaveLength(2);
    });

    it('groups by contract, one batch call each', async () => {
      contractFor(TOKEN_A).balanceOfBatch.mockResolvedValue([1n]);
      contractFor(TOKEN_B).balanceOfBatch.mockResolvedValue([2n]);

      await getERC1155Balances(
        WALLET,
        [holding(TOKEN_A, '1'), holding(TOKEN_B, '9')],
        [token(TOKEN_A, { standard: 'ERC1155' }), token(TOKEN_B, { standard: 'ERC1155' })]
      );

      expect(contractFor(TOKEN_A).balanceOfBatch).toHaveBeenCalledTimes(1);
      expect(contractFor(TOKEN_B).balanceOfBatch).toHaveBeenCalledTimes(1);
    });

    it('omits ids the wallet no longer holds', async () => {
      contractFor(TOKEN_A).balanceOfBatch.mockResolvedValue([0n, 4n]);

      const result = await getERC1155Balances(
        WALLET,
        [holding(TOKEN_A, '1'), holding(TOKEN_A, '2')],
        [token(TOKEN_A, { standard: 'ERC1155' })]
      );

      expect(result).toHaveLength(1);
      expect(result[0].tokenId).toBe('2');
    });

    it('labels results with the token symbol', async () => {
      contractFor(TOKEN_A).balanceOfBatch.mockResolvedValue([1n]);

      const result = await getERC1155Balances(
        WALLET,
        [holding(TOKEN_A, '1')],
        [token(TOKEN_A, { standard: 'ERC1155', symbol: 'EDITION' })]
      );

      expect(result[0].symbol).toBe('EDITION');
    });

    it('falls back to a placeholder symbol for an unknown contract', async () => {
      contractFor(TOKEN_A).balanceOfBatch.mockResolvedValue([1n]);

      const result = await getERC1155Balances(WALLET, [holding(TOKEN_A, '1')], []);

      expect(result[0].symbol).toBe('UNKNOWN');
    });

    describe('when the batch call is unsupported', () => {
      // Not every ERC-1155 implements balanceOfBatch usefully, so a revert has
      // to degrade to individual reads rather than losing the holdings.
      it('falls back to one call per id', async () => {
        contractFor(TOKEN_A).balanceOfBatch.mockRejectedValue(new Error('not implemented'));
        contractFor(TOKEN_A).balanceOf.mockResolvedValueOnce(1n).mockResolvedValueOnce(2n);

        const result = await getERC1155Balances(
          WALLET,
          [holding(TOKEN_A, '1'), holding(TOKEN_A, '2')],
          [token(TOKEN_A, { standard: 'ERC1155' })]
        );

        expect(contractFor(TOKEN_A).balanceOf).toHaveBeenCalledTimes(2);
        expect(result).toHaveLength(2);
      });

      it('keeps the ids that resolved when one individual call fails', async () => {
        contractFor(TOKEN_A).balanceOfBatch.mockRejectedValue(new Error('nope'));
        contractFor(TOKEN_A).balanceOf
          .mockRejectedValueOnce(new Error('reverted'))
          .mockResolvedValueOnce(2n);

        const result = await getERC1155Balances(
          WALLET,
          [holding(TOKEN_A, '1'), holding(TOKEN_A, '2')],
          [token(TOKEN_A, { standard: 'ERC1155' })]
        );

        expect(result).toHaveLength(1);
        expect(result[0].tokenId).toBe('2');
      });

      it('still omits zero balances', async () => {
        contractFor(TOKEN_A).balanceOfBatch.mockRejectedValue(new Error('nope'));
        contractFor(TOKEN_A).balanceOf.mockResolvedValue(0n);

        const result = await getERC1155Balances(
          WALLET,
          [holding(TOKEN_A, '1')],
          [token(TOKEN_A, { standard: 'ERC1155' })]
        );

        expect(result).toEqual([]);
      });

      // One contract's batch reverting must not stop another's from being used.
      it('does not make other contracts fall back too', async () => {
        contractFor(TOKEN_A).balanceOfBatch.mockRejectedValue(new Error('nope'));
        contractFor(TOKEN_A).balanceOf.mockResolvedValue(1n);
        contractFor(TOKEN_B).balanceOfBatch.mockResolvedValue([5n]);

        await getERC1155Balances(
          WALLET,
          [holding(TOKEN_A, '1'), holding(TOKEN_B, '9')],
          [token(TOKEN_A, { standard: 'ERC1155' }), token(TOKEN_B, { standard: 'ERC1155' })]
        );

        expect(contractFor(TOKEN_B).balanceOf).not.toHaveBeenCalled();
        expect(contractFor(TOKEN_B).balanceOfBatch).toHaveBeenCalledTimes(1);
      });
    });
  });
});
