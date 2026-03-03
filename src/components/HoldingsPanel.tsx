import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatAddress } from '../utils/formatting';
import { isSafeImageUrl } from '../utils/imageValidation';
import { ExplorerLink } from './ExplorerLink';
import type { NftMetadata } from '../services/utils/NftMetadataService';

/** Common shape for a displayable holding item. */
export interface HoldingItem {
  tokenAddress: string;
  tokenId: string;
  collectionName: string | null;
  collectionSymbol: string | null;
  metadata: NftMetadata | null;
  /** Only present for ERC1155 items. */
  quantity?: string;
}

export interface HoldingsPanelConfig {
  title: string;
  placeholderLetter: string;
  /** Tailwind color token: "purple" or "violet" etc. */
  colorScheme: 'purple' | 'violet';
  /** Route mode for the Send link query param. */
  routeMode: string;
  /** Fallback name for alt text (e.g. "NFT", "ERC1155"). */
  fallbackAltName: string;
}

interface HoldingsPanelProps {
  walletAddress: string;
  isOwner?: boolean;
  config: HoldingsPanelConfig;
  items: HoldingItem[];
  totalCount: number;
  /** Optional "50/120" style count override. If undefined, shows totalCount. */
  countDisplay?: string;
  isLoading: boolean;
  isLoadingMetadata: boolean;
  isRefetching: boolean;
  isIndexerEnabled: boolean;
  isIndexerConnected: boolean;
  error: string | null;
  onRefetch: () => void;
}

// Static class maps so Tailwind JIT can detect all class names at build time.
const COLOR_CLASSES = {
  purple: {
    thumbnail: 'bg-purple-900/50 border border-purple-700/50',
    placeholder: 'text-purple-300',
    badge: 'bg-purple-900 text-purple-200 border border-purple-700',
  },
  violet: {
    thumbnail: 'bg-violet-900/50 border border-violet-700/50',
    placeholder: 'text-violet-300',
    badge: 'bg-violet-900 text-violet-200 border border-violet-700',
  },
} as const;

export function HoldingsPanel({
  walletAddress,
  isOwner,
  config,
  items,
  totalCount,
  countDisplay,
  isLoading,
  isLoadingMetadata,
  isRefetching,
  isIndexerEnabled,
  isIndexerConnected,
  error,
  onRefetch,
}: HoldingsPanelProps) {
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isIndexerEnabled || !isIndexerConnected) {
    return null;
  }

  if (error) {
    return (
      <div className="col-span-2 mt-2">
        <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1.5">{config.title}</h3>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="col-span-2 mt-2">
        <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-1.5">{config.title}</h3>
        <div className="flex items-center justify-center p-3">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  const handleImgError = (key: string) => {
    setImgErrors(prev => new Set(prev).add(key));
  };

  const colors = COLOR_CLASSES[config.colorScheme];

  return (
    <div className="col-span-2 mt-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 group"
          type="button"
        >
          <svg
            className={`w-3.5 h-3.5 text-dark-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider group-hover:text-dark-400 transition-colors">{config.title}</h3>
          <span className="text-xs text-dark-500 ml-1">
            ({countDisplay ?? totalCount})
          </span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRefetch(); }}
          disabled={isRefetching}
          className="text-xs text-primary-500 hover:text-primary-400 transition-colors disabled:opacity-50"
          title={`Refresh ${config.title.toLowerCase()}`}
        >
          <svg className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      {isExpanded && (
        <div className="space-y-1.5 mt-1.5">
          {items.map((item) => {
            const key = `${item.tokenAddress}:${item.tokenId}`;
            const hasImage = item.metadata?.image && !imgErrors.has(key) && isSafeImageUrl(item.metadata.image);
            const displayName = item.metadata?.name ?? `Token #${item.tokenId}`;

            return (
              <div
                key={key}
                className="flex items-center justify-between p-2.5 bg-dark-100 dark:bg-vault-dark-4 rounded-md border border-dark-300 dark:border-dark-600"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {/* Thumbnail or placeholder */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-md overflow-hidden ${colors.thumbnail} flex items-center justify-center`}>
                    {hasImage ? (
                      <img
                        src={item.metadata!.image!}
                        alt={`${item.collectionName ?? config.fallbackAltName} #${item.tokenId}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={() => handleImgError(key)}
                      />
                    ) : (
                      <span className={`text-sm font-bold ${colors.placeholder}`}>{config.placeholderLetter}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold text-dark-700 dark:text-dark-200 truncate">
                        {displayName}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${colors.badge} flex-shrink-0`}>
                        #{item.tokenId}
                      </span>
                      {item.quantity && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-900 text-emerald-200 border border-emerald-700 flex-shrink-0">
                          x{item.quantity}
                        </span>
                      )}
                      {isLoadingMetadata && !item.metadata && (
                        <div className="w-3 h-3 border border-dark-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.collectionName && (
                        <span className="text-xs text-dark-500 dark:text-dark-400 truncate">{item.collectionName}</span>
                      )}
                      {item.collectionSymbol && (
                        <span className="text-xs text-dark-500 dark:text-dark-400">({item.collectionSymbol})</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <ExplorerLink type="address" value={item.tokenAddress} showIcon={false} className="text-xs">
                    {formatAddress(item.tokenAddress)}
                  </ExplorerLink>
                  {isOwner && (
                    <Link
                      to={`/wallet/${walletAddress}/transaction/new?mode=${config.routeMode}&token=${item.tokenAddress}&tokenId=${item.tokenId}`}
                      className="text-xs font-mono text-primary-500 hover:text-primary-400 transition-colors px-1.5 py-0.5 rounded border border-primary-500/30 hover:border-primary-400/50"
                      title={item.quantity ? `Send ${item.quantity}x Token #${item.tokenId}` : `Send NFT #${item.tokenId}`}
                    >
                      Send
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
