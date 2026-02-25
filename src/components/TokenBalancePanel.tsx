import { useTokenBalances } from '../hooks/useTokenBalances';
import { formatAddress } from '../utils/formatting';
import { ExplorerLink } from './ExplorerLink';

interface TokenBalancePanelProps {
  walletAddress: string;
}

export function TokenBalancePanel({ walletAddress }: TokenBalancePanelProps) {
  const {
    tokens,
    erc20Balances,
    isLoadingTokens,
    isLoadingBalances,
    isRefetching,
    isIndexerEnabled,
    isIndexerConnected,
    error,
    refetchAll,
  } = useTokenBalances(walletAddress);

  if (!isIndexerEnabled || !isIndexerConnected) {
    return null;
  }

  if (error) {
    return (
      <div className="col-span-2 mt-2">
        <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1.5">Token Balances</h3>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (isLoadingTokens || isLoadingBalances) {
    return (
      <div className="col-span-2 mt-2">
        <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1.5">Token Balances</h3>
        <div className="flex items-center justify-center p-3">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Merge: show all indexed ERC20 tokens, using on-chain balances where available
  const balanceMap = new Map(erc20Balances.map(b => [b.tokenAddress.toLowerCase(), b]));
  const erc20Tokens = tokens.filter(t => t.standard === 'ERC20');

  if (erc20Tokens.length === 0) return null;

  return (
    <div className="col-span-2 mt-2">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider">Token Balances</h3>
        <button
          onClick={refetchAll}
          disabled={isRefetching}
          className="text-xs text-primary-500 hover:text-primary-400 transition-colors disabled:opacity-50"
          title="Refresh token balances"
        >
          <svg className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      <div className="space-y-1.5">
        {erc20Tokens.map((token) => {
          const bal = balanceMap.get(token.address.toLowerCase());
          return (
            <div
              key={token.address}
              className="flex items-center justify-between p-2.5 bg-dark-100 dark:bg-vault-dark-4 rounded-md border border-dark-300 dark:border-dark-600"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-900/50 border border-yellow-700/50 flex items-center justify-center">
                  <span className="text-xs text-yellow-300">T</span>
                </div>
                <div className="min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-sm font-semibold text-dark-700 dark:text-dark-200 flex-shrink-0">{bal?.symbol ?? token.symbol ?? 'Unknown'}</span>
                    {token.name && (
                      <span className="text-xs text-dark-500 dark:text-dark-400 truncate">{token.name}</span>
                    )}
                  </div>
                  <ExplorerLink type="address" value={token.address} showIcon={false} className="text-xs truncate">
                    {formatAddress(token.address)}
                  </ExplorerLink>
                </div>
              </div>
              <p className={`text-sm flex-shrink-0 ml-3 ${bal ? 'font-display font-bold text-dark-700 dark:text-dark-200' : 'font-mono text-dark-500'}`}>
                {bal ? bal.formatted : '0.0000'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
