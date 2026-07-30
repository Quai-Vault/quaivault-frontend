import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Interface } from 'quais';
import { isContract, fetchAbi, detectContractType, fetchTokenMetadata } from '../services/utils/ContractMetadataService';
import { parseWriteFunctions } from '../utils/abiFunctions';
export type { FunctionInfo, FunctionInputInfo } from '../utils/abiFunctions';
import type { FunctionInfo } from '../utils/abiFunctions';
import type { AbiResult, ContractAbi, ContractType, TokenMetadata } from '../services/utils/ContractMetadataService';

export interface ContractInteractionResult {
  isContract: boolean | null;
  isDetecting: boolean;
  detectError: string | null;
  abi: ContractAbi | null;
  abiSource: 'ipfs' | 'explorer' | 'known' | null;
  isFetchingAbi: boolean;
  abiFetchError: string | null;
  functions: FunctionInfo[];
  contractType: ContractType;
  tokenMetadata: TokenMetadata | null;
  setManualAbi: (abi: ContractAbi) => { success: boolean; error?: string };
}

export function useContractInteraction(address: string | undefined): ContractInteractionResult {
  const [manualAbi, setManualAbiState] = useState<ContractAbi | null>(null);
  const [manualAbiSource, setManualAbiSource] = useState<'ipfs' | 'explorer' | 'known' | null>(null);

  // Query 1: Is this address a contract?
  const {
    data: contractCheck,
    isLoading: isDetecting,
    error: detectErrorObj,
  } = useQuery({
    queryKey: ['contractDetect', address],
    queryFn: () => isContract(address!),
    enabled: !!address,
    staleTime: Infinity,
    retry: 1,
  });

  // Query 2: Fetch ABI (only when confirmed as contract)
  const {
    data: abiResult,
    isLoading: isFetchingAbi,
    error: abiFetchErrorObj,
  } = useQuery<AbiResult>({
    queryKey: ['contractAbi', address],
    queryFn: () => fetchAbi(address!),
    enabled: contractCheck === true && !manualAbi,
    staleTime: Infinity,
    retry: 1,
  });

  const effectiveAbi = manualAbi ?? abiResult?.abi ?? null;
  const effectiveSource = manualAbi ? (manualAbiSource ?? 'known') : (abiResult?.source ?? null);

  const functions = useMemo(() => {
    if (!effectiveAbi) return [];
    return parseWriteFunctions(effectiveAbi);
  }, [effectiveAbi]);

  const contractType = useMemo<ContractType>(() => {
    if (!effectiveAbi) return 'generic';
    return detectContractType(effectiveAbi);
  }, [effectiveAbi]);

  // Fetch token metadata for ERC20 contracts
  const { data: tokenMetadata } = useQuery<TokenMetadata>({
    queryKey: ['tokenMetadata', address],
    queryFn: () => fetchTokenMetadata(address!),
    enabled: !!address && contractType === 'erc20',
    staleTime: Infinity,
    retry: 1,
  });

  const setManualAbi = (abi: ContractAbi): { success: boolean; error?: string } => {
    try {
      Interface.from(abi);
      setManualAbiState(abi);
      setManualAbiSource('known');
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Invalid ABI' };
    }
  };

  return {
    isContract: address ? (contractCheck ?? null) : null,
    isDetecting,
    detectError: detectErrorObj ? (detectErrorObj instanceof Error ? detectErrorObj.message : 'Contract detection failed') : null,
    abi: effectiveAbi,
    abiSource: effectiveSource,
    isFetchingAbi: isFetchingAbi && !manualAbi,
    abiFetchError: abiFetchErrorObj ? (abiFetchErrorObj instanceof Error ? abiFetchErrorObj.message : 'Failed to fetch ABI') : null,
    functions,
    contractType,
    tokenMetadata: tokenMetadata ?? null,
    setManualAbi,
  };
}
