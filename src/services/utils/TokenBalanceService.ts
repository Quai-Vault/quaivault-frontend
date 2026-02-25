import { JsonRpcProvider, Contract as QuaisContract, formatUnits } from 'quais';
import { NETWORK_CONFIG } from '../../config/contracts';
import type { Token } from '../../types/database';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
];

const provider = new JsonRpcProvider(
  NETWORK_CONFIG.RPC_URL,
  undefined,
  { usePathing: true }
);

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
  const contract = new QuaisContract(token.address, ERC20_ABI, provider);
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
