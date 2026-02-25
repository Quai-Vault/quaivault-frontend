import { useState, useEffect, useCallback, useMemo } from 'react';
import { Interface, isQuaiAddress, parseUnits } from 'quais';
import type { FunctionInfo, FunctionInputInfo } from '../hooks/useContractInteraction';
import type { ContractType, TokenMetadata } from '../services/utils/ContractMetadataService';
import { useAssetValidation } from '../hooks/useAssetValidation';

interface ContractInteractionBuilderProps {
  abi: any[] | null;
  abiSource: string | null;
  isFetchingAbi: boolean;
  abiFetchError: string | null;
  functions: FunctionInfo[];
  contractType: ContractType;
  tokenMetadata: TokenMetadata | null;
  onDataChange: (data: string) => void;
  onValueChange: (value: string) => void;
  currentValue: string;
  setManualAbi: (abi: any[]) => { success: boolean; error?: string };
  walletAddress?: string;
  contractAddress?: string;
  onValidationChange?: (validation: { warning: string | null; isBlocking: boolean }) => void;
}

// Common ERC20 actions with friendly labels
const ERC20_ACTIONS: Record<string, { label: string; description: string }> = {
  transfer: { label: 'Send Tokens', description: 'Transfer tokens to an address' },
  approve: { label: 'Approve Spender', description: 'Allow an address to spend tokens on your behalf' },
  transferFrom: { label: 'Transfer From', description: 'Transfer tokens from one address to another (requires approval)' },
  permit: { label: 'Permit (Gasless Approve)', description: 'Approve a spender using an off-chain signature (EIP-2612)' },
};

// Common ERC721 actions with friendly labels
const ERC721_ACTIONS: Record<string, { label: string; description: string }> = {
  transferFrom: { label: 'Transfer NFT', description: 'Transfer an NFT to another address' },
  safeTransferFrom: { label: 'Safe Transfer NFT', description: 'Safely transfer an NFT (checks receiver support)' },
  approve: { label: 'Approve', description: 'Approve an address to transfer a specific NFT' },
  setApprovalForAll: { label: 'Approve All', description: 'Approve an address to manage all your NFTs' },
};

/**
 * Detect whether a specific input is a token amount field that should
 * accept human-readable values (e.g. "1.5" tokens → wei).
 */
function isTokenAmountField(
  input: FunctionInputInfo,
  index: number,
  contractType: ContractType,
  functionName: string,
): boolean {
  if (contractType !== 'erc20') return false;
  if (!input.baseType.startsWith('uint') && !input.baseType.startsWith('int')) return false;
  // Match by param name
  if (input.name === 'amount' || input.name === 'value' || input.name === '_value' || input.name === '_amount') return true;
  // Match by position in known functions
  if (functionName === 'transfer' && index === 1) return true;
  if (functionName === 'approve' && index === 1) return true;
  if (functionName === 'transferFrom' && index === 2) return true;
  return false;
}

