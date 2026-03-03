import { useState, useEffect, useMemo } from 'react';
import { Interface, parseUnits, formatUnits, isQuaiAddress } from 'quais';
import { useTokenBalances } from '../../hooks/useTokenBalances';
import type { SendTokenMeta } from '../../types';
import type { OnChainTokenBalance } from '../../services/utils/TokenBalanceService';

// Hoisted — avoid re-constructing on every render
const erc20TransferInterface = new Interface(['function transfer(address to, uint256 amount)']);

interface SendTokenFormProps {
  walletAddress: string;
  onToChange: (to: string) => void;
  onValueChange: (value: string) => void;
  onDataChange: (data: string) => void;
  onTokenMetadataChange: (meta: SendTokenMeta | null) => void;
  onRecipientChange: (recipient: string) => void;
  onAmountChange: (amount: string) => void;
  initialToken?: string;
}

export function SendTokenForm({
  walletAddress,
  onToChange,
  onValueChange,
  onDataChange,
  onTokenMetadataChange,
  onRecipientChange,
  onAmountChange,
  initialToken,
}: SendTokenFormProps) {
  const { tokens, erc20Balances, isLoadingTokens, isLoadingBalances } = useTokenBalances(walletAddress);

  const [selectedTokenAddress, setSelectedTokenAddress] = useState(initialToken ?? '');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [encodingError, setEncodingError] = useState<string | null>(null);

  // Build balance map for quick lookup
  const balanceMap = useMemo(
    () => new Map(erc20Balances.map(b => [b.tokenAddress.toLowerCase(), b])),
    [erc20Balances],
  );

  // Filter to ERC20 tokens with non-zero balances, sorted by balance descending
  const availableTokens = useMemo(() => {
    const erc20Tokens = tokens.filter(t => t.standard === 'ERC20');
    return erc20Tokens
      .map(t => ({ token: t, balance: balanceMap.get(t.address.toLowerCase()) }))
      .filter((entry): entry is { token: typeof entry.token; balance: OnChainTokenBalance } => !!entry.balance)
      .sort((a, b) => {
        const balA = BigInt(a.balance.balance);
        const balB = BigInt(b.balance.balance);
        return balB > balA ? 1 : balB < balA ? -1 : 0;
      });
  }, [tokens, balanceMap]);

  // Selected token metadata
  const selectedEntry = useMemo(
    () => availableTokens.find(e => e.token.address.toLowerCase() === selectedTokenAddress.toLowerCase()),
    [availableTokens, selectedTokenAddress],
  );

  // Auto-select initialToken if provided and available
  useEffect(() => {
    if (initialToken && availableTokens.length > 0 && !selectedEntry) {
      // initialToken not found in available tokens — clear it
      setSelectedTokenAddress('');
    }
  }, [initialToken, availableTokens, selectedEntry]);

  // Notify parent of token metadata changes
  useEffect(() => {
    if (selectedEntry) {
      onTokenMetadataChange({
        symbol: selectedEntry.balance.symbol,
        name: selectedEntry.token.name,
        decimals: selectedEntry.balance.decimals,
        address: selectedEntry.token.address,
      });
    } else {
      onTokenMetadataChange(null);
    }
  }, [selectedEntry, onTokenMetadataChange]);

  // Notify parent of recipient changes
  useEffect(() => {
    onRecipientChange(recipient);
  }, [recipient, onRecipientChange]);

  // Notify parent of amount changes
  useEffect(() => {
    onAmountChange(amount);
  }, [amount, onAmountChange]);

  // Encode transfer calldata
  useEffect(() => {
    if (!selectedEntry || !recipient.trim() || !isQuaiAddress(recipient) || !amount.trim()) {
      onToChange('');
      onValueChange('0');
      onDataChange('0x');
      setEncodingError(null);
      return;
    }

    try {
      const amountWei = parseUnits(amount, selectedEntry.balance.decimals);
      const encoded = erc20TransferInterface.encodeFunctionData('transfer', [recipient.trim(), amountWei]);
      onToChange(selectedEntry.token.address);
      onValueChange('0');
      onDataChange(encoded);
      setEncodingError(null);
    } catch (e) {
      onDataChange('0x');
      setEncodingError(e instanceof Error ? e.message : 'Invalid amount format');
    }
  }, [selectedEntry, recipient, amount, onToChange, onValueChange, onDataChange]);

  // Check if entered amount exceeds balance
  const insufficientBalance = useMemo(() => {
    if (!selectedEntry || !amount.trim()) return false;
    try {
      const amountWei = parseUnits(amount, selectedEntry.balance.decimals);
      return amountWei > BigInt(selectedEntry.balance.balance);
    } catch {
      return false;
    }
  }, [selectedEntry, amount]);

  const handleMaxClick = () => {
    if (!selectedEntry) return;
    // Use raw balance with full precision, not the truncated formatted value
    const fullPrecision = formatUnits(BigInt(selectedEntry.balance.balance), selectedEntry.balance.decimals);
    setAmount(fullPrecision);
  };

  const handleTokenSelect = (address: string) => {
    setSelectedTokenAddress(address);
    setAmount('');
    setEncodingError(null);
  };

  if (isLoadingTokens || isLoadingBalances) {
    return (
      <div className="mb-8 flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-dark-500">
          <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-base font-mono">Loading token balances...</span>
        </div>
      </div>
    );
  }

  if (availableTokens.length === 0) {
    return (
      <div className="mb-8">
        <p className="text-base font-mono text-dark-500 text-center py-8">
          This vault doesn't hold any ERC-20 tokens.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mb-8">
      {/* Token Selector */}
      <div>
        <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
          Token
        </label>
        <select
          value={selectedTokenAddress}
          onChange={(e) => handleTokenSelect(e.target.value)}
          className="input-field w-full"
        >
          <option value="">Select a token...</option>
          {availableTokens.map(({ token, balance }) => (
            <option key={token.address} value={token.address}>
              {balance.symbol}{token.name ? ` — ${token.name}` : ''} ({balance.formatted} available)
            </option>
          ))}
        </select>
      </div>

      {/* Recipient Address */}
      <div>
        <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
          Recipient Address
        </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x..."
          className="input-field w-full"
        />
        {recipient && !isQuaiAddress(recipient) && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400 font-mono">Invalid Quai address</p>
        )}
      </div>

      {/* Amount */}
      <div>
        <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
          Amount {selectedEntry ? `(${selectedEntry.balance.symbol})` : ''}
        </label>
        <div className="relative">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={selectedEntry ? `e.g. 1.5 ${selectedEntry.balance.symbol}` : 'Select a token first'}
            disabled={!selectedEntry}
            className="input-field w-full pr-16"
          />
          {selectedEntry && (
            <button
              type="button"
              onClick={handleMaxClick}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-primary-500 hover:text-primary-400 px-2 py-1 rounded transition-colors"
            >
              MAX
            </button>
          )}
        </div>
        {selectedEntry && (
          <p className={`mt-1 text-sm font-mono ${insufficientBalance ? 'text-red-600 dark:text-red-400' : 'text-dark-500 dark:text-dark-400'}`}>
            Balance: {selectedEntry.balance.formatted} {selectedEntry.balance.symbol}
            {insufficientBalance && ' — Insufficient balance'}
          </p>
        )}
        {encodingError && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400 font-mono">{encodingError}</p>
        )}
      </div>
    </div>
  );
}
