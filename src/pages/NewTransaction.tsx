import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useMultisig } from '../hooks/useMultisig';
import { useWallet } from '../hooks/useWallet';
import { useTokenBalances } from '../hooks/useTokenBalances';
import { useNftHoldings } from '../hooks/useNftHoldings';
import { useErc1155Holdings } from '../hooks/useErc1155Holdings';
import { transactionBuilderService } from '../services/TransactionBuilderService';
import { getNftOwner } from '../services/utils/ContractMetadataService';
import { getERC1155Balance } from '../services/utils/TokenBalanceService';
import { Modal } from '../components/Modal';
import { TransactionFlow } from '../components/TransactionFlow';
import { TransactionPreview } from '../components/TransactionPreview';
import { ContractInteractionBuilder } from '../components/ContractInteractionBuilder';
import { TransactionModeSelector } from '../components/transaction/TransactionModeSelector';
import { SendTokenForm } from '../components/transaction/SendTokenForm';
import { SendNftForm } from '../components/transaction/SendNftForm';
import { TransactionSummaryPanel } from '../components/transaction/TransactionSummaryPanel';
import { useContractInteraction } from '../hooks/useContractInteraction';
import { isQuaiAddress, isHexString, isAddress } from 'quais';
import { TIMING } from '../config/contracts';
import { SendErc1155Form } from '../components/transaction/SendErc1155Form';
import { SignMessageForm } from '../components/transaction/SignMessageForm';
import { AdvancedOptions } from '../components/transaction/AdvancedOptions';
import { expirationToTimestamp, delayToSeconds } from '../utils/timeConversions';
import type { DelayUnit } from '../utils/timeConversions';
import type { TransactionMode, SendTokenMeta, SendNftMeta, SendErc1155Meta } from '../types';

const VALID_MODES: TransactionMode[] = ['send-quai', 'send-token', 'send-nft', 'send-erc1155', 'contract-call', 'sign-message'];

