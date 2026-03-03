import { formatAddress } from '../../utils/formatting';
import type { TransactionMode, SendTokenMeta, SendNftMeta, SendErc1155Meta } from '../../types';

interface TransactionSummaryPanelProps {
  mode: TransactionMode;
  to: string;
  value: string;
  data: string;
  tokenMeta: SendTokenMeta | null;
  tokenRecipient: string;
  tokenAmount: string;
  nftMeta: SendNftMeta | null;
  nftRecipient: string;
  erc1155Meta: SendErc1155Meta | null;
  erc1155Recipient: string;
  erc1155Quantity: string;
}

function getTransactionTypeLabel(mode: TransactionMode, data: string): string {
  switch (mode) {
    case 'send-quai':
      return !data || data === '0x' ? 'Simple Transfer' : 'Contract Call';
    case 'send-token':
      return 'Token Transfer';
    case 'send-nft':
      return 'NFT Transfer';
    case 'send-erc1155':
      return 'ERC1155 Transfer';
    case 'contract-call':
      return !data || data === '0x' ? 'Simple Transfer' : 'Contract Call';
    case 'sign-message':
      return 'Message Signing';
  }
}

export function TransactionSummaryPanel({
  mode,
  to,
  value,
  data,
  tokenMeta,
  tokenRecipient,
  tokenAmount,
  nftMeta,
  nftRecipient,
  erc1155Meta,
  erc1155Recipient,
  erc1155Quantity,
}: TransactionSummaryPanelProps) {
  return (
    <div className="mb-8 bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600">
      <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-4">Transaction Summary</h3>
      <div className="space-y-3 text-lg">
        {/* Type */}
        <div className="flex justify-between items-center">
          <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Type:</span>
          <span className="text-dark-700 dark:text-dark-200 font-semibold">
            {getTransactionTypeLabel(mode, data)}
          </span>
        </div>

        {/* Mode-specific details */}
        {mode === 'send-token' && tokenMeta ? (
          <>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Token:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">
                {tokenMeta.symbol}{tokenMeta.name ? ` (${tokenMeta.name})` : ''}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Recipient:</span>
              <span className="text-primary-600 dark:text-primary-300 font-mono truncate max-w-xs text-right">
                {tokenRecipient || '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Amount:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">
                {tokenAmount || '0'} <span className="text-primary-600 dark:text-primary-400">{tokenMeta.symbol}</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Contract:</span>
              <span className="text-dark-500 font-mono text-sm">{formatAddress(tokenMeta.address)}</span>
            </div>
          </>
        ) : mode === 'send-nft' && nftMeta ? (
          <>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Collection:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">
                {nftMeta.collectionName ?? 'Unknown'}{nftMeta.collectionSymbol ? ` (${nftMeta.collectionSymbol})` : ''}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Token ID:</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-semibold bg-purple-900 text-purple-200 border border-purple-700">
                #{nftMeta.tokenId}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Recipient:</span>
              <span className="text-primary-600 dark:text-primary-300 font-mono truncate max-w-xs text-right">
                {nftRecipient || '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Contract:</span>
              <span className="text-dark-500 font-mono text-sm">{formatAddress(nftMeta.tokenAddress)}</span>
            </div>
          </>
        ) : mode === 'send-erc1155' && erc1155Meta ? (
          <>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Collection:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">
                {erc1155Meta.collectionName ?? 'Unknown'}{erc1155Meta.collectionSymbol ? ` (${erc1155Meta.collectionSymbol})` : ''}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Token ID:</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-semibold bg-violet-900 text-violet-200 border border-violet-700">
                #{erc1155Meta.tokenId}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Quantity:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">
                {erc1155Quantity || '?'} <span className="text-dark-500">/ {erc1155Meta.balance} available</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Recipient:</span>
              <span className="text-primary-600 dark:text-primary-300 font-mono truncate max-w-xs text-right">
                {erc1155Recipient || '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Contract:</span>
              <span className="text-dark-500 font-mono text-sm">{formatAddress(erc1155Meta.tokenAddress)}</span>
            </div>
          </>
        ) : mode === 'sign-message' ? (
          <>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Target:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">Self-call (this vault)</span>
            </div>
            {data && data !== '0x' && (
              <div className="flex justify-between items-start">
                <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Data:</span>
                <span className="text-dark-500 font-mono text-sm break-all text-right max-w-xs">
                  {data.length > 20 ? `${data.slice(0, 20)}...` : data}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Recipient:</span>
              <span className="text-primary-600 dark:text-primary-300 font-mono truncate max-w-xs text-right">
                {to || '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Amount:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">
                {value || '0'} <span className="text-primary-600 dark:text-primary-400">QUAI</span>
              </span>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