export function ContractInteractionBuilder({
  abi,
  abiSource,
  isFetchingAbi,
  abiFetchError,
  functions,
  contractType,
  tokenMetadata,
  onDataChange,
  onValueChange,
  currentValue,
  setManualAbi,
  walletAddress,
  contractAddress,
  onValidationChange,
}: ContractInteractionBuilderProps) {
  const [selectedFunctionIndex, setSelectedFunctionIndex] = useState<number>(-1);
  const [argValues, setArgValues] = useState<Record<number, string>>({});
  const [encodingError, setEncodingError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showRawData, setShowRawData] = useState(false);
  const [rawData, setRawData] = useState('0x');
  const [showPasteAbi, setShowPasteAbi] = useState(false);
  const [pasteAbiText, setPasteAbiText] = useState('');
  const [pasteAbiError, setPasteAbiError] = useState<string | null>(null);

  const selectedFunction = selectedFunctionIndex >= 0 ? functions[selectedFunctionIndex] : null;

  // Sort functions: common token actions first for ERC20/ERC721, all shown
  const sortedFunctions = useMemo(() => {
    if (contractType === 'generic') return functions;
    const actionMap = contractType === 'erc20' ? ERC20_ACTIONS : ERC721_ACTIONS;
    const common: FunctionInfo[] = [];
    const other: FunctionInfo[] = [];
    for (const fn of functions) {
      if (actionMap[fn.name]) {
        common.push(fn);
      } else {
        other.push(fn);
      }
    }
    return [...common, ...other];
  }, [functions, contractType]);

  const commonCount = useMemo(() => {
    if (contractType === 'generic') return 0;
    const actionMap = contractType === 'erc20' ? ERC20_ACTIONS : ERC721_ACTIONS;
    return sortedFunctions.filter((fn) => actionMap[fn.name]).length;
  }, [sortedFunctions, contractType]);

  // Check if all required inputs have values
  const allInputsFilled = useMemo(() => {
    if (!selectedFunction) return false;
    return selectedFunction.inputs.every((_, i) => {
      const val = argValues[i];
      return val !== undefined && val !== '';
    });
  }, [selectedFunction, argValues]);

  // Encode calldata when function or args change — only when all inputs are filled
  const encodeCalldata = useCallback(() => {
    if (!abi || !selectedFunction) {
      onDataChange('0x');
      return;
    }

    // Don't attempt encoding until all fields have values
    if (!allInputsFilled) {
      setEncodingError(null);
      return;
    }

    try {
      const iface = new Interface(abi);
      const values = selectedFunction.inputs.map((input, i) => {
        const raw = argValues[i] ?? '';
        // Convert human-readable token amounts to wei
        if (isTokenAmountField(input, i, contractType, selectedFunction.name) && tokenMetadata?.decimals != null) {
          try {
            return parseUnits(raw, tokenMetadata.decimals).toString();
          } catch {
            // If parseUnits fails, pass raw (will likely cause encoding error)
            return raw;
          }
        }
        return coerceValue(raw, input);
      });
      const encoded = iface.encodeFunctionData(selectedFunction.name, values);
      onDataChange(encoded);
      setRawData(encoded);
      setEncodingError(null);
    } catch (e) {
      setEncodingError(e instanceof Error ? e.message : 'Encoding error');
    }
  }, [abi, selectedFunction, argValues, allInputsFilled, onDataChange, contractType, tokenMetadata]);

  useEffect(() => {
    if (selectedFunction) {
      encodeCalldata();
    }
  }, [encodeCalldata, selectedFunction]);

  // Force value to '0' for nonpayable functions (including when value is empty)
  useEffect(() => {
    if (selectedFunction && !selectedFunction.payable && currentValue !== '0') {
      onValueChange('0');
    }
  }, [selectedFunction, currentValue, onValueChange]);

  // Asset validation (ERC20 balance / ERC721 ownership)
  const {
    erc20BalanceFormatted,
    isLoadingBalance,
    insufficientBalance,
    nftOwner,
    isLoadingNftOwner,
    vaultOwnsNft,
    validationWarning,
  } = useAssetValidation(contractAddress, walletAddress, contractType, tokenMetadata, selectedFunction?.name ?? null, argValues);

  // Notify parent of validation state changes
  useEffect(() => {
    onValidationChange?.({
      warning: validationWarning,
      isBlocking: insufficientBalance || vaultOwnsNft === false,
    });
  }, [validationWarning, insufficientBalance, vaultOwnsNft, onValidationChange]);

  const handleFunctionSelect = (index: number) => {
    setSelectedFunctionIndex(index);
    setArgValues({});
    setEncodingError(null);
    setHasInteracted(false);
    if (index < 0) {
      onDataChange('0x');
      setRawData('0x');
    }
  };

  const handleArgChange = (index: number, value: string) => {
    setHasInteracted(true);
    setArgValues((prev) => ({ ...prev, [index]: value }));
  };

  const handlePasteAbi = () => {
    setPasteAbiError(null);
    try {
      const parsed = JSON.parse(pasteAbiText);
      if (!Array.isArray(parsed)) {
        setPasteAbiError('ABI must be a JSON array');
        return;
      }
      const result = setManualAbi(parsed);
      if (!result.success) {
        setPasteAbiError(result.error ?? 'Invalid ABI');
        return;
      }
      setShowPasteAbi(false);
      setPasteAbiText('');
    } catch {
      setPasteAbiError('Invalid JSON');
    }
  };

  const handleRawDataChange = (value: string) => {
    setRawData(value);
    onDataChange(value);
    setSelectedFunctionIndex(-1);
    setArgValues({});
  };

  // Loading state
  if (isFetchingAbi) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3 text-dark-500 dark:text-dark-400">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-base font-mono">Fetching contract ABI...</span>
        </div>
      </div>
    );
  }

  // ABI unavailable
  if (!abi || functions.length === 0) {
    return (
      <div className="mb-8">
        <p className="text-base font-mono text-dark-500 mb-3">
          {abiFetchError
            ? `Could not fetch ABI: ${abiFetchError}`
            : abi && functions.length === 0
            ? 'No writable functions found in contract ABI'
            : 'Could not fetch ABI for this contract'}
        </p>

        {!showPasteAbi ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowPasteAbi(true)}
              className="text-sm font-mono text-primary-600 dark:text-primary-400 hover:text-primary-500 underline"
            >
              Paste ABI
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={pasteAbiText}
              onChange={(e) => setPasteAbiText(e.target.value)}
              placeholder='[{"type":"function","name":"...","inputs":[...]}]'
              rows={6}
              className="input-field w-full font-mono text-sm"
            />
            {pasteAbiError && (
              <p className="text-sm text-red-600 dark:text-red-400">{pasteAbiError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handlePasteAbi}
                className="text-sm font-mono bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-500"
              >
                Load ABI
              </button>
              <button
                type="button"
                onClick={() => { setShowPasteAbi(false); setPasteAbiError(null); }}
                className="text-sm font-mono text-dark-500 hover:text-dark-700 dark:hover:text-dark-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Raw data fallback */}
        <div className="mt-4">
          <label htmlFor="data" className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
            Data (Optional)
          </label>
          <textarea
            id="data"
            value={rawData}
            onChange={(e) => handleRawDataChange(e.target.value)}
            placeholder="0x"
            rows={4}
            className="input-field w-full font-mono text-lg"
          />
        </div>
      </div>
    );
  }

  const actionMap = contractType === 'erc20' ? ERC20_ACTIONS : contractType === 'erc721' ? ERC721_ACTIONS : null;

  // ABI available — show function picker
  return (
    <div className="mb-8">
      {/* Contract type + source badges */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {contractType !== 'generic' && (
          <span className={`text-xs font-mono px-2 py-1 rounded-full ${
            contractType === 'erc20'
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
          }`}>
            {contractType === 'erc20' ? 'ERC-20 Token' : 'ERC-721 NFT'}
          </span>
        )}
        {contractType === 'erc20' && tokenMetadata?.symbol && (
          <span className="text-xs font-mono px-2 py-1 rounded-full bg-dark-100 dark:bg-dark-700 text-dark-600 dark:text-dark-300">
            {tokenMetadata.name ? `${tokenMetadata.name} (${tokenMetadata.symbol})` : tokenMetadata.symbol}
          </span>
        )}
        <span className="text-xs font-mono px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
          {abiSource === 'ipfs' ? 'ABI from IPFS'
            : abiSource === 'explorer' ? 'ABI from Explorer'
            : 'Known Contract'}
        </span>
      </div>

      {/* Function selector — all functions shown, common ones first with friendly names */}
      <label className="block text-base font-mono text-dark-500 uppercase tracking-wider mb-3">
        {contractType === 'erc20' ? 'Token Action' : contractType === 'erc721' ? 'NFT Action' : 'Contract Function'}
      </label>
      <select
        value={selectedFunctionIndex}
        onChange={(e) => handleFunctionSelect(Number(e.target.value))}
        className="input-field w-full mb-4"
      >
        <option value={-1}>
          {contractType === 'erc20' ? 'Select a token action...'
            : contractType === 'erc721' ? 'Select an NFT action...'
            : 'Select a function...'}
        </option>
        {sortedFunctions.map((fn, sortedIndex) => {
          const originalIndex = functions.indexOf(fn);
          const action = actionMap?.[fn.name];
          const isCommon = !!action;
          // Insert a visual separator between common and other functions
          const isFirstOther = !isCommon && sortedIndex === commonCount && commonCount > 0;
          return (
            <option
              key={fn.selector}
              value={originalIndex}
              disabled={isFirstOther ? undefined : undefined}
            >
              {isFirstOther ? '── ' : ''}
              {isCommon
                ? `${action.label} — ${fn.name}(${fn.inputs.map((inp) => inp.type).join(', ')})`
                : `${fn.name}(${fn.inputs.map((inp) => inp.type).join(', ')})`}
              {fn.payable ? ' [payable]' : ''}
            </option>
          );
        })}
      </select>

      {/* Action description for token contracts */}
      {selectedFunction && actionMap?.[selectedFunction.name] && (
        <p className="text-sm font-mono text-dark-400 mb-4">
          {actionMap[selectedFunction.name].description}
        </p>
      )}

      {/* ERC20 vault balance badge */}
      {contractType === 'erc20' && selectedFunction && (selectedFunction.name === 'transfer' || selectedFunction.name === 'transferFrom') && (
        <div className="mb-4">
          {isLoadingBalance ? (
            <span className="inline-flex items-center gap-2 text-xs font-mono px-2 py-1 rounded-full bg-dark-100 dark:bg-dark-700 text-dark-500 dark:text-dark-400">
              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Checking vault balance...
            </span>
          ) : erc20BalanceFormatted != null ? (
            <span className={`inline-flex items-center text-xs font-mono px-2 py-1 rounded-full ${
              insufficientBalance
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-dark-100 dark:bg-dark-700 text-dark-600 dark:text-dark-300'
            }`}>
              Vault: {erc20BalanceFormatted} {tokenMetadata?.symbol ?? ''}
            </span>
          ) : null}
        </div>
      )}

      {/* Parameter inputs */}
      {selectedFunction && (
        <div className="space-y-4">
          {selectedFunction.inputs.map((input, i) => (
            <div key={`${selectedFunction.selector}-${i}`}>
              <ParameterInput
                input={input}
                index={i}
                value={argValues[i] ?? ''}
                onChange={handleArgChange}
                contractType={contractType}
                tokenMetadata={tokenMetadata}
                functionName={selectedFunction.name}
              />
              {/* ERC20 insufficient balance warning below amount field */}
              {isTokenAmountField(input, i, contractType, selectedFunction.name) && insufficientBalance && (
                <p className="text-xs text-red-600 dark:text-red-400 font-mono mt-1">
                  Insufficient balance. Vault holds {erc20BalanceFormatted} {tokenMetadata?.symbol ?? 'tokens'}.
                </p>
              )}
              {/* ERC721 ownership feedback below Token ID field */}
              {contractType === 'erc721'
                && (selectedFunction.name === 'transferFrom' || selectedFunction.name === 'safeTransferFrom')
                && i === 2 && (
                <>
                  {isLoadingNftOwner && (
                    <p className="text-xs text-dark-400 font-mono mt-1 flex items-center gap-1">
                      <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Verifying ownership...
                    </p>
                  )}
                  {vaultOwnsNft === true && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-mono mt-1">
                      Vault owns this NFT
                    </p>
                  )}
                  {vaultOwnsNft === false && (
                    <p className="text-xs text-red-600 dark:text-red-400 font-mono mt-1">
                      Vault does not own NFT #{argValues[2]}. Owner: {nftOwner?.slice(0, 14)}...
                    </p>
                  )}
                </>
              )}
            </div>
          ))}

          {/* Payable notice */}
          {!selectedFunction.payable && (
            <p className="text-sm font-mono text-dark-400 italic">
              This function does not accept QUAI
            </p>
          )}

          {/* Encoding error — only show after user has interacted and all fields are filled */}
          {encodingError && hasInteracted && allInputsFilled && (
            <p className="text-sm text-red-600 dark:text-red-400 font-mono">
              {encodingError}
            </p>
          )}
        </div>
      )}

      {/* Show raw data toggle */}
      <button
        type="button"
        onClick={() => setShowRawData(!showRawData)}
        className="mt-4 text-sm font-mono text-dark-400 hover:text-dark-600 dark:hover:text-dark-300 flex items-center gap-1"
      >
        {showRawData ? 'Hide' : 'Show'} Raw Data
        <svg className={`w-3 h-3 transition-transform ${showRawData ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {showRawData && (
        <textarea
          value={rawData}
          onChange={(e) => handleRawDataChange(e.target.value)}
          rows={4}
          className="input-field w-full font-mono text-sm mt-2"
        />
      )}
    </div>
  );
}

/**
 * Render a typed input field for a function parameter.
 * Provides friendly labels for ERC20/ERC721 parameters.
 */
function ParameterInput({
  input,
  index,
  value,
  onChange,
  contractType,
  tokenMetadata,
  functionName,
}: {
  input: FunctionInputInfo;
  index: number;
  value: string;
  onChange: (index: number, value: string) => void;
  contractType: ContractType;
  tokenMetadata: TokenMetadata | null;
  functionName: string;
}) {
  const isAddressType = input.baseType === 'address';
  const isBoolType = input.baseType === 'bool';
  const isValid = !isAddressType || !value || isQuaiAddress(value);
  const isTokenAmount = isTokenAmountField(input, index, contractType, functionName);
  const hasDecimals = tokenMetadata?.decimals != null;

  // Friendly labels for token contract parameters
  const label = getTokenParamLabel(input, index, contractType, functionName) || input.name || `param${index}`;
  const placeholder = getTokenPlaceholder(input, index, contractType, functionName, tokenMetadata) || getPlaceholder(input);
  const hint = getTokenHint(input, index, contractType, functionName, tokenMetadata);

  if (isBoolType) {
    return (
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={(e) => onChange(index, e.target.checked ? 'true' : 'false')}
            className="w-4 h-4 accent-primary-500"
          />
          <span className="text-base font-mono text-dark-500">
            {label} <span className="text-dark-400 text-sm">({input.type})</span>
          </span>
        </label>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-base font-mono text-dark-500 mb-1">
        {label}
        {isTokenAmount
          ? <span className="text-dark-400 text-sm"> ({tokenMetadata?.symbol ?? 'token amount'})</span>
          : <span className="text-dark-400 text-sm"> ({input.type})</span>
        }
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(index, e.target.value)}
        placeholder={placeholder}
        className={`input-field w-full font-mono ${
          isAddressType && value && !isValid ? 'border-red-500 dark:border-red-400' : ''
        }`}
      />
      {isAddressType && value && !isValid && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">Invalid Quai address</p>
      )}
      {hint && (
        <p className="text-xs text-dark-400 mt-1">{hint}</p>
      )}
    </div>
  );
}

/** Friendly label overrides for common token parameters */
function getTokenParamLabel(
  input: FunctionInputInfo,
  index: number,
  contractType: ContractType,
  functionName: string,
): string | null {
  if (contractType === 'erc20') {
    if (functionName === 'transfer') {
      if (index === 0) return 'Recipient';
      if (index === 1) return 'Amount';
    }
    if (functionName === 'approve') {
      if (index === 0) return 'Spender';
      if (index === 1) return 'Amount';
    }
    if (functionName === 'transferFrom') {
      if (index === 0) return 'From';
      if (index === 1) return 'To';
      if (index === 2) return 'Amount';
    }
  }
  if (contractType === 'erc721') {
    if (functionName === 'transferFrom' || functionName === 'safeTransferFrom') {
      if (index === 0) return 'From';
      if (index === 1) return 'To';
      if (index === 2) return 'Token ID';
    }
    if (functionName === 'approve') {
      if (index === 0) return 'Approved Address';
      if (index === 1) return 'Token ID';
    }
    if (functionName === 'setApprovalForAll') {
      if (index === 0) return 'Operator';
      if (index === 1) return 'Approved';
    }
  }
  return null;
}

/** Friendly placeholder overrides */
function getTokenPlaceholder(
  input: FunctionInputInfo,
  index: number,
  contractType: ContractType,
  functionName: string,
  tokenMetadata: TokenMetadata | null,
): string | null {
  if (isTokenAmountField(input, index, contractType, functionName) && tokenMetadata?.decimals != null) {
    const sym = tokenMetadata.symbol ?? 'tokens';
    return `e.g. 1.5 ${sym}`;
  }
  if (contractType === 'erc721' && input.type === 'uint256' && (input.name === 'tokenId' || input.name === '_tokenId')) {
    return 'NFT Token ID';
  }
  return null;
}

/** Hint text below the input */
function getTokenHint(
  input: FunctionInputInfo,
  index: number,
  contractType: ContractType,
  functionName: string,
  tokenMetadata: TokenMetadata | null,
): string | null {
  if (isTokenAmountField(input, index, contractType, functionName) && tokenMetadata?.decimals != null) {
    const sym = tokenMetadata.symbol ?? 'tokens';
    if (functionName === 'approve') {
      return `Enter amount in ${sym} (${tokenMetadata.decimals} decimals). Use "max" or leave blank for unlimited approval.`;
    }
    return `Enter amount in ${sym} (${tokenMetadata.decimals} decimals). e.g. "1.5" = 1.5 ${sym}`;
  }
  return null;
}

function getPlaceholder(input: FunctionInputInfo): string {
  if (input.baseType === 'address') return '0x...';
  if (input.baseType === 'bool') return 'true/false';
  if (input.baseType === 'string') return 'text...';
  if (input.baseType === 'tuple') return 'JSON tuple: [val1, val2, ...]';
  if (input.baseType === 'array') return 'JSON array: [val1, val2, ...]';
  if (input.baseType.startsWith('uint') || input.baseType.startsWith('int')) return '0';
  if (input.baseType.startsWith('bytes')) return '0x...';
  return '';
}

/**
 * Coerce a string input value to the appropriate type for ABI encoding.
 * Note: token amount conversion (parseUnits) is handled in encodeCalldata.
 */
function coerceValue(raw: string, input: FunctionInputInfo): any {
  if (!raw && raw !== '0') return raw;

  switch (input.baseType) {
    case 'bool':
      return raw === 'true';
    case 'tuple':
    case 'array':
      try { return JSON.parse(raw); } catch { return raw; }
    default:
      return raw;
  }
}
