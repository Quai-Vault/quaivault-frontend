import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMultisig } from '../hooks/useMultisig';
import { useWallet } from '../hooks/useWallet';
import { transactionBuilderService } from '../services/TransactionBuilderService';
import { multisigService } from '../services/MultisigService';
import { Modal } from '../components/Modal';
import { TransactionFlow } from '../components/TransactionFlow';
import { TransactionPreview } from '../components/TransactionPreview';
import { isQuaiAddress, isHexString } from 'quais';
import { TIMING } from '../config/contracts';

export function NewTransaction() {
  const { address: walletAddress } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const { address: connectedAddress } = useWallet();
  const { proposeTransactionAsync, executeToWhitelistAsync, executeBelowLimitAsync, walletInfo } = useMultisig(walletAddress);

  const isOwner = useMemo(() =>
    walletInfo?.owners.some(
      (owner) => owner.toLowerCase() === connectedAddress?.toLowerCase()
    ) || false,
    [walletInfo?.owners, connectedAddress]
  );

  const [to, setTo] = useState('');
  const [value, setValue] = useState('');
  const [data, setData] = useState('0x');
  const [errors, setErrors] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null);
  const [whitelistLimit, setWhitelistLimit] = useState<bigint | null>(null);
  const [canUseDailyLimit, setCanUseDailyLimit] = useState<boolean | null>(null);
  const [useDailyLimit, setUseDailyLimit] = useState(true); // User's choice: use daily limit or propose
  const [remainingDailyLimit, setRemainingDailyLimit] = useState<bigint | null>(null);
  const [dailyLimitInfo, setDailyLimitInfo] = useState<{ limit: bigint; spent: bigint } | null>(null);
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Clean up navigate timeout on unmount
  useEffect(() => {
    return () => {
      if (navigateTimeoutRef.current) clearTimeout(navigateTimeoutRef.current);
    };
  }, []);

  // Whether the user chose daily limit AND it's actually available
  const effectiveDailyLimit = canUseDailyLimit === true && useDailyLimit && (!data || data === '0x');

  // Pre-compute whether value exceeds vault balance (avoids parseValue in render path)
  const exceedsBalance = useMemo(() => {
    if (!walletInfo || !value.trim()) return false;
    try {
      return transactionBuilderService.parseValue(value) > BigInt(walletInfo.balance);
    } catch {
      return false;
    }
  }, [value, walletInfo]);

  // Pre-compute whether value exceeds daily limit (avoids parseValue in render path)
  const exceedsDailyLimit = useMemo(() => {
    if (!value.trim() || remainingDailyLimit === null) return false;
    try {
      return transactionBuilderService.parseValue(value || '0') > remainingDailyLimit;
    } catch {
      return false;
    }
  }, [value, remainingDailyLimit]);

  // Pre-compute daily limit display text (avoids IIFE + try/catch in render)
  const dailyLimitText = useMemo(() => {
    if (!dailyLimitInfo || dailyLimitInfo.limit <= 0n || remainingDailyLimit === null) return null;
    try {
      const txAmount = value.trim() ? transactionBuilderService.parseValue(value || '0') : 0n;
      if (txAmount > remainingDailyLimit) {
        return `Exceeds limit (Remaining: ${transactionBuilderService.formatValue(remainingDailyLimit)} QUAI)`;
      }
      const remainingAfter = remainingDailyLimit - txAmount;
      return txAmount > 0n
        ? `${transactionBuilderService.formatValue(remainingAfter)} / ${transactionBuilderService.formatValue(dailyLimitInfo.limit)} QUAI remaining`
        : `${transactionBuilderService.formatValue(remainingDailyLimit)} / ${transactionBuilderService.formatValue(dailyLimitInfo.limit)} QUAI remaining`;
    } catch {
      return null;
    }
  }, [value, remainingDailyLimit, dailyLimitInfo]);

  // Check whitelist status when address or value changes
  useEffect(() => {
    // Track if effect is still active (component mounted and this effect not cleaned up)
    let isActive = true;

    const checkWhitelist = async () => {
      if (!walletAddress || !to.trim() || !isQuaiAddress(to)) {
        if (isActive) {
          setIsWhitelisted(null);
          setWhitelistLimit(null);
        }
        return;
      }

      try {
        const parsedValue = transactionBuilderService.parseValue(value || '0');
        const trimmedTo = to.trim();

        // Run whitelist check and limit fetch in parallel for efficiency
        const [canExecute, limit] = await Promise.all([
          multisigService.canExecuteViaWhitelist(walletAddress, trimmedTo, parsedValue),
          multisigService.getWhitelistLimit(walletAddress, trimmedTo),
        ]);

        // Check if effect is still active before updating state
        if (!isActive) return;

        if (canExecute.canExecute) {
          setIsWhitelisted(true);
          setWhitelistLimit(limit);
        } else {
          setIsWhitelisted(false);
          setWhitelistLimit(null);
        }
      } catch (error) {
        if (isActive) {
          setIsWhitelisted(false);
          setWhitelistLimit(null);
        }
      }
    };

    // Debounce the check
    const timeoutId = setTimeout(checkWhitelist, TIMING.INPUT_DEBOUNCE);
    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [walletAddress, to, value]);

  // Check daily limit status when value changes (only for simple transfers, not contract calls)
  useEffect(() => {
    // Track if effect is still active (component mounted and this effect not cleaned up)
    let isActive = true;

    const checkDailyLimit = async () => {
      if (!walletAddress || (data && data !== '0x')) {
        if (isActive) {
          setCanUseDailyLimit(null);
          setRemainingDailyLimit(null);
          setDailyLimitInfo(null);
        }
        return;
      }

      try {
        // Fetch daily limit info and remaining in parallel for efficiency
        const [dailyLimit, remaining] = await Promise.all([
          multisigService.getDailyLimit(walletAddress),
          multisigService.getRemainingLimit(walletAddress),
        ]);
        if (!isActive) return;

        if (dailyLimit.limit === 0n) {
          // No daily limit set
          setCanUseDailyLimit(null);
          setRemainingDailyLimit(null);
          setDailyLimitInfo(null);
          return;
        }

        setDailyLimitInfo({ limit: dailyLimit.limit, spent: dailyLimit.spent });
        setRemainingDailyLimit(remaining);

        // Check if we can execute via daily limit
        if (value.trim()) {
          const parsedValue = transactionBuilderService.parseValue(value || '0');
          const canExecute = await multisigService.canExecuteViaDailyLimit(
            walletAddress,
            parsedValue
          );
          if (isActive) {
            setCanUseDailyLimit(canExecute.canExecute);
          }
        } else {
          if (isActive) {
            setCanUseDailyLimit(null);
          }
        }
      } catch (error) {
        // Module might not be enabled or other error - don't enforce limit
        if (isActive) {
          setCanUseDailyLimit(null);
          setRemainingDailyLimit(null);
          setDailyLimitInfo(null);
        }
      }
    };

    // Debounce the check
    const timeoutId = setTimeout(checkDailyLimit, TIMING.INPUT_DEBOUNCE);
    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [walletAddress, value, data]);

  const validateForm = async (): Promise<boolean> => {
    const newErrors: string[] = [];

    if (!to.trim()) {
      newErrors.push('Recipient address is required');
    } else if (!isQuaiAddress(to)) {
      newErrors.push('Invalid recipient address');
    }

    if (!value.trim()) {
      newErrors.push('Value is required');
    } else {
      try {
        const parsedValue = transactionBuilderService.parseValue(value);
        if (parsedValue < 0n) {
          newErrors.push('Value cannot be negative');
        }
        // Check vault balance
        if (walletInfo && parsedValue > 0n) {
          const vaultBalance = BigInt(walletInfo.balance);
          if (parsedValue > vaultBalance) {
            const formattedBalance = transactionBuilderService.formatValue(vaultBalance);
            newErrors.push(`Amount exceeds vault balance of ${formattedBalance} QUAI`);
          }
        }
        // Check whitelist limit if applicable
        if (isWhitelisted && whitelistLimit !== null && whitelistLimit > 0n && parsedValue > whitelistLimit) {
          const formattedLimit = transactionBuilderService.formatValue(whitelistLimit);
          newErrors.push(`Value exceeds whitelist limit of ${formattedLimit} QUAI`);
        }
        
        // Check daily limit for simple transfers only when user chose daily limit mode
        if (walletAddress && useDailyLimit && canUseDailyLimit === true && (!data || data === '0x')) {
          try {
            // Always fetch fresh data at validation time to catch recently-changed limits
            const [dailyLimit, remaining] = await Promise.all([
              multisigService.getDailyLimit(walletAddress),
              multisigService.getRemainingLimit(walletAddress),
            ]);

            if (dailyLimit.limit > 0n && parsedValue > remaining) {
              const formattedLimit = transactionBuilderService.formatValue(dailyLimit.limit);
              const formattedRemaining = transactionBuilderService.formatValue(remaining);
              newErrors.push(`Transaction exceeds daily limit. Daily limit: ${formattedLimit} QUAI, Remaining: ${formattedRemaining} QUAI. Switch to "Propose Transaction" to submit for multisig approval instead.`);
            }
          } catch (error) {
            // If we can't check daily limit (e.g., module not enabled), don't block the transaction
            console.warn('Could not check daily limit:', error instanceof Error ? error.message : 'Unknown error');
          }
        }
      } catch {
        newErrors.push('Invalid value format');
      }
    }

    if (data && data !== '0x') {
      if (!isHexString(data)) {
        newErrors.push('Invalid data format (must be hex string)');
      }
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!walletAddress) {
      setErrors(['Invalid wallet address']);
      return;
    }

    const isValid = await validateForm();
    if (!isValid) {
      return;
    }

    // Show preview first
    setShowPreview(true);
    setErrors([]);
  };

  const handlePreviewConfirm = () => {
    setShowPreview(false);
    // Show the transaction flow modal
    setShowFlow(true);
    setResetKey(prev => prev + 1);
  };

  const handlePreviewCancel = () => {
    setShowPreview(false);
  };

  const handleProposeTransaction = async (onProgress: (progress: any) => void) => {
    if (!walletAddress) {
      throw new Error('Invalid wallet address');
    }

    const parsedValue = transactionBuilderService.parseValue(value);
    const normalizedTo = to.trim();
    const normalizedData = (data || '0x').trim();

    // Priority: Whitelist > Daily Limit > Normal Proposal
    // Check if we can execute via whitelist first
    const canExecuteWhitelist = await multisigService.canExecuteViaWhitelist(
      walletAddress,
      normalizedTo,
      parsedValue
    );

    let txHash = '';

    if (canExecuteWhitelist.canExecute) {
      // Execute directly via whitelist (no approvals needed)
      onProgress({ step: 'signing', message: 'Please approve the transaction execution in your wallet (whitelisted address - no approvals needed)' });

      txHash = await executeToWhitelistAsync({
        walletAddress,
        to: normalizedTo,
        value: parsedValue,
        data: normalizedData,
      }) || '';

      onProgress({ step: 'waiting', txHash, message: 'Executing transaction via whitelist...' });
    } else if (useDailyLimit && (!normalizedData || normalizedData === '0x')) {
      // User chose daily limit mode - verify it's still valid
      const canExecuteDailyLimit = await multisigService.canExecuteViaDailyLimit(
        walletAddress,
        parsedValue
      );

      if (canExecuteDailyLimit.canExecute) {
        // Execute directly via daily limit (no approvals needed)
        onProgress({ step: 'signing', message: 'Please approve the transaction execution in your wallet (within daily limit - no approvals needed)' });

        txHash = await executeBelowLimitAsync({
          walletAddress,
          to: normalizedTo,
          value: parsedValue,
          data: normalizedData,
        }) || '';

        onProgress({ step: 'waiting', txHash, message: 'Executing transaction via daily limit...' });
      } else {
        // Daily limit no longer valid (e.g., spent in another tab) - fall back to proposal
        onProgress({ step: 'signing', message: 'Daily limit exceeded — falling back to proposal. Please approve in your wallet.' });

        txHash = await proposeTransactionAsync({
          walletAddress,
          to: normalizedTo,
          value: parsedValue,
          data: normalizedData,
        }) || '';

        onProgress({ step: 'waiting', txHash, message: 'Waiting for transaction confirmation...' });
      }
    } else {
      // Normal proposal flow (requires approvals)
      onProgress({ step: 'signing', message: 'Please approve the transaction proposal in your wallet' });

      txHash = await proposeTransactionAsync({
        walletAddress,
        to: normalizedTo,
        value: parsedValue,
        data: normalizedData,
      }) || '';

      onProgress({ step: 'waiting', txHash, message: 'Waiting for transaction confirmation...' });
    }

    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, TIMING.TX_MINE_WAIT));

    return txHash;
  };

  const handleComplete = useCallback(() => {
    setShowFlow(false);
    // Navigate back to wallet detail after a short delay
    navigateTimeoutRef.current = setTimeout(() => {
      navigate(`/wallet/${walletAddress}`);
    }, 500);
  }, [navigate, walletAddress]);

  const handleCancel = () => {
    setShowFlow(false);
  };

  if (!walletAddress) {
    return (
      <div className="text-center py-20">
        <div className="vault-panel max-w-md mx-auto p-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-dark-100 dark:bg-vault-dark-4 border-2 border-primary-600/30 mb-6">
            <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-display font-bold text-dark-700 dark:text-dark-200 mb-2">Invalid Vault Address</h2>
          <p className="text-dark-500">The requested vault address is invalid.</p>
        </div>
      </div>
    );
  }

  if (walletInfo && !isOwner) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate(`/wallet/${walletAddress}`)}
            className="text-lg text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 mb-3 inline-flex items-center gap-4 transition-colors font-semibold"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Vault
          </button>
        </div>
        <div className="text-center py-20">
          <div className="vault-panel max-w-md mx-auto p-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-dark-100 dark:bg-vault-dark-4 border-2 border-yellow-500/30 mb-6">
              <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-display font-bold text-dark-700 dark:text-dark-200 mb-2">Not a Vault Owner</h2>
            <p className="text-dark-500">Your connected account is not an owner of this vault. Only owners can propose transactions.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <button
          onClick={() => navigate(`/wallet/${walletAddress}`)}
          className="text-lg text-primary-600 dark:text-primary-400 hover:text-primary-600 dark:text-primary-300 mb-3 inline-flex items-center gap-4 transition-colors font-semibold"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Vault
        </button>
        <h1 className="text-4xl font-display font-bold text-gradient-red vault-text-glow">New Transaction</h1>
        <p className="text-lg font-mono text-dark-500 uppercase tracking-wider mt-2">
          {isWhitelisted === true
            ? 'Execute transaction to whitelisted address (no approvals needed)'
            : effectiveDailyLimit
            ? 'Execute within daily limit (bypasses approvals)'
            : 'Propose a new multisig transaction'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="vault-panel p-8">
        {/* Recipient Address */}
        <div className="mb-8">
          <label htmlFor="to" className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
            Recipient Address
          </label>
          <input
            id="to"
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="0x..."
            className="input-field w-full"
          />
        </div>

        {/* Value */}
        <div className="mb-8">
          <label htmlFor="value" className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
            Amount (QUAI)
          </label>
          <input
            id="value"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0.0"
            className="input-field w-full"
          />
          <p className="mt-2 text-base font-mono text-dark-600">
            Enter the amount in QUAI (e.g., 1.5 for 1.5 QUAI)
          </p>
          {walletInfo && (
            <p className="mt-1 text-base font-mono text-dark-500 dark:text-dark-400">
              Vault balance: <span className={`font-semibold ${
                exceedsBalance ? 'text-red-600 dark:text-red-400' : 'text-primary-600 dark:text-primary-400'
              }`}>{transactionBuilderService.formatValue(BigInt(walletInfo.balance))} QUAI</span>
            </p>
          )}
        </div>

        {/* Data (Optional) */}
        <div className="mb-8">
          <label htmlFor="data" className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
            Data (Optional)
          </label>
          <textarea
            id="data"
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder="0x"
            rows={4}
            className="input-field w-full font-mono text-lg"
          />
          <p className="mt-2 text-base font-mono text-dark-600">
            Optional contract call data. Leave as "0x" for simple transfers.
          </p>
        </div>

        {/* Transaction Mode Selector - shown when daily limit is available */}
        {canUseDailyLimit === true && (!data || data === '0x') && !isWhitelisted && (
          <div className="mb-8 bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600">
            <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-4">Transaction Method</h3>
            <div className="space-y-3">
              <label className={`flex items-start gap-3 p-4 rounded-md border-2 cursor-pointer transition-colors ${
                useDailyLimit
                  ? 'border-yellow-500 dark:border-yellow-600 bg-yellow-50/50 dark:bg-yellow-900/20'
                  : 'border-dark-300 dark:border-dark-600 hover:border-dark-400 dark:hover:border-dark-500'
              }`}>
                <input
                  type="radio"
                  name="txMode"
                  checked={useDailyLimit}
                  onChange={() => setUseDailyLimit(true)}
                  className="mt-1 accent-yellow-500"
                />
                <div>
                  <span className="text-lg font-semibold text-dark-700 dark:text-dark-200">Execute via Daily Limit</span>
                  <p className="text-sm text-dark-500 dark:text-dark-400 mt-1">
                    Bypasses multisig approvals and executes immediately. Limited to your remaining daily allowance.
                  </p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-4 rounded-md border-2 cursor-pointer transition-colors ${
                !useDailyLimit
                  ? 'border-primary-500 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-900/20'
                  : 'border-dark-300 dark:border-dark-600 hover:border-dark-400 dark:hover:border-dark-500'
              }`}>
                <input
                  type="radio"
                  name="txMode"
                  checked={!useDailyLimit}
                  onChange={() => setUseDailyLimit(false)}
                  className="mt-1 accent-primary-500"
                />
                <div>
                  <span className="text-lg font-semibold text-dark-700 dark:text-dark-200">Propose Transaction</span>
                  <p className="text-sm text-dark-500 dark:text-dark-400 mt-1">
                    Submit for multisig approval. Requires the configured number of owner confirmations before execution.
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Transaction Summary */}
        <div className="mb-8 bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600">
          <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-4">Transaction Summary</h3>
          <div className="space-y-3 text-lg">
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Type:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">
                {!data || data === '0x' ? 'Simple Transfer' : 'Contract Call'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Recipient:</span>
              <span className="text-primary-600 dark:text-primary-300 font-mono truncate max-w-xs text-right">
                {to || '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Amount:</span>
              <span className="text-dark-700 dark:text-dark-200 font-semibold">{value || '0'} <span className="text-primary-600 dark:text-primary-400">QUAI</span></span>
            </div>
            {isWhitelisted === true && (
              <div className="flex justify-between items-center pt-2 border-t border-dark-300 dark:border-dark-600">
                <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Status:</span>
                <span className="text-primary-600 dark:text-primary-400 font-semibold inline-flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Whitelisted {whitelistLimit !== null && whitelistLimit > 0n && `(Limit: ${transactionBuilderService.formatValue(whitelistLimit)} QUAI)`}
                </span>
              </div>
            )}
            {dailyLimitInfo && dailyLimitInfo.limit > 0n && !isWhitelisted && effectiveDailyLimit && (
              <div className="flex justify-between items-center pt-2 border-t border-dark-300 dark:border-dark-600">
                <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Daily Limit:</span>
                <span className={`font-semibold inline-flex items-center gap-2 ${
                  exceedsDailyLimit
                    ? 'text-primary-600 dark:text-primary-400'
                    : canUseDailyLimit === true
                    ? 'text-yellow-400'
                    : 'text-dark-500 dark:text-dark-400'
                }`}>
                  {remainingDailyLimit !== null ? (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        {exceedsDailyLimit ? (
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        ) : (
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        )}
                      </svg>
                      {dailyLimitText}
                    </>
                  ) : (
                    'Loading...'
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="mb-8 bg-gradient-to-r from-primary-900/90 via-primary-800/90 to-primary-900/90 border-l-4 border-primary-600 rounded-md p-4 shadow-red-glow">
            <h4 className="text-lg font-semibold text-primary-200 mb-3 flex items-center gap-4">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Please fix the following errors:
            </h4>
            <ul className="list-disc list-inside text-lg text-primary-200 space-y-1">
              {errors.map((error, index) => (
                <li key={index} className="font-medium">{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Submit Button */}
        <div className="vault-divider pt-6 mt-8">
          <div className="flex flex-wrap gap-4">
            <button
              type="submit"
              className="btn-primary flex-1 min-w-[200px]"
            >
              <span className="flex items-center justify-center gap-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {isWhitelisted === true
                  ? 'Execute Transaction'
                  : effectiveDailyLimit
                  ? 'Execute Transaction (Daily Limit)'
                  : 'Propose Transaction'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`/wallet/${walletAddress}`)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>

      {/* Transaction Preview Modal */}
      <Modal
        isOpen={showPreview}
        onClose={handlePreviewCancel}
        title="Review Transaction"
        size="lg"
      >
        <TransactionPreview
          to={to}
          value={value}
          data={data}
          walletAddress={walletAddress}
          onConfirm={handlePreviewConfirm}
          onCancel={handlePreviewCancel}
          isWhitelisted={isWhitelisted === true}
          canUseDailyLimit={effectiveDailyLimit}
        />
      </Modal>

      {/* Transaction Flow Modal */}
      <Modal
        isOpen={showFlow}
        onClose={handleCancel}
        title={
          isWhitelisted === true
            ? "Execute Transaction"
            : effectiveDailyLimit
            ? "Execute Transaction (Daily Limit)"
            : "Propose Transaction"
        }
        size="lg"
      >
        <div className="space-y-4">
          {/* Transaction Summary */}
          <div className="bg-dark-100 dark:bg-vault-dark-4 rounded-md p-5 border border-dark-300 dark:border-dark-600">
            <h3 className="text-base font-mono text-dark-500 uppercase tracking-wider mb-4">Transaction Details</h3>
            <div className="space-y-3 text-lg">
              <div className="flex justify-between items-center">
                <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Type:</span>
                <span className="text-dark-700 dark:text-dark-200 font-semibold">
                  {!data || data === '0x' ? 'Simple Transfer' : 'Contract Call'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Recipient:</span>
                <span className="text-primary-600 dark:text-primary-300 font-mono break-all text-right max-w-xs">
                  {to || '-'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Amount:</span>
                <span className="text-dark-700 dark:text-dark-200 font-semibold">{value || '0'} <span className="text-primary-600 dark:text-primary-400">QUAI</span></span>
              </div>
              {isWhitelisted === true && (
                <div className="flex justify-between items-center pt-2 border-t border-dark-300 dark:border-dark-600">
                  <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Status:</span>
                  <span className="text-primary-600 dark:text-primary-400 font-semibold inline-flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Whitelisted - Executes immediately (no approvals needed)
                  </span>
                </div>
              )}
              {effectiveDailyLimit && (
                <div className="flex justify-between items-center pt-2 border-t border-dark-300 dark:border-dark-600">
                  <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Status:</span>
                  <span className="text-yellow-400 font-semibold inline-flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    Daily Limit - Bypasses approvals, executes immediately
                  </span>
                </div>
              )}
              {data && data !== '0x' && (
                <div className="flex justify-between items-start">
                  <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Data:</span>
                  <span className="text-dark-500 dark:text-dark-400 font-mono text-base break-all text-right max-w-xs">
                    {data.length > 20 ? `${data.slice(0, 20)}...` : data}
                  </span>
                </div>
              )}
            </div>
          </div>

          <TransactionFlow
            title={
              isWhitelisted === true
                ? "Execute Transaction"
                : effectiveDailyLimit
                ? "Execute Transaction (Daily Limit)"
                : "Propose Transaction"
            }
            description={
              isWhitelisted === true
                ? `Executing transaction to whitelisted address ${to.substring(0, 10)}... (no approvals needed)`
                : effectiveDailyLimit
                ? `Executing within daily limit to ${to.substring(0, 10)}... (bypasses approvals)`
                : `Proposing transaction to ${to.substring(0, 10)}...`
            }
            onExecute={handleProposeTransaction}
            onComplete={handleComplete}
            onCancel={handleCancel}
            successMessage={
              isWhitelisted === true
                ? "Transaction executed successfully!"
                : effectiveDailyLimit
                ? "Transaction executed successfully!"
                : "Transaction proposed successfully!"
            }
            resetKey={resetKey}
          />
        </div>
      </Modal>
    </div>
  );
}
