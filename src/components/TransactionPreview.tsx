import { useState, useEffect } from 'react';
import { decodeTransaction } from '../utils/transactionDecoder';
import { transactionBuilderService } from '../services/TransactionBuilderService';
import { Interface } from 'quais';
import QuaiVaultABI from '../config/abi/QuaiVault.json';

// Hoisted — avoid re-constructing on every render
const quaiVaultInterface = new Interface(QuaiVaultABI.abi);

// Module function ABIs for decoding calls to known modules (mirrors transactionDecoder.ts)
const moduleInterface = new Interface([
  'function setupRecovery(address wallet, address[] guardians, uint256 threshold, uint256 recoveryPeriod)',
  'function setDailyLimit(address wallet, uint256 limit)',
  'function resetDailyLimit(address wallet)',
  'function addToWhitelist(address wallet, address addr, uint256 limit)',
  'function removeFromWhitelist(address wallet, address addr)',
  'function batchAddToWhitelist(address wallet, address[] addrs, uint256[] limits)',
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
  onConfirm: () => void;
  onCancel: () => void;
  isWhitelisted?: boolean;
  canUseDailyLimit?: boolean;
}

export function TransactionPreview({
  to,
  value,
  data,
  walletAddress,
  onConfirm,
  onCancel,
  isWhitelisted = false,
  canUseDailyLimit = false,
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
  const decoded = decodeTransaction({ to, value: weiValue, data }, walletAddress);

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

      setDecodedCall(null);
    } else {
      setDecodedCall(null);
    }
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Transaction Type Badge */}
      <div className="flex items-center justify-center">
        <span className={`inline-flex items-center px-4 py-2 rounded text-base font-semibold ${decoded.bgColor} ${decoded.textColor} border ${decoded.borderColor}`}>
          <span className="mr-2 text-lg">{decoded.icon}</span>
          {decoded.description}
        </span>
      </div>

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

      {/* Execution Method */}
      {(isWhitelisted || canUseDailyLimit) && (
        <div className={`rounded-md p-4 border-l-4 ${
          isWhitelisted
            ? 'bg-gradient-to-r from-green-100 via-green-50 to-green-100 dark:from-green-900/90 dark:via-green-800/90 dark:to-green-900/90 border-green-600'
            : 'bg-gradient-to-r from-yellow-100 via-yellow-50 to-yellow-100 dark:from-yellow-900/90 dark:via-yellow-800/90 dark:to-yellow-900/90 border-yellow-600'
        }`}>
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              {isWhitelisted ? (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              )}
            </svg>
            <div>
              <h4 className={`text-base font-semibold mb-1 ${
                isWhitelisted ? 'text-green-800 dark:text-green-200' : 'text-yellow-800 dark:text-yellow-200'
              }`}>
                {isWhitelisted ? 'Whitelisted Address' : 'Daily Limit'}
              </h4>
              <p className={`text-sm ${
                isWhitelisted ? 'text-green-700 dark:text-green-200/90' : 'text-yellow-700 dark:text-yellow-200/90'
              }`}>
                {isWhitelisted
                  ? 'This transaction will execute immediately without requiring approvals.'
                  : 'This transaction bypasses multisig approvals and executes immediately within your daily allowance.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Warning for contract calls */}
      {data && data !== '0x' && !isWhitelisted && !canUseDailyLimit && (
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
          {isWhitelisted || canUseDailyLimit ? 'Execute Transaction' : 'Propose Transaction'}
        </button>
      </div>
    </div>
  );
}
