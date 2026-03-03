import { Contract as QuaisContract, formatUnits } from 'quais';
import { getActiveProvider } from '../../config/provider';
import type { Token } from '../../types/database';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
];

const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
];

export interface OnChainTokenBalance {
  tokenAddress: string;
  balance: string;
  formatted: string;
  symbol: string;
  decimals: number;
}

/**
 * Fetch the ERC20 balance for a wallet from the blockchain.
 */
export async function getERC20Balance(
  walletAddress: string,
  token: Token
): Promise<OnChainTokenBalance> {
  const contract = new QuaisContract(token.address, ERC20_ABI, getActiveProvider());
  const rawBalance: bigint = await contract.balanceOf(walletAddress);

  const decimals = token.decimals ?? 18;
  const formatted = parseFloat(formatUnits(rawBalance, decimals)).toFixed(
    decimals > 4 ? 4 : decimals
  );

  return {
    tokenAddress: token.address,
    balance: rawBalance.toString(),
    formatted,
    symbol: token.symbol ?? 'UNKNOWN',
    decimals,
  };
}

/**
 * Fetch ERC20 balances for multiple tokens in parallel.
 * Tolerates individual failures (omits failed tokens from results).
 */
export async function getERC20Balances(
  walletAddress: string,
  tokens: Token[]
): Promise<OnChainTokenBalance[]> {
  const erc20Tokens = tokens.filter(t => t.standard === 'ERC20');
  if (erc20Tokens.length === 0) return [];

  const results = await Promise.allSettled(
    erc20Tokens.map(token => getERC20Balance(walletAddress, token))
  );

  // Log any failed balance fetches for debugging
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[TokenBalanceService] Failed to fetch balance for ${erc20Tokens[i].symbol ?? erc20Tokens[i].address}:`, r.reason);
    }
  });

  return results
    .filter((r): r is PromiseFulfilledResult<OnChainTokenBalance> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter(b => b.balance !== '0');
}

// --- ERC1155 ---

export interface OnChainERC1155Balance {
  tokenAddress: string;
  tokenId: string;
  balance: string;
  symbol: string;
}

/**
 * Fetch the ERC1155 balance for a single (wallet, token, tokenId) tuple.
 * Used for on-chain re-verification at proposal time.
 */
export async function getERC1155Balance(
  walletAddress: string,
  tokenAddress: string,
  tokenId: string,
): Promise<bigint> {
  const contract = new QuaisContract(tokenAddress, ERC1155_ABI, getActiveProvider());
  const balance: bigint = await contract.balanceOf(walletAddress, tokenId);
  return balance;
}

/**
 * Fetch ERC1155 balances for multiple (tokenAddress, tokenId) pairs.
 * Groups by contract and tries balanceOfBatch first, falling back to
 * individual balanceOf calls if the batch call reverts.
 */
export async function getERC1155Balances(
  walletAddress: string,
  holdings: Array<{ tokenAddress: string; tokenId: string }>,
  tokens: Token[],
): Promise<OnChainERC1155Balance[]> {
  if (holdings.length === 0) return [];

  // Build a symbol lookup
  const symbolMap = new Map<string, string>();
  for (const t of tokens) {
    symbolMap.set(t.address.toLowerCase(), t.symbol ?? 'UNKNOWN');
  }

  // Group holdings by token contract address
  const grouped = new Map<string, Array<{ tokenId: string; index: number }>>();
  holdings.forEach((h, i) => {
    const key = h.tokenAddress.toLowerCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ tokenId: h.tokenId, index: i });
  });

  const results: OnChainERC1155Balance[] = [];

  for (const [tokenAddress, items] of grouped) {
    const contract = new QuaisContract(tokenAddress, ERC1155_ABI, getActiveProvider());
    const symbol = symbolMap.get(tokenAddress) ?? 'UNKNOWN';

    try {
      // Try batch call first
      const accounts = items.map(() => walletAddress);
      const ids = items.map(item => item.tokenId);
      const balances: bigint[] = await contract.balanceOfBatch(accounts, ids);

      for (let i = 0; i < items.length; i++) {
        const bal = balances[i].toString();
        if (bal !== '0') {
          results.push({ tokenAddress, tokenId: items[i].tokenId, balance: bal, symbol });
        }
      }
    } catch {
      // Fallback to individual calls
      const individual = await Promise.allSettled(
        items.map(async (item) => {
          const balance: bigint = await contract.balanceOf(walletAddress, item.tokenId);
          return { tokenId: item.tokenId, balance };
        })
      );

      for (const r of individual) {
        if (r.status === 'fulfilled' && r.value.balance.toString() !== '0') {
          results.push({
            tokenAddress,
            tokenId: r.value.tokenId,
            balance: r.value.balance.toString(),
            symbol,
          });
        }
      }
    }
  }

  return results;
}
