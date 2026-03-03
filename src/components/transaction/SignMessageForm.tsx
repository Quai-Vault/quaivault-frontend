import { useState, useEffect, useMemo } from 'react';
import { toUtf8Bytes, hexlify, keccak256, isHexString } from 'quais';
import { transactionBuilderService } from '../../services/TransactionBuilderService';

const MAX_MESSAGE_LENGTH = 10_000;

interface SignMessageFormProps {
  walletAddress: string;
  onToChange: (to: string) => void;
  onValueChange: (value: string) => void;
  onDataChange: (data: string) => void;
}

export function SignMessageForm({
  walletAddress,
  onToChange,
  onValueChange,
  onDataChange,
}: SignMessageFormProps) {
  const [message, setMessage] = useState('');
  const [action, setAction] = useState<'sign' | 'unsign'>('sign');
  const [inputMode, setInputMode] = useState<'text' | 'hex'>('text');
  const [encodingError, setEncodingError] = useState<string | null>(null);

  // Encode calldata whenever inputs change
  useEffect(() => {
    if (!message.trim()) {
      onToChange('');
      onValueChange('0');
      onDataChange('0x');
      setEncodingError(null);
      return;
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      onDataChange('0x');
      setEncodingError(`Message too long (${message.length.toLocaleString()} chars). Maximum is ${MAX_MESSAGE_LENGTH.toLocaleString()}.`);
      return;
    }

    if (inputMode === 'hex' && !isHexString(message.trim())) {
      onDataChange('0x');
      setEncodingError('Invalid hex string. Must start with 0x and contain only hex characters.');
      return;
    }

    try {
      const messageBytes = inputMode === 'hex'
        ? message.trim()
        : hexlify(toUtf8Bytes(message));

      const encoded = action === 'sign'
        ? transactionBuilderService.buildSignMessage(messageBytes)
        : transactionBuilderService.buildUnsignMessage(messageBytes);

      onToChange(walletAddress);
      onValueChange('0');
      onDataChange(encoded);
      setEncodingError(null);
    } catch (e) {
      onDataChange('0x');
      setEncodingError(e instanceof Error ? e.message : 'Failed to encode message');
    }
  }, [message, action, inputMode, walletAddress, onToChange, onValueChange, onDataChange]);

  // Compute message hash for display
  const messageHash = useMemo(() => {
    if (!message.trim()) return null;
    try {
      const messageBytes = inputMode === 'hex'
        ? message.trim()
        : hexlify(toUtf8Bytes(message));
      return keccak256(messageBytes);
    } catch {
      return null;
    }
  }, [message, inputMode]);

  return (
    <div className="space-y-6 mb-8">
      {/* EIP-1271 Warning */}
      <div className="bg-yellow-900/30 border border-yellow-700 rounded-md p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm text-yellow-200 font-mono leading-relaxed">
            Signing a message makes this vault attest to it via EIP-1271. DApps and protocols can verify this signature. Only sign messages you fully understand.
          </p>
        </div>
      </div>

      {/* Action Toggle: Sign / Unsign */}
      <div>
        <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
          Action
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAction('sign')}
            className={`flex-1 px-4 py-2.5 rounded-md border text-sm font-mono uppercase tracking-wider transition-colors ${
              action === 'sign'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-dark-100 dark:bg-vault-dark-4 text-dark-500 border-dark-300 dark:border-dark-600 hover:border-dark-400 dark:hover:border-dark-500 hover:text-dark-600 dark:hover:text-dark-400 cursor-pointer'
            }`}
          >
            Sign Message
          </button>
          <button
            type="button"
            onClick={() => setAction('unsign')}
            className={`flex-1 px-4 py-2.5 rounded-md border text-sm font-mono uppercase tracking-wider transition-colors ${
              action === 'unsign'
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-dark-100 dark:bg-vault-dark-4 text-dark-500 border-dark-300 dark:border-dark-600 hover:border-dark-400 dark:hover:border-dark-500 hover:text-dark-600 dark:hover:text-dark-400 cursor-pointer'
            }`}
          >
            Unsign Message
          </button>
        </div>
      </div>

      {/* Input Mode Toggle */}
      <div>
        <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
          Input Format
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setInputMode('text'); setMessage(''); setEncodingError(null); }}
            className={`px-4 py-2 rounded-md border text-sm font-mono uppercase tracking-wider transition-colors ${
              inputMode === 'text'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-dark-100 dark:bg-vault-dark-4 text-dark-500 border-dark-300 dark:border-dark-600 hover:border-dark-400 dark:hover:border-dark-500 cursor-pointer'
            }`}
          >
            Text
          </button>
          <button
            type="button"
            onClick={() => { setInputMode('hex'); setMessage(''); setEncodingError(null); }}
            className={`px-4 py-2 rounded-md border text-sm font-mono uppercase tracking-wider transition-colors ${
              inputMode === 'hex'
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-dark-100 dark:bg-vault-dark-4 text-dark-500 border-dark-300 dark:border-dark-600 hover:border-dark-400 dark:hover:border-dark-500 cursor-pointer'
            }`}
          >
            Hex
          </button>
        </div>
      </div>

      {/* Message Input */}
      <div>
        <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={inputMode === 'text'
            ? 'Enter a message to sign (UTF-8 text)...'
            : '0x... (raw hex bytes)'}
          rows={4}
          className="input-field w-full font-mono text-sm resize-y"
        />
        <div className="flex justify-between mt-1">
          <div>
            {encodingError && (
              <p className="text-sm text-red-600 dark:text-red-400 font-mono">{encodingError}</p>
            )}
          </div>
          <p className="text-xs text-dark-500 font-mono">
            {message.length.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Message Hash Display */}
      {messageHash && (
        <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-4 border border-dark-300 dark:border-dark-600">
          <p className="text-xs font-mono text-dark-500 uppercase tracking-wider mb-1">Message Hash (keccak256)</p>
          <p className="text-sm font-mono text-dark-700 dark:text-dark-200 break-all">{messageHash}</p>
        </div>
      )}
    </div>
  );
}
