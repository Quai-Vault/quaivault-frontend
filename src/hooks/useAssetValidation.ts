import { useQuery } from '@tanstack/react-query';
import { getTokenBalance, getNftOwner } from '../services/utils/ContractMetadataService';
import type { ContractType, TokenMetadata } from '../services/utils/ContractMetadataService';
import { formatBalance } from '../utils/formatting';
import {
  isErc20SpendFromVault,
  isErc721TransferFunction,
  extractErc20Amount,
  extractErc721TokenId,
} from '../utils/assetSpend';

const BALANCE_STALE_TIME = 15_000;
const BALANCE_REFETCH_INTERVAL = 30_000;

export interface AssetValidationResult {
  erc20Balance: bigint | null;
  erc20BalanceFormatted: string | null;
  isLoadingBalance: boolean;
  insufficientBalance: boolean;
  nftOwner: string | null;
  isLoadingNftOwner: boolean;
  vaultOwnsNft: boolean | null;
  validationWarning: string | null;
}

export function useAssetValidation(
  contractAddress: string | undefined,
  walletAddress: string | undefined,
  contractType: ContractType,
  tokenMetadata: TokenMetadata | null,
  selectedFunctionName: string | null,
  argValues: Record<number, string>,
): AssetValidationResult {
  // --- ERC20 Balance Query ---
  const shouldFetchBalance =
    !!contractAddress &&
    !!walletAddress &&
    contractType === 'erc20' &&
    !!selectedFunctionName &&
    isErc20SpendFromVault(selectedFunctionName, argValues, walletAddress);

  const {
    data: erc20Balance,
    isLoading: isLoadingBalance,
  } = useQuery({
    queryKey: ['vaultTokenBalance', contractAddress, walletAddress],
    queryFn: () => getTokenBalance(contractAddress!, walletAddress!),
    enabled: shouldFetchBalance,
    staleTime: BALANCE_STALE_TIME,
    refetchInterval: BALANCE_REFETCH_INTERVAL,
    retry: 1,
  });

  const decimals = tokenMetadata?.decimals ?? 18;
  const erc20BalanceFormatted =
    erc20Balance != null && tokenMetadata?.decimals != null
      ? formatBalance(erc20Balance, tokenMetadata.decimals)
      : null;

  const enteredAmount =
    selectedFunctionName && shouldFetchBalance
      ? extractErc20Amount(selectedFunctionName, argValues, decimals)
      : null;

  const insufficientBalance =
    erc20Balance != null && enteredAmount != null && enteredAmount > erc20Balance;

  // --- ERC721 ownerOf Query ---
  const tokenId =
    contractType === 'erc721' &&
    selectedFunctionName &&
    isErc721TransferFunction(selectedFunctionName)
      ? extractErc721TokenId(selectedFunctionName, argValues)
      : null;

  const shouldFetchNftOwner =
    !!contractAddress && !!walletAddress && !!tokenId;

  const {
    data: nftOwner,
    isLoading: isLoadingNftOwner,
  } = useQuery({
    queryKey: ['nftOwner', contractAddress, tokenId],
    queryFn: () => getNftOwner(contractAddress!, tokenId!),
    enabled: shouldFetchNftOwner,
    staleTime: BALANCE_STALE_TIME,
    retry: 1,
  });

  const vaultOwnsNft =
    nftOwner != null && walletAddress
      ? nftOwner.toLowerCase() === walletAddress.toLowerCase()
      : null;

  // --- Build validation warning ---
  let validationWarning: string | null = null;
  if (insufficientBalance) {
    const symbol = tokenMetadata?.symbol ?? 'tokens';
    validationWarning = `Insufficient ${symbol} balance. Vault holds ${erc20BalanceFormatted} ${symbol}.`;
  } else if (shouldFetchNftOwner && nftOwner != null && vaultOwnsNft === false) {
    validationWarning = `Vault does not own NFT #${tokenId}. Owner: ${nftOwner.slice(0, 14)}...`;
  }

  return {
    erc20Balance: erc20Balance ?? null,
    erc20BalanceFormatted,
    isLoadingBalance,
    insufficientBalance,
    nftOwner: nftOwner ?? null,
    isLoadingNftOwner,
    vaultOwnsNft,
    validationWarning,
  };
}
