import { useState, useEffect, useMemo } from 'react';
import { Interface, isQuaiAddress } from 'quais';
import { useNftHoldings } from '../../hooks/useNftHoldings';
import { isSafeImageUrl } from '../../utils/imageValidation';
import type { SendNftMeta } from '../../types';
import type { NftHoldingWithMetadata } from '../../hooks/useNftHoldings';

// Hoisted — avoid re-constructing on every render
const erc721SafeTransferInterface = new Interface([
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
]);

interface SendNftFormProps {
  walletAddress: string;
  onToChange: (to: string) => void;
  onValueChange: (value: string) => void;
  onDataChange: (data: string) => void;
  onNftMetadataChange: (meta: SendNftMeta | null) => void;
  onRecipientChange: (recipient: string) => void;
  initialToken?: string;
  initialTokenId?: string;
}

export function SendNftForm({
  walletAddress,
  onToChange,
  onValueChange,
  onDataChange,
  onNftMetadataChange,
  onRecipientChange,
  initialToken,
  initialTokenId,
}: SendNftFormProps) {
  const { holdings, isLoading, isLoadingMetadata } = useNftHoldings(walletAddress);

  const initialKey = initialToken && initialTokenId
    ? `${initialToken.toLowerCase()}:${initialTokenId}`
    : null;

  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [recipient, setRecipient] = useState('');
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  // Find selected NFT from holdings
  const selectedNft = useMemo(
    () => holdings.find(h => `${h.tokenAddress.toLowerCase()}:${h.tokenId}` === selectedKey?.toLowerCase()) ?? null,
    [holdings, selectedKey],
  );

  // Clear selection if initial NFT not found in holdings
  useEffect(() => {
    if (initialKey && holdings.length > 0 && !selectedNft) {
      setSelectedKey(null);
    }
  }, [initialKey, holdings, selectedNft]);

  // Notify parent of NFT metadata changes
  useEffect(() => {
    if (selectedNft) {
      onNftMetadataChange({
        collectionName: selectedNft.collectionName,
        collectionSymbol: selectedNft.collectionSymbol,
        tokenId: selectedNft.tokenId,
        image: selectedNft.metadata?.image ?? null,
        tokenAddress: selectedNft.tokenAddress,
      });
    } else {
      onNftMetadataChange(null);
    }
  }, [selectedNft, onNftMetadataChange]);

  // Notify parent of recipient changes
  useEffect(() => {
    onRecipientChange(recipient);
  }, [recipient, onRecipientChange]);

  // Encode safeTransferFrom calldata
  useEffect(() => {
    if (!selectedNft || !recipient.trim() || !isQuaiAddress(recipient)) {
      onToChange('');
      onValueChange('0');
      onDataChange('0x');
      return;
    }

    try {
      const encoded = erc721SafeTransferInterface.encodeFunctionData('safeTransferFrom', [
        walletAddress,
        recipient.trim(),
        selectedNft.tokenId,
      ]);
      onToChange(selectedNft.tokenAddress);
      onValueChange('0');
      onDataChange(encoded);
    } catch {
      onDataChange('0x');
    }
  }, [selectedNft, recipient, walletAddress, onToChange, onValueChange, onDataChange]);

  const handleImgError = (key: string) => {
    setImgErrors(prev => new Set(prev).add(key));
  };

  const handleNftSelect = (nft: NftHoldingWithMetadata) => {
    const key = `${nft.tokenAddress.toLowerCase()}:${nft.tokenId}`;
    setSelectedKey(prev => prev === key ? null : key);
  };

  if (isLoading) {
    return (
      <div className="mb-8 flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-dark-500">
          <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-base font-mono">Loading NFT holdings...</span>
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="mb-8">
        <p className="text-base font-mono text-dark-500 text-center py-8">
          This vault doesn't hold any NFTs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mb-8">
      {/* NFT Grid */}
      <div>
        <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
          Select NFT
        </label>
        <div className="max-h-64 overflow-y-auto rounded-md border border-dark-300 dark:border-dark-600 p-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {holdings.map((nft) => {
              const key = `${nft.tokenAddress.toLowerCase()}:${nft.tokenId}`;
              const isSelected = selectedKey?.toLowerCase() === key;
              const hasImage = nft.metadata?.image && !imgErrors.has(key) && isSafeImageUrl(nft.metadata.image);
              const displayName = nft.metadata?.name ?? nft.collectionName ?? 'NFT';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleNftSelect(nft)}
                  className={`relative flex flex-col items-center p-2 rounded-md border-2 transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-dark-300 dark:border-dark-600 hover:border-dark-400 dark:hover:border-dark-500 bg-dark-100 dark:bg-vault-dark-4'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="w-full aspect-square rounded-md overflow-hidden bg-purple-900/50 border border-purple-700/50 flex items-center justify-center mb-2">
                    {hasImage ? (
                      <img
                        src={nft.metadata!.image!}
                        alt={`${displayName} #${nft.tokenId}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={() => handleImgError(key)}
                      />
                    ) : (
                      <span className="text-2xl font-bold text-purple-300">N</span>
                    )}
                    {isLoadingMetadata && !nft.metadata && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <span className="text-xs font-semibold text-dark-700 dark:text-dark-200 truncate w-full text-center">
                    {displayName}
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-900 text-purple-200 border border-purple-700 mt-1">
                    #{nft.tokenId}
                  </span>
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
        {selectedNft && (
          <p className="mt-2 text-sm font-mono text-dark-500 dark:text-dark-400">
            Selected: {selectedNft.metadata?.name ?? selectedNft.collectionName ?? 'NFT'} #{selectedNft.tokenId}
            {selectedNft.collectionSymbol && ` (${selectedNft.collectionSymbol})`}
          </p>
        )}
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
    </div>
  );
}
