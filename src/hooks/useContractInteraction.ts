import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Interface } from 'quais';
import type { ParamType } from 'quais';
import { isContract, fetchAbi, detectContractType, fetchTokenMetadata } from '../services/utils/ContractMetadataService';
import type { AbiResult, ContractType, TokenMetadata } from '../services/utils/ContractMetadataService';

export interface FunctionInputInfo {
  name: string;
  type: string;
  baseType: string;
  isArray: boolean;
  isTuple: boolean;
  components: ReadonlyArray<ParamType> | null;
  arrayChildren: ParamType | null;
}

export interface FunctionInfo {
  name: string;
  signature: string;
  selector: string;
  inputs: FunctionInputInfo[];
  stateMutability: string;
  payable: boolean;
  outputs: { name: string; type: string }[];
}

export interface ContractInteractionResult {
  isContract: boolean | null;
  isDetecting: boolean;
  abi: any[] | null;
  abiSource: 'ipfs' | 'explorer' | 'known' | null;
  isFetchingAbi: boolean;
  abiFetchError: string | null;
  functions: FunctionInfo[];
  contractType: ContractType;
  tokenMetadata: TokenMetadata | null;
  setManualAbi: (abi: any[]) => { success: boolean; error?: string };
}

function parseFunctions(abi: any[]): FunctionInfo[] {
  try {
    const iface = new Interface(abi);
    const writeFunctions: FunctionInfo[] = [];
    iface.forEachFunction((func) => {
      if (func.stateMutability === 'payable' || func.stateMutability === 'nonpayable') {
        writeFunctions.push({
          name: func.name,
          signature: func.format('minimal'),
          selector: func.selector,
          inputs: func.inputs.map((p) => ({
            name: p.name,
            type: p.type,
            baseType: p.baseType,
            isArray: p.isArray(),
            isTuple: p.isTuple(),
            components: p.components,
            arrayChildren: p.arrayChildren,
          })),
          stateMutability: func.stateMutability,
          payable: func.payable,
          outputs: func.outputs.map((p) => ({ name: p.name, type: p.type })),
        });
      }
    });
    return writeFunctions;
  } catch {
    return [];
  }
}

export function useContractInteraction(address: string | undefined): ContractInteractionResult {
  const [manualAbi, setManualAbiState] = useState<any[] | null>(null);
  const [manualAbiSource, setManualAbiSource] = useState<'ipfs' | 'explorer' | 'known' | null>(null);

  // Query 1: Is this address a contract?
  const {
    data: contractCheck,
    isLoading: isDetecting,
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
    return parseFunctions(effectiveAbi);
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

  const setManualAbi = (abi: any[]): { success: boolean; error?: string } => {
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
