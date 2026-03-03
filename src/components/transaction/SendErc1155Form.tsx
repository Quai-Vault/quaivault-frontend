import { useState, useEffect, useMemo } from 'react';
import { Interface, isQuaiAddress } from 'quais';
import { useErc1155Holdings } from '../../hooks/useErc1155Holdings';
import { isSafeImageUrl } from '../../utils/imageValidation';
import type { SendErc1155Meta } from '../../types';
import type { Erc1155HoldingWithMetadata } from '../../hooks/useErc1155Holdings';

// Hoisted — 5-param safeTransferFrom (distinct from ERC721's 3-param version)
const erc1155SafeTransferInterface = new Interface([
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
]);

interface SendErc1155FormProps {
  walletAddress: string;
  onToChange: (to: string) => void;
  onValueChange: (value: string) => void;
  onDataChange: (data: string) => void;
  onErc1155MetadataChange: (meta: SendErc1155Meta | null) => void;
  onRecipientChange: (recipient: string) => void;
  onQuantityChange: (quantity: string) => void;
  initialToken?: string;
  initialTokenId?: string;
}

export function SendErc1155Form({
  walletAddress,
  onToChange,
  onValueChange,
  onDataChange,
  onErc1155MetadataChange,
  onRecipientChange,
  onQuantityChange,
  initialToken,
  initialTokenId,
}: SendErc1155FormProps) {
  const { holdings, isLoading, isLoadingMetadata } = useErc1155Holdings(walletAddress);

  const initialKey = initialToken && initialTokenId
    ? `${initialToken.toLowerCase()}:${initialTokenId}`
    : null;

  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [recipient, setRecipient] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  // Find selected item from holdings
  const selectedItem = useMemo(
    () => holdings.find(h => `${h.tokenAddress.toLowerCase()}:${h.tokenId}` === selectedKey?.toLowerCase()) ?? null,
    [holdings, selectedKey],
  );

  // Clear selection if initial item not found in holdings
  useEffect(() => {
    if (initialKey && holdings.length > 0 && !selectedItem) {
      setSelectedKey(null);
    }
  }, [initialKey, holdings, selectedItem]);

  // Reset quantity when selection changes
  useEffect(() => {
    if (selectedItem) {
      setQuantity('1');
    }
  }, [selectedItem?.tokenAddress, selectedItem?.tokenId]);

  // Notify parent of metadata changes
  useEffect(() => {
    if (selectedItem) {
      onErc1155MetadataChange({
        collectionName: selectedItem.collectionName,
        collectionSymbol: selectedItem.collectionSymbol,
        tokenId: selectedItem.tokenId,
        image: selectedItem.metadata?.image ?? null,
        tokenAddress: selectedItem.tokenAddress,
        balance: selectedItem.quantity,
      });
    } else {
      onErc1155MetadataChange(null);
    }
  }, [selectedItem, onErc1155MetadataChange]);

  // Notify parent of recipient changes
  useEffect(() => {
    onRecipientChange(recipient);
  }, [recipient, onRecipientChange]);

  // Notify parent of quantity changes
  useEffect(() => {
    onQuantityChange(quantity);
  }, [quantity, onQuantityChange]);

  // Encode safeTransferFrom calldata
  useEffect(() => {
    if (!selectedItem || !recipient.trim() || !isQuaiAddress(recipient)) {
      onToChange('');
      onValueChange('0');
      onDataChange('0x');
      return;
    }

    let qty: bigint;
    try {
      qty = BigInt(quantity);
    } catch {
      onDataChange('0x');
      return;
    }
    if (qty <= 0n || qty > BigInt(selectedItem.quantity)) {
      onDataChange('0x');
      return;
    }

    try {
      const encoded = erc1155SafeTransferInterface.encodeFunctionData('safeTransferFrom', [
        walletAddress,
        recipient.trim(),
        selectedItem.tokenId,
        qty.toString(),
        '0x',
      ]);
      onToChange(selectedItem.tokenAddress);
      onValueChange('0');
      onDataChange(encoded);
    } catch {
      onDataChange('0x');
    }
  }, [selectedItem, recipient, quantity, walletAddress, onToChange, onValueChange, onDataChange]);

  const handleImgError = (key: string) => {
    setImgErrors(prev => new Set(prev).add(key));
  };

  const handleItemSelect = (item: Erc1155HoldingWithMetadata) => {
    const key = `${item.tokenAddress.toLowerCase()}:${item.tokenId}`;
    setSelectedKey(prev => prev === key ? null : key);
  };

  if (isLoading) {
    return (
      <div className="mb-8 flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-dark-500">
          <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-base font-mono">Loading ERC1155 holdings...</span>
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="mb-8">
        <p className="text-base font-mono text-dark-500 text-center py-8">
          This vault doesn't hold any ERC1155 tokens.
        </p>
      </div>
    );
  }

  const maxQuantity = selectedItem ? parseInt(selectedItem.quantity, 10) : 0;

  return (
    <div className="space-y-6 mb-8">
      {/* Token Grid */}
      <div>
        <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
          Select Token
        </label>
        <div className="max-h-64 overflow-y-auto rounded-md border border-dark-300 dark:border-dark-600 p-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {holdings.map((item) => {
              const key = `${item.tokenAddress.toLowerCase()}:${item.tokenId}`;
              const isSelected = selectedKey?.toLowerCase() === key;
              const hasImage = item.metadata?.image && !imgErrors.has(key) && isSafeImageUrl(item.metadata.image);
              const displayName = item.metadata?.name ?? item.collectionName ?? 'ERC1155';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleItemSelect(item)}
                  className={`relative flex flex-col items-center p-2 rounded-md border-2 transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-dark-300 dark:border-dark-600 hover:border-dark-400 dark:hover:border-dark-500 bg-dark-100 dark:bg-vault-dark-4'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="w-full aspect-square rounded-md overflow-hidden bg-violet-900/50 border border-violet-700/50 flex items-center justify-center mb-2">
                    {hasImage ? (
                      <img
                        src={item.metadata!.image!}
                        alt={`${displayName} #${item.tokenId}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={() => handleImgError(key)}
                      />
                    ) : (
                      <span className="text-2xl font-bold text-violet-300">M</span>
                    )}
                    {isLoadingMetadata && !item.metadata && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <span className="text-xs font-semibold text-dark-700 dark:text-dark-200 truncate w-full text-center">
                    {displayName}
                  </span>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-violet-900 text-violet-200 border border-violet-700">
                      #{item.tokenId}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-900 text-emerald-200 border border-emerald-700">
                      x{item.quantity}
                    </span>
                  </div>
                  {/* Selected checkmark */}
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {selectedItem && (
          <p className="mt-2 text-sm font-mono text-dark-500 dark:text-dark-400">
            Selected: {selectedItem.metadata?.name ?? selectedItem.collectionName ?? 'ERC1155'} #{selectedItem.tokenId}
            {selectedItem.collectionSymbol && ` (${selectedItem.collectionSymbol})`}
            {' '}&mdash; {selectedItem.quantity} available
          </p>
        )}
      </div>

      {/* Quantity */}
      {selectedItem && (
        <div>
          <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
            Quantity
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max={maxQuantity}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="input-field w-32"
            />
            <button
              type="button"
              onClick={() => setQuantity(selectedItem.quantity)}
              className="text-xs font-mono text-primary-500 hover:text-primary-400 transition-colors px-2 py-1 rounded border border-primary-500/30 hover:border-primary-400/50"
            >
              Max
            </button>
            <span className="text-sm text-dark-500 font-mono">/ {selectedItem.quantity}</span>
          </div>
          {parseInt(quantity, 10) > maxQuantity && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400 font-mono">
              Exceeds available balance ({selectedItem.quantity})
            </p>
          )}
          {parseInt(quantity, 10) <= 0 && quantity !== '' && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400 font-mono">
              Quantity must be at least 1
            </p>
          )}
        </div>
      )}

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
    </div>
  );
}
