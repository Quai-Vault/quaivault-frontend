import { useState, useEffect } from 'react';
import { decodeTransaction } from '../utils/transactionDecoder';
import { transactionBuilderService } from '../services/TransactionBuilderService';
import { Interface } from 'quais';
import QuaiVaultABI from '../config/abi/QuaiVault.json';
import { formatAddress, formatDuration, formatExpiration } from '../utils/formatting';
import { isSafeImageUrl } from '../utils/imageValidation';
import type { TokenMetadata } from '../services/utils/ContractMetadataService';
import type { TransactionMode, SendTokenMeta, SendNftMeta, SendErc1155Meta } from '../types';

// Hoisted — avoid re-constructing on every render
const quaiVaultInterface = new Interface(QuaiVaultABI.abi);

// Module function ABIs for decoding calls to known modules (mirrors transactionDecoder.ts)
const moduleInterface = new Interface([
  'function setupRecovery(address wallet, address[] guardians, uint256 threshold, uint256 recoveryPeriod)',
]);

interface DecodedCallData {
  name: string;
  args: readonly unknown[];
}

interface TransactionPreviewProps {
  to: string;
  value: string;
  data: string;
  walletAddress: string;
  contractAbi?: any[] | null;
  tokenMetadata?: TokenMetadata | null;
  onConfirm: () => void;
  onCancel: () => void;
  transactionMode?: TransactionMode;
  sendTokenMeta?: SendTokenMeta | null;
  sendNftMeta?: SendNftMeta | null;
  sendErc1155Meta?: SendErc1155Meta | null;
  tokenRecipient?: string;
  tokenAmount?: string;
  nftRecipient?: string;
  erc1155Recipient?: string;
  erc1155Quantity?: string;
  expiration?: number;
  executionDelay?: number;
  minExecutionDelay?: number;
}

