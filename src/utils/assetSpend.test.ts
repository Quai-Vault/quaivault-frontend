import { describe, it, expect, vi } from 'vitest';
import {
  isErc20SpendFromVault,
  isErc721TransferFunction,
  extractErc20Amount,
  extractErc721TokenId,
} from './assetSpend';

vi.mock('quais', () => ({
  parseUnits: (value: string, decimals: number) => {
    if (!/^\d*\.?\d+$/.test(value.trim())) throw new Error(`invalid decimal: ${value}`);
    const [int, frac = ''] = value.trim().split('.');
    if (frac.length > decimals) throw new Error('too many decimals');
    return BigInt(int + frac.padEnd(decimals, '0'));
  },
}));

const VAULT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

describe('isErc20SpendFromVault', () => {
  it('treats transfer as always spending the vault balance', () => {
    expect(isErc20SpendFromVault('transfer', {}, VAULT)).toBe(true);
  });

  it('treats transferFrom as a vault spend when from is the vault', () => {
    expect(isErc20SpendFromVault('transferFrom', { 0: VAULT }, VAULT)).toBe(true);
  });

  it('matches the vault regardless of address casing', () => {
    const shouted = VAULT.toUpperCase().replace('0X', '0x');

    expect(isErc20SpendFromVault('transferFrom', { 0: shouted }, VAULT)).toBe(true);
  });

  // Spending someone else's allowance does not touch the vault's balance, so
  // warning about it would be noise.
  it('is not a vault spend when from is another address', () => {
    expect(isErc20SpendFromVault('transferFrom', { 0: OTHER }, VAULT)).toBe(false);
  });

  // Deliberate: the balance shows while the user is still filling the form,
  // rather than appearing only once every field is complete.
  it('assumes a vault spend while from is still empty', () => {
    expect(isErc20SpendFromVault('transferFrom', {}, VAULT)).toBe(true);
    expect(isErc20SpendFromVault('transferFrom', { 0: '   ' }, VAULT)).toBe(true);
  });

  it('assumes a vault spend when no vault address is known yet', () => {
    expect(isErc20SpendFromVault('transferFrom', { 0: OTHER }, undefined)).toBe(true);
  });

  it('is not a spend for an unrelated function', () => {
    expect(isErc20SpendFromVault('approve', { 0: VAULT }, VAULT)).toBe(false);
    expect(isErc20SpendFromVault('mint', {}, VAULT)).toBe(false);
  });
});

describe('extractErc20Amount', () => {
  // transfer(to, amount) — the amount is the second argument, not the first.
  it('reads the amount from the second argument of transfer', () => {
    expect(extractErc20Amount('transfer', { 0: OTHER, 1: '1.5' }, 18)).toBe(1500000000000000000n);
  });

  // transferFrom(from, to, amount) — one further along.
  it('reads the amount from the third argument of transferFrom', () => {
    expect(extractErc20Amount('transferFrom', { 0: VAULT, 1: OTHER, 2: '2' }, 18)).toBe(
      2000000000000000000n
    );
  });

  it('scales by the token decimals', () => {
    expect(extractErc20Amount('transfer', { 1: '2.5' }, 6)).toBe(2500000n);
  });

  it('returns null while the amount is unfilled', () => {
    expect(extractErc20Amount('transfer', { 0: OTHER }, 18)).toBeNull();
    expect(extractErc20Amount('transfer', { 1: '  ' }, 18)).toBeNull();
  });

  // A half-typed amount must not be treated as zero, which would read as
  // "affordable" and suppress the insufficient-balance warning.
  it('returns null for an unparseable amount rather than zero', () => {
    expect(extractErc20Amount('transfer', { 1: 'abc' }, 18)).toBeNull();
    expect(extractErc20Amount('transfer', { 1: '1.2345678' }, 6)).toBeNull();
  });

  it('returns null for a function that moves nothing', () => {
    expect(extractErc20Amount('approve', { 1: '5' }, 18)).toBeNull();
  });
});

describe('extractErc721TokenId', () => {
  // transferFrom(from, to, tokenId) — the id shares the amount's position.
  it('reads the token id from the third argument', () => {
    expect(extractErc721TokenId('transferFrom', { 0: VAULT, 1: OTHER, 2: '42' })).toBe('42');
  });

  it('reads it for safeTransferFrom too', () => {
    expect(extractErc721TokenId('safeTransferFrom', { 2: '42' })).toBe('42');
  });

  it('trims surrounding whitespace', () => {
    expect(extractErc721TokenId('transferFrom', { 2: '  42  ' })).toBe('42');
  });

  it('accepts token id zero, which is a real id', () => {
    expect(extractErc721TokenId('transferFrom', { 2: '0' })).toBe('0');
  });

  it('returns null while the id is unfilled', () => {
    expect(extractErc721TokenId('transferFrom', {})).toBeNull();
    expect(extractErc721TokenId('transferFrom', { 2: '   ' })).toBeNull();
  });

  it('returns null for a function that moves no token', () => {
    expect(extractErc721TokenId('approve', { 2: '42' })).toBeNull();
  });
});

describe('isErc721TransferFunction', () => {
  it.each(['transferFrom', 'safeTransferFrom'])('recognises %s', (name) => {
    expect(isErc721TransferFunction(name)).toBe(true);
  });

  it.each(['approve', 'setApprovalForAll', 'transfer'])('rejects %s', (name) => {
    expect(isErc721TransferFunction(name)).toBe(false);
  });
});
