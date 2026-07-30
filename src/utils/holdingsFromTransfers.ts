import type { TokenTransfer } from '../types/database';

/**
 * Deriving what a vault still holds from its transfer log.
 *
 * The two token standards need genuinely different reasoning, and using either
 * rule for the other standard would be wrong:
 *
 * - ERC-721 ids are unique, so only the most recent transfer of a given id
 *   matters. Received last means still held; sent last means gone.
 * - ERC-1155 ids are fungible, so a vault can hold three of five. Every
 *   transfer counts, and the balance is inflows minus outflows.
 *
 * Both produce *candidates* only. Callers re-verify on chain, because the
 * transfer log can be incomplete or behind.
 */

export interface HoldingCandidate {
  tokenAddress: string;
  tokenId: string;
}

export interface Erc1155Candidate extends HoldingCandidate {
  /** Net of inflows minus outflows; only positive entries are returned. */
  net: bigint;
}

/**
 * ERC-721 candidates: ids whose most recent transfer was inbound.
 *
 * Expects transfers newest-first, which is how the query orders them. The id is
 * marked as seen before the direction is checked, so an id last sent away is
 * excluded rather than being picked up from an earlier inbound transfer.
 */
export function deriveErc721Candidates(transfers: TokenTransfer[]): HoldingCandidate[] {
  const seen = new Set<string>();
  const candidates: HoldingCandidate[] = [];

  for (const transfer of transfers) {
    if (!transfer.token_id) continue;

    const key = `${transfer.token_address.toLowerCase()}:${transfer.token_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (transfer.direction === 'inflow') {
      candidates.push({ tokenAddress: transfer.token_address, tokenId: transfer.token_id });
    }
  }

  return candidates;
}

/**
 * ERC-1155 candidates: ids with a positive net balance across every transfer.
 *
 * Order does not matter here, since the whole log is summed.
 */
export function deriveErc1155Candidates(transfers: TokenTransfer[]): Erc1155Candidate[] {
  const balances = new Map<string, Erc1155Candidate>();

  for (const transfer of transfers) {
    if (!transfer.token_id) continue;

    const key = `${transfer.token_address.toLowerCase()}:${transfer.token_id}`;
    if (!balances.has(key)) {
      balances.set(key, {
        tokenAddress: transfer.token_address,
        tokenId: transfer.token_id,
        net: 0n,
      });
    }

    const entry = balances.get(key)!;
    const value = BigInt(transfer.value || '0');
    entry.net += transfer.direction === 'inflow' ? value : -value;
  }

  return Array.from(balances.values()).filter((entry) => entry.net > 0n);
}