export function TransactionPreview({
  to,
  value,
  data,
  walletAddress,
  contractAbi,
  tokenMetadata,
  onConfirm,
  onCancel,
  transactionMode,
  sendTokenMeta,
  sendNftMeta,
  sendErc1155Meta,
  tokenRecipient,
  tokenAmount,
  nftRecipient,
  erc1155Recipient,
  erc1155Quantity,
  expiration,
  executionDelay,
  minExecutionDelay,
}: TransactionPreviewProps) {
  const [decodedCall, setDecodedCall] = useState<DecodedCallData | null>(null);
  // Convert human-readable QUAI value to wei string for decodeTransaction
  const weiValue = (() => {
    try {
      return transactionBuilderService.parseValue(value || '0').toString();
    } catch {
      return '0';
    }
  })();
  const decoded = decodeTransaction({ to, value: weiValue, data }, walletAddress, tokenMetadata);

  useEffect(() => {
    // Try to decode contract call data against known ABIs
    if (data && data !== '0x' && data.length > 2) {
      // Try QuaiVault ABI first (self-calls: addOwner, removeOwner, etc.)
      try {
        const result = quaiVaultInterface.parseTransaction({ data });
        if (result) {
          setDecodedCall({ name: result.name, args: result.args });
          return;
        }
      } catch {
        // Not a QuaiVault call — fall through
      }

      // Try module ABIs (module config proposals: setDailyLimit, addToWhitelist, etc.)
      try {
        const result = moduleInterface.parseTransaction({ data });
        if (result) {
          setDecodedCall({ name: result.name, args: result.args });
          return;
        }
      } catch {
        // Not a known module call
      }

      // Try fetched contract ABI (for external contract calls)
      if (contractAbi) {
        try {
          const contractInterface = new Interface(contractAbi);
          const result = contractInterface.parseTransaction({ data });
          if (result) {
            setDecodedCall({ name: result.name, args: result.args });
            return;
          }
        } catch {
          // Not decodable with this ABI
        }
      }

      setDecodedCall(null);
    } else {
      setDecodedCall(null);
    }
  }, [data, contractAbi]);

  return (
    <div className="space-y-6">
      {/* Transaction Type Badge */}
      <div className="flex items-center justify-center">
        <span className={`inline-flex items-center px-4 py-2 rounded text-base font-semibold ${decoded.bgColor} ${decoded.textColor} border ${decoded.borderColor}`}>
          <span className="mr-2 text-lg">{decoded.icon}</span>
          {decoded.description}
        </span>
      </div>

      {/* Token/NFT enrichment — show user-friendly details above the raw data */}
      {transactionMode === 'send-token' && sendTokenMeta && (
        <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600 space-y-3">
          <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-2">Token Transfer</h3>
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Token:</span>
            <span className="text-dark-700 dark:text-dark-200 font-semibold">
              {sendTokenMeta.symbol}{sendTokenMeta.name ? ` (${sendTokenMeta.name})` : ''}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Recipient:</span>
            <span className="text-primary-600 dark:text-primary-300 font-mono break-all text-right max-w-xs">
              {tokenRecipient || '-'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Amount:</span>
            <span className="text-dark-700 dark:text-dark-200 font-semibold">
              {tokenAmount || '0'} <span className="text-primary-600 dark:text-primary-400">{sendTokenMeta.symbol}</span>
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Contract:</span>
            <span className="text-dark-500 font-mono text-sm">{formatAddress(sendTokenMeta.address)}</span>
          </div>
        </div>
      )}

      {transactionMode === 'send-nft' && sendNftMeta && (
        <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600 space-y-3">
          <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-2">NFT Transfer</h3>
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Collection:</span>
            <span className="text-dark-700 dark:text-dark-200 font-semibold">
              {sendNftMeta.collectionName ?? 'Unknown'}{sendNftMeta.collectionSymbol ? ` (${sendNftMeta.collectionSymbol})` : ''}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Token ID:</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-semibold bg-purple-900 text-purple-200 border border-purple-700">
              #{sendNftMeta.tokenId}
            </span>
          </div>
          {sendNftMeta.image && isSafeImageUrl(sendNftMeta.image) && (
            <div className="flex justify-center">
              <img src={sendNftMeta.image} alt={`NFT #${sendNftMeta.tokenId}`} className="w-20 h-20 rounded-md object-cover border border-dark-300 dark:border-dark-600" />
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Recipient:</span>
            <span className="text-primary-600 dark:text-primary-300 font-mono break-all text-right max-w-xs">
              {nftRecipient || '-'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Contract:</span>
            <span className="text-dark-500 font-mono text-sm">{formatAddress(sendNftMeta.tokenAddress)}</span>
          </div>
        </div>
      )}

      {transactionMode === 'send-erc1155' && sendErc1155Meta && (
        <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600 space-y-3">
          <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-2">ERC1155 Transfer</h3>
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Collection:</span>
            <span className="text-dark-700 dark:text-dark-200 font-semibold">
              {sendErc1155Meta.collectionName ?? 'Unknown'}{sendErc1155Meta.collectionSymbol ? ` (${sendErc1155Meta.collectionSymbol})` : ''}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Token ID:</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-semibold bg-violet-900 text-violet-200 border border-violet-700">
              #{sendErc1155Meta.tokenId}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Quantity:</span>
            <span className="text-dark-700 dark:text-dark-200 font-semibold">
              {erc1155Quantity || '?'} <span className="text-dark-500">/ {sendErc1155Meta.balance} available</span>
            </span>
          </div>
          {sendErc1155Meta.image && isSafeImageUrl(sendErc1155Meta.image) && (
            <div className="flex justify-center">
              <img src={sendErc1155Meta.image} alt={`Token #${sendErc1155Meta.tokenId}`} className="w-20 h-20 rounded-md object-cover border border-dark-300 dark:border-dark-600" />
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Recipient:</span>
            <span className="text-primary-600 dark:text-primary-300 font-mono break-all text-right max-w-xs">
              {erc1155Recipient || '-'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Contract:</span>
            <span className="text-dark-500 font-mono text-sm">{formatAddress(sendErc1155Meta.tokenAddress)}</span>
          </div>
        </div>
      )}

      {/* Transaction Details */}
      <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600 space-y-4">
        <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-4">Transaction Details</h3>

        <div className="space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Recipient:</span>
            <span className="text-primary-600 dark:text-primary-300 font-mono break-all text-right max-w-xs">
              {to || '-'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Amount:</span>
            <span className="text-dark-700 dark:text-dark-200 font-semibold">
              {value || '0'} <span className="text-primary-600 dark:text-primary-400">QUAI</span>
            </span>
          </div>

          {decoded.details && (
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Operation:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">{decoded.details}</span>
            </div>
          )}

          {decodedCall && (
            <div className="pt-3 border-t border-dark-200 dark:border-dark-600">
              <div className="text-base font-mono text-dark-500 uppercase tracking-wider mb-2">Function Call:</div>
              <div className="bg-dark-200 dark:bg-vault-dark-3 rounded p-3 font-mono text-sm text-dark-600 dark:text-dark-300">
                <div className="text-primary-600 dark:text-primary-400 mb-1">{decodedCall.name}</div>
                {decodedCall.args && decodedCall.args.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {Array.from(decodedCall.args).map((arg, index) => (
                      <div key={index} className="text-dark-500 dark:text-dark-400">
                        <span className="text-dark-500">arg{index}:</span> {String(arg)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {data && data !== '0x' && !decodedCall && (
            <div className="pt-3 border-t border-dark-200 dark:border-dark-600">
              <div className="text-base font-mono text-dark-500 uppercase tracking-wider mb-2">Call Data:</div>
              <div className="bg-dark-200 dark:bg-vault-dark-3 rounded p-3 font-mono text-xs text-dark-500 dark:text-dark-400 break-all">
                {data.length > 100 ? `${data.slice(0, 100)}...` : data}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Advanced Options Summary */}
      {(expiration || executionDelay || (minExecutionDelay && minExecutionDelay > 0)) ? (
        <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600 space-y-3">
          <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-2">Advanced Options</h3>
          {(() => {
            const userDelay = executionDelay ?? 0;
            const vaultDelay = minExecutionDelay ?? 0;
            const totalDelay = vaultDelay + userDelay;
            if (totalDelay > 0) {
              return (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Effective Delay:</span>
                    <span className="text-dark-700 dark:text-dark-200 font-semibold">{formatDuration(totalDelay)}</span>
                  </div>
                  {vaultDelay > 0 && userDelay > 0 && (
                    <p className="text-sm font-mono text-dark-500">
                      Vault timelock ({formatDuration(vaultDelay)}) + your delay ({formatDuration(userDelay)})
                    </p>
                  )}
                  {vaultDelay > 0 && userDelay === 0 && (
                    <p className="text-sm font-mono text-dark-500">
                      Vault timelock
                    </p>
                  )}
                </div>
              );
            }
            return null;
          })()}
          {expiration ? (
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Expiration:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">{formatExpiration(expiration)}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Warning for contract calls */}
      {data && data !== '0x' && (
        <div className="bg-gradient-to-r from-yellow-100 via-yellow-50 to-yellow-100 dark:from-yellow-900/90 dark:via-yellow-800/90 dark:to-yellow-900/90 border-l-4 border-yellow-600 rounded-md p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <h4 className="text-base font-semibold text-yellow-800 dark:text-yellow-200 mb-1">Contract Call</h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-200/90">
                You are calling a smart contract. Make sure you trust the contract and understand what it does.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 pt-4 border-t border-dark-200 dark:border-dark-600">
        <button
          onClick={onCancel}
          className="btn-secondary flex-1"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="btn-primary flex-1"
        >
          Propose Transaction
        </button>
      </div>
    </div>
  );
}
