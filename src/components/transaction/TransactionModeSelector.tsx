import type { TransactionMode } from '../../types';

interface TransactionModeSelectorProps {
  mode: TransactionMode;
  onModeChange: (mode: TransactionMode) => void;
  hasTokens: boolean;
  hasNfts: boolean;
  hasErc1155s: boolean;
}

const modes: Array<{
  value: TransactionMode;
  label: string;
  icon: JSX.Element;
  visibilityKey?: 'hasTokens' | 'hasNfts' | 'hasErc1155s';
}> = [
  {
    value: 'send-quai',
    label: 'Send QUAI',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    value: 'send-token',
    label: 'Send Token',
    visibilityKey: 'hasTokens',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4m16 0a8 8 0 11-16 0 8 8 0 0116 0z" />
      </svg>
    ),
  },
  {
    value: 'send-nft',
    label: 'Send NFT',
    visibilityKey: 'hasNfts',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    value: 'send-erc1155',
    label: 'Send ERC1155',
    visibilityKey: 'hasErc1155s',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    value: 'contract-call',
    label: 'Contract Call',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
];

export function TransactionModeSelector({ mode, onModeChange, hasTokens, hasNfts, hasErc1155s }: TransactionModeSelectorProps) {
  const visibilityFlags: Record<string, boolean> = { hasTokens, hasNfts, hasErc1155s };

  const visibleModes = modes.filter((m) => !m.visibilityKey || visibilityFlags[m.visibilityKey]);

  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 mb-6">
      {visibleModes.map((m) => {
        const isActive = mode === m.value;

        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onModeChange(m.value)}
            title={m.label}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border text-sm font-mono uppercase tracking-wider transition-colors ${
              isActive
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-dark-100 dark:bg-vault-dark-4 text-dark-500 border-dark-300 dark:border-dark-600 hover:border-dark-400 dark:hover:border-dark-500 hover:text-dark-600 dark:hover:text-dark-400 cursor-pointer'
            }`}
          >
            {m.icon}
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
