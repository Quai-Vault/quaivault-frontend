import { describe, it, expect } from 'vitest';
import { deriveErc721Candidates, deriveErc1155Candidates } from './holdingsFromTransfers';
import type { TokenTransfer } from '../types/database';

const COLLECTION = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const WALLET = '0x1111111111111111111111111111111111111111';

let sequence = 0;

/** Transfers are listed newest-first, matching the query's ordering. */
function transfer(
  over: Partial<TokenTransfer> & { direction: 'inflow' | 'outflow'; token_id: string | null }
): TokenTransfer {
  return {
    id: `t-${++sequence}`,
    token_address: COLLECTION,
    wallet_address: WALLET,
    from_address: OTHER,
    to_address: WALLET,
    value: '1',
    block_number: 1,
    transaction_hash: '0x' + 'a'.repeat(64),
    log_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  } as TokenTransfer;
}

const inflow = (token_id: string, over: Partial<TokenTransfer> = {}) =>
  transfer({ direction: 'inflow', token_id, ...over });
const outflow = (token_id: string, over: Partial<TokenTransfer> = {}) =>
  transfer({ direction: 'outflow', token_id, ...over });

describe('deriveErc721Candidates', () => {
  it('keeps an id that was received', () => {
    expect(deriveErc721Candidates([inflow('1')])).toEqual([
      { tokenAddress: COLLECTION, tokenId: '1' },
    ]);
  });

  it('reports nothing for an empty log', () => {
    expect(deriveErc721Candidates([])).toEqual([]);
  });

  // The whole point of the ordering: an id received and later sent away is
  // gone, even though an inbound transfer for it exists further down the log.
  it('drops an id whose most recent transfer was outbound', () => {
    const candidates = deriveErc721Candidates([outflow('1'), inflow('1')]);

    expect(candidates).toEqual([]);
  });

  // And the reverse: sold once, bought back later, still held.
  it('keeps an id received again after being sent away', () => {
    const candidates = deriveErc721Candidates([inflow('1'), outflow('1'), inflow('1')]);

    expect(candidates).toEqual([{ tokenAddress: COLLECTION, tokenId: '1' }]);
  });

  it('reports an id only once however many times it changed hands', () => {
    const candidates = deriveErc721Candidates([inflow('1'), inflow('1'), inflow('1')]);

    expect(candidates).toHaveLength(1);
  });

  it('treats the same id in different collections as different holdings', () => {
    const candidates = deriveErc721Candidates([
      inflow('1'),
      inflow('1', { token_address: OTHER }),
    ]);

    expect(candidates).toHaveLength(2);
  });

  // Collection addresses arrive cased differently from different sources, and
  // treating them as distinct would list the same NFT twice.
  it('matches a collection regardless of address casing', () => {
    const candidates = deriveErc721Candidates([
      outflow('1'),
      inflow('1', { token_address: COLLECTION.toLowerCase() }),
    ]);

    expect(candidates).toEqual([]);
  });

  it('ignores transfers with no token id', () => {
    expect(deriveErc721Candidates([transfer({ direction: 'inflow', token_id: null })])).toEqual([]);
  });

  it('keeps several distinct ids', () => {
    const candidates = deriveErc721Candidates([inflow('1'), inflow('2'), outflow('3')]);

    expect(candidates.map((c) => c.tokenId)).toEqual(['1', '2']);
  });
});

describe('deriveErc1155Candidates', () => {
  it('reports the quantity received', () => {
    const candidates = deriveErc1155Candidates([inflow('1', { value: '5' })]);

    expect(candidates).toEqual([{ tokenAddress: COLLECTION, tokenId: '1', net: 5n }]);
  });

  it('reports nothing for an empty log', () => {
    expect(deriveErc1155Candidates([])).toEqual([]);
  });

  // Unlike an NFT, sending some of a balance away leaves the rest — so the
  // last-transfer rule would be wrong here.
  it('subtracts what was sent away and keeps the remainder', () => {
    const candidates = deriveErc1155Candidates([
      inflow('1', { value: '5' }),
      outflow('1', { value: '2' }),
    ]);

    expect(candidates[0].net).toBe(3n);
  });

  it('drops an id once the balance reaches zero', () => {
    const candidates = deriveErc1155Candidates([
      inflow('1', { value: '5' }),
      outflow('1', { value: '5' }),
    ]);

    expect(candidates).toEqual([]);
  });

  it('drops an id whose outflows exceed its inflows', () => {
    const candidates = deriveErc1155Candidates([
      inflow('1', { value: '1' }),
      outflow('1', { value: '3' }),
    ]);

    expect(candidates).toEqual([]);
  });

  it('sums across many transfers of the same id', () => {
    const candidates = deriveErc1155Candidates([
      inflow('1', { value: '10' }),
      outflow('1', { value: '3' }),
      inflow('1', { value: '1' }),
      outflow('1', { value: '2' }),
    ]);

    expect(candidates[0].net).toBe(6n);
  });

  it('tracks each id separately', () => {
    const candidates = deriveErc1155Candidates([
      inflow('1', { value: '5' }),
      inflow('2', { value: '7' }),
      outflow('2', { value: '7' }),
    ]);

    expect(candidates).toEqual([{ tokenAddress: COLLECTION, tokenId: '1', net: 5n }]);
  });

  it('matches a collection regardless of address casing', () => {
    const candidates = deriveErc1155Candidates([
      inflow('1', { value: '5' }),
      outflow('1', { value: '5', token_address: COLLECTION.toLowerCase() }),
    ]);

    expect(candidates).toEqual([]);
  });

  // Editions can be minted far beyond what a JS number holds precisely.
  it('handles quantities beyond Number precision', () => {
    const huge = '9007199254740993';
    const candidates = deriveErc1155Candidates([inflow('1', { value: huge })]);

    expect(candidates[0].net).toBe(BigInt(huge));
  });

  it('treats a missing value as zero rather than failing', () => {
    const candidates = deriveErc1155Candidates([inflow('1', { value: '' })]);

    expect(candidates).toEqual([]);
  });

  it('ignores transfers with no token id', () => {
    expect(deriveErc1155Candidates([transfer({ direction: 'inflow', token_id: null })])).toEqual([]);
  });
});