export function NewTransaction() {
  const { address: walletAddress } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { address: connectedAddress } = useWallet();
  const { proposeTransactionAsync, walletInfo } = useMultisig(walletAddress);

  // Token/NFT data for mode selector and forms (React Query deduplicates with WalletDetail)
  const { erc20Balances } = useTokenBalances(walletAddress);
  const { holdings } = useNftHoldings(walletAddress);
  const { holdings: erc1155Holdings } = useErc1155Holdings(walletAddress);

  const isOwner = useMemo(() =>
    walletInfo?.owners.some(
      (owner) => owner.toLowerCase() === connectedAddress?.toLowerCase()
    ) || false,
    [walletInfo?.owners, connectedAddress]
  );

  // Initialize mode from URL search params (synchronous — no flash)
  const initialMode = useMemo(() => {
    const param = searchParams.get('mode');
    return param && VALID_MODES.includes(param as TransactionMode) ? param as TransactionMode : 'send-quai';
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — only read on mount

  const [mode, setMode] = useState<TransactionMode>(initialMode);
  const [tokenMeta, setTokenMeta] = useState<SendTokenMeta | null>(null);
  const [nftMeta, setNftMeta] = useState<SendNftMeta | null>(null);
  const [tokenRecipient, setTokenRecipient] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const [nftRecipient, setNftRecipient] = useState('');
  const [erc1155Meta, setErc1155Meta] = useState<SendErc1155Meta | null>(null);
  const [erc1155Recipient, setErc1155Recipient] = useState('');
  const [erc1155Quantity, setErc1155Quantity] = useState('');

  const [to, setTo] = useState('');
  const [value, setValue] = useState('');
  const [data, setData] = useState('0x');
  const [errors, setErrors] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [expiration, setExpiration] = useState<string>(''); // datetime-local string
  const [executionDelay, setExecutionDelay] = useState<string>(''); // numeric value in current unit
  const [delayUnit, setDelayUnit] = useState<DelayUnit>('minutes');
  const [assetValidationWarning, setAssetValidationWarning] = useState<string | null>(null);
  const [signAction, setSignAction] = useState<'sign' | 'unsign'>('sign');
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Deep-link pre-selection props
  const initialToken = useMemo(() => {
    const token = searchParams.get('token');
    return token && isAddress(token) ? token : undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const initialTokenId = useMemo(() => searchParams.get('tokenId') ?? undefined, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mode change handler — resets all form state
  const handleModeChange = useCallback((newMode: TransactionMode) => {
    setMode(newMode);
    setTo('');
    setValue('');
    setData('0x');
    setErrors([]);
    setTokenMeta(null);
    setNftMeta(null);
    setTokenRecipient('');
    setTokenAmount('');
    setNftRecipient('');
    setErc1155Meta(null);
    setErc1155Recipient('');
    setErc1155Quantity('');
    setExpiration('');
    setExecutionDelay('');
    setDelayUnit('minutes');
    setAssetValidationWarning(null);
  }, []);

  // Switch to contract-call mode while preserving the `to` address
  const switchToContractCall = useCallback(() => {
    setMode('contract-call');
    setValue('');
    setData('0x');
    setErrors([]);
    setTokenMeta(null);
    setNftMeta(null);
    setTokenRecipient('');
    setTokenAmount('');
    setNftRecipient('');
    setErc1155Meta(null);
    setErc1155Recipient('');
    setErc1155Quantity('');
    setExpiration('');
    setExecutionDelay('');
    setDelayUnit('minutes');
    setAssetValidationWarning(null);
    setSignAction('sign');
  }, []);

  // Contract detection and ABI fetching
  const {
    isContract: isRecipientContract,
    isDetecting: isDetectingContract,
    detectError: detectContractError,
    abi: contractAbi,
    abiSource,
    isFetchingAbi,
    abiFetchError,
    functions: contractFunctions,
    contractType,
    tokenMetadata,
    setManualAbi,
  } = useContractInteraction(isAddress(to) ? to : undefined);

  // Clean up navigate timeout on unmount
  useEffect(() => {
    return () => {
      if (navigateTimeoutRef.current) clearTimeout(navigateTimeoutRef.current);
    };
  }, []);

  // Mode-aware subtitle
  const headerSubtitle = useMemo(() => {
    switch (mode) {
      case 'send-quai': return 'Propose a new QUAI transfer';
      case 'send-token': return 'Send ERC-20 tokens from this vault';
      case 'send-nft': return 'Transfer an NFT from this vault';
      case 'send-erc1155': return 'Send ERC1155 tokens from this vault';
      case 'contract-call': return 'Interact with a smart contract';
      case 'sign-message': return 'Sign or unsign a message on behalf of this vault (EIP-1271)';
    }
  }, [mode]);

  // Mode-aware submit button text
  const submitButtonText = useMemo(() => {
    switch (mode) {
      case 'send-quai': return 'Propose Transaction';
      case 'send-token': return 'Propose Token Transfer';
      case 'send-nft': return 'Propose NFT Transfer';
      case 'send-erc1155': return 'Propose ERC1155 Transfer';
      case 'contract-call': return 'Propose Transaction';
      case 'sign-message': return signAction === 'unsign' ? 'Propose Message Unsigning' : 'Propose Message Signing';
    }
  }, [mode, signAction]);

  // Pre-compute whether value exceeds vault balance (avoids parseValue in render path)
  const exceedsBalance = useMemo(() => {
    if (!walletInfo || !value.trim()) return false;
    try {
      return transactionBuilderService.parseValue(value) > BigInt(walletInfo.balance);
    } catch {
      return false;
    }
  }, [value, walletInfo]);

  const handleValidationChange = useCallback((validation: { warning: string | null; isBlocking: boolean }) => {
    setAssetValidationWarning(validation.isBlocking ? validation.warning : null);
  }, []);

  const validateForm = async (): Promise<boolean> => {
    const newErrors: string[] = [];

    if (mode === 'send-token') {
      // Token send validation
      if (!tokenMeta) newErrors.push('Please select a token');
      if (!tokenRecipient.trim()) {
        newErrors.push('Recipient address is required');
      } else if (!isQuaiAddress(tokenRecipient)) {
        newErrors.push('Invalid recipient address');
      }
      if (!tokenAmount.trim()) newErrors.push('Token amount is required');
      if (data === '0x') newErrors.push('Token transfer encoding failed — check amount format');
    } else if (mode === 'send-nft') {
      // NFT send validation
      if (!nftMeta) newErrors.push('Please select an NFT');
      if (!nftRecipient.trim()) {
        newErrors.push('Recipient address is required');
      } else if (!isQuaiAddress(nftRecipient)) {
        newErrors.push('Invalid recipient address');
      }
      if (data === '0x') newErrors.push('NFT transfer encoding failed');
      // Re-verify on-chain ownership as safety net
      if (nftMeta && walletAddress) {
        try {
          const owner = await getNftOwner(nftMeta.tokenAddress, nftMeta.tokenId);
          if (!owner || owner.toLowerCase() !== walletAddress.toLowerCase()) {
            newErrors.push(`Vault no longer owns NFT #${nftMeta.tokenId}`);
          }
        } catch {
          newErrors.push('Could not verify NFT ownership');
        }
      }
    } else if (mode === 'send-erc1155') {
      // ERC1155 send validation
      if (!erc1155Meta) newErrors.push('Please select a token');
      if (!erc1155Recipient.trim()) {
        newErrors.push('Recipient address is required');
      } else if (!isQuaiAddress(erc1155Recipient)) {
        newErrors.push('Invalid recipient address');
      }
      if (data === '0x') newErrors.push('ERC1155 transfer encoding failed');
      // Re-verify on-chain balance
      if (erc1155Meta && walletAddress) {
        try {
          const balance = await getERC1155Balance(walletAddress, erc1155Meta.tokenAddress, erc1155Meta.tokenId);
          const requested = BigInt(erc1155Quantity || '0');
          if (balance < requested) {
            newErrors.push(`Vault balance (${balance}) is less than requested quantity (${requested})`);
          }
        } catch {
          newErrors.push('Could not verify ERC1155 balance');
        }
      }
    } else if (mode === 'sign-message') {
      // Sign-message validation: self-call with encoded data
      if (to.toLowerCase() !== walletAddress.toLowerCase()) {
        newErrors.push('Message signing must target this vault (self-call)');
      }
      if (data === '0x') {
        newErrors.push('Please enter a message to sign');
      }
    } else {
      // send-quai and contract-call validation (existing logic)
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
        } catch {
          newErrors.push('Invalid value format');
        }
      }

      if (data && data !== '0x') {
        if (!isHexString(data)) {
          newErrors.push('Invalid data format (must be hex string)');
        }
      }

      // Check asset validation (ERC20 balance / ERC721 ownership) for contract-call mode
      if (assetValidationWarning) {
        newErrors.push(assetValidationWarning);
      }
    }

    // Cross-cutting: ensure expiration doesn't conflict with execution delay.
    // The contract adds the user's requested delay ON TOP of the vault's minExecutionDelay.
    const userDelay = delayToSeconds(executionDelay, delayUnit) ?? 0;
    const vaultMinDelay = walletInfo?.minExecutionDelay ?? 0;
    const effectiveDelay = vaultMinDelay + userDelay;
    const expirationTs = expirationToTimestamp(expiration);

    if (expirationTs && effectiveDelay > 0) {
      const now = Math.floor(Date.now() / 1000);
      const earliestExecutable = now + effectiveDelay;
      if (expirationTs <= earliestExecutable) {
        newErrors.push(
          'Expiration must be after the execution delay elapses — the transaction would expire before it could be executed'
        );
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

    const expirationTimestamp = expirationToTimestamp(expiration);
    const delaySeconds = delayToSeconds(executionDelay, delayUnit);

    onProgress({ step: 'signing', message: 'Please approve the transaction proposal in your wallet' });

    const txHash = await proposeTransactionAsync({
      walletAddress,
      to: normalizedTo,
      value: parsedValue,
      data: normalizedData,
      expiration: expirationTimestamp,
      executionDelay: delaySeconds,
    }) || '';

    onProgress({ step: 'waiting', txHash, message: 'Waiting for transaction confirmation...' });

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
          {headerSubtitle}
        </p>
      </div>

      {/* Transaction Mode Selector */}
      <TransactionModeSelector
        mode={mode}
        onModeChange={handleModeChange}
        hasTokens={(erc20Balances?.length ?? 0) > 0}
        hasNfts={(holdings?.length ?? 0) > 0}
        hasErc1155s={(erc1155Holdings?.length ?? 0) > 0}
      />

      <form onSubmit={handleSubmit} className="vault-panel p-8">
        {/* Send QUAI mode */}
        {(mode === 'send-quai') && (
          <>
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
              {isRecipientContract === true && (
                <div className="mt-3 bg-blue-900/30 border border-blue-700 rounded-md p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-blue-200 font-mono">This address is a smart contract.</p>
                  </div>
                  <button
                    type="button"
                    onClick={switchToContractCall}
                    className="shrink-0 px-4 py-1.5 rounded-md border border-blue-600 bg-blue-600/20 text-sm font-mono text-blue-200 hover:bg-blue-600/40 transition-colors cursor-pointer"
                  >
                    Switch to Contract Call
                  </button>
                </div>
              )}
            </div>
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
                  }`}>{`${transactionBuilderService.formatValue(BigInt(walletInfo.balance))} QUAI`}</span>
                </p>
              )}
            </div>
            <AdvancedOptions
              expiration={expiration}
              onExpirationChange={setExpiration}
              executionDelay={executionDelay}
              onExecutionDelayChange={setExecutionDelay}
              delayUnit={delayUnit}
              onDelayUnitChange={setDelayUnit}
              minExecutionDelay={walletInfo?.minExecutionDelay}
              showData
              data={data}
              onDataChange={setData}
            />
          </>
        )}

        {/* Send Token mode */}
        {mode === 'send-token' && walletAddress && (
          <SendTokenForm
            walletAddress={walletAddress}
            onToChange={setTo}
            onValueChange={setValue}
            onDataChange={setData}
            onTokenMetadataChange={setTokenMeta}
            onRecipientChange={setTokenRecipient}
            onAmountChange={setTokenAmount}
            initialToken={initialToken}
          />
        )}

        {/* Send NFT mode */}
        {mode === 'send-nft' && walletAddress && (
          <SendNftForm
            walletAddress={walletAddress}
            onToChange={setTo}
            onValueChange={setValue}
            onDataChange={setData}
            onNftMetadataChange={setNftMeta}
            onRecipientChange={setNftRecipient}
            initialToken={initialToken}
            initialTokenId={initialTokenId}
          />
        )}

        {/* Send ERC1155 mode */}
        {mode === 'send-erc1155' && walletAddress && (
          <SendErc1155Form
            walletAddress={walletAddress}
            onToChange={setTo}
            onValueChange={setValue}
            onDataChange={setData}
            onErc1155MetadataChange={setErc1155Meta}
            onRecipientChange={setErc1155Recipient}
            onQuantityChange={setErc1155Quantity}
            initialToken={initialToken}
            initialTokenId={initialTokenId}
          />
        )}

        {/* Sign Message mode */}
        {mode === 'sign-message' && walletAddress && (
          <SignMessageForm
            walletAddress={walletAddress}
            onToChange={setTo}
            onValueChange={setValue}
            onDataChange={setData}
            onActionChange={setSignAction}
          />
        )}

        {/* Contract Call mode */}
        {mode === 'contract-call' && (
          <>
            <div className="mb-8">
              <label htmlFor="to" className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
                Contract Address
              </label>
              <input
                id="to"
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="0x..."
                className="input-field w-full"
              />
              {isAddress(to) && (
                isDetectingContract ? (
                  <p className="mt-2 text-sm font-mono text-dark-400 flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Detecting...
                  </p>
                ) : isRecipientContract ? (
                  <p className={`mt-2 text-sm font-mono flex items-center gap-2 ${
                    contractType === 'erc20' ? 'text-blue-600 dark:text-blue-400'
                      : contractType === 'erc721' ? 'text-purple-600 dark:text-purple-400'
                      : contractType === 'erc1155' ? 'text-violet-600 dark:text-violet-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    {contractType === 'erc20'
                      ? `ERC-20 Token${tokenMetadata?.symbol ? ` (${tokenMetadata.symbol})` : ''}`
                      : contractType === 'erc721'
                      ? 'ERC-721 NFT Contract'
                      : contractType === 'erc1155'
                      ? 'ERC-1155 Multi-Token Contract'
                      : 'Smart Contract Detected'}
                  </p>
                ) : detectContractError ? (
                  <p className="mt-2 text-sm font-mono text-red-500 flex items-center gap-2">
                    Detection failed — check console for details
                  </p>
                ) : null
              )}
            </div>
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
              {walletInfo && (
                <p className="mt-1 text-base font-mono text-dark-500 dark:text-dark-400">
                  Vault balance: <span className={`font-semibold ${
                    exceedsBalance ? 'text-red-600 dark:text-red-400' : 'text-primary-600 dark:text-primary-400'
                  }`}>{`${transactionBuilderService.formatValue(BigInt(walletInfo.balance))} QUAI`}</span>
                </p>
              )}
            </div>
            {isRecipientContract === true ? (
              <ContractInteractionBuilder
                abi={contractAbi}
                abiSource={abiSource}
                isFetchingAbi={isFetchingAbi}
                abiFetchError={abiFetchError}
                functions={contractFunctions}
                contractType={contractType}
                tokenMetadata={tokenMetadata}
                onDataChange={setData}
                onValueChange={setValue}
                currentValue={value}
                setManualAbi={setManualAbi}
                walletAddress={walletAddress}
                contractAddress={to}
                onValidationChange={handleValidationChange}
              />
            ) : (
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
              </div>
            )}
          </>
        )}

        {/* Advanced Options — hidden for send-quai (has its own inline section) and sign-message (self-calls bypass delay) */}
        {mode !== 'send-quai' && mode !== 'sign-message' && (
          <AdvancedOptions
            expiration={expiration}
            onExpirationChange={setExpiration}
            executionDelay={executionDelay}
            onExecutionDelayChange={setExecutionDelay}
            delayUnit={delayUnit}
            onDelayUnitChange={setDelayUnit}
            minExecutionDelay={walletInfo?.minExecutionDelay}
          />
        )}

        {/* Transaction Summary */}
        <TransactionSummaryPanel
          mode={mode}
          to={to}
          value={value}
          data={data}
          tokenMeta={tokenMeta}
          tokenRecipient={tokenRecipient}
          tokenAmount={tokenAmount}
          nftMeta={nftMeta}
          nftRecipient={nftRecipient}
          erc1155Meta={erc1155Meta}
          erc1155Recipient={erc1155Recipient}
          erc1155Quantity={erc1155Quantity}
        />

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
                {submitButtonText}
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
          contractAbi={contractAbi}
          tokenMetadata={tokenMetadata}
          onConfirm={handlePreviewConfirm}
          onCancel={handlePreviewCancel}
          transactionMode={mode}
          sendTokenMeta={tokenMeta}
          sendNftMeta={nftMeta}
          sendErc1155Meta={erc1155Meta}
          tokenRecipient={tokenRecipient}
          tokenAmount={tokenAmount}
          nftRecipient={nftRecipient}
          erc1155Recipient={erc1155Recipient}
          erc1155Quantity={erc1155Quantity}
          expiration={expirationToTimestamp(expiration)}
          executionDelay={delayToSeconds(executionDelay, delayUnit)}
          minExecutionDelay={walletInfo?.minExecutionDelay}
        />
      </Modal>

      {/* Transaction Flow Modal */}
      <Modal
        isOpen={showFlow}
        onClose={handleCancel}
        title={submitButtonText}
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
                  {mode === 'send-token' ? 'Token Transfer'
                    : mode === 'send-nft' ? 'NFT Transfer'
                    : mode === 'send-erc1155' ? 'ERC1155 Transfer'
                    : mode === 'sign-message' ? 'Message Signing'
                    : !data || data === '0x' ? 'Simple Transfer' : 'Contract Call'}
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
                    <span className="text-primary-600 dark:text-primary-300 font-mono break-all text-right max-w-xs">
                      {tokenRecipient || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Amount:</span>
                    <span className="text-dark-700 dark:text-dark-200 font-semibold">
                      {tokenAmount || '0'} <span className="text-primary-600 dark:text-primary-400">{tokenMeta.symbol}</span>
                    </span>
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
                    <span className="text-primary-600 dark:text-primary-300 font-mono break-all text-right max-w-xs">
                      {nftRecipient || '-'}
                    </span>
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
                    <span className="text-primary-600 dark:text-primary-300 font-mono break-all text-right max-w-xs">
                      {erc1155Recipient || '-'}
                    </span>
                  </div>
                </>
              ) : mode === 'sign-message' ? (
                <div className="flex justify-between items-center">
                  <span className="text-base font-mono text-dark-500 uppercase tracking-wider">Target:</span>
                  <span className="text-dark-700 dark:text-dark-200 font-semibold">Self-call (this vault)</span>
                </div>
              ) : (
                <>
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
                </>
              )}

              {data && data !== '0x' && mode !== 'send-token' && mode !== 'send-nft' && mode !== 'send-erc1155' && mode !== 'sign-message' && (
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
            title={submitButtonText}
            description={
              mode === 'send-token' && tokenMeta
                ? `Proposing ${tokenMeta.symbol} transfer to ${tokenRecipient.substring(0, 10)}...`
                : mode === 'send-nft' && nftMeta
                ? `Proposing NFT #${nftMeta.tokenId} transfer to ${nftRecipient.substring(0, 10)}...`
                : mode === 'send-erc1155' && erc1155Meta
                ? `Proposing ERC1155 #${erc1155Meta.tokenId} (x${erc1155Quantity}) transfer to ${erc1155Recipient.substring(0, 10)}...`
                : mode === 'sign-message'
                ? 'Proposing message signing operation...'
                : `Proposing transaction to ${to.substring(0, 10)}...`
            }
            onExecute={handleProposeTransaction}
            onComplete={handleComplete}
            onCancel={handleCancel}
            successMessage="Transaction proposed successfully!"
            resetKey={resetKey}
          />
        </div>
      </Modal>
    </div>
  );
}
