import { useNftHoldings } from '../hooks/useNftHoldings';
import { HoldingsPanel, type HoldingsPanelConfig } from './HoldingsPanel';

const NFT_CONFIG: HoldingsPanelConfig = {
  title: 'NFT Holdings',
  placeholderLetter: 'N',
  colorScheme: 'purple',
  routeMode: 'send-nft',
  fallbackAltName: 'NFT',
};

interface NftHoldingsPanelProps {
  walletAddress: string;
  isOwner?: boolean;
}

export function NftHoldingsPanel({ walletAddress, isOwner }: NftHoldingsPanelProps) {
  const {
    holdings,
    totalNfts,
    maxDisplayed,
    isLoading,
    isLoadingMetadata,
    isRefetching,
    isIndexerEnabled,
    isIndexerConnected,
    error,
    refetchAll,
  } = useNftHoldings(walletAddress);

  return (
    <HoldingsPanel
      walletAddress={walletAddress}
      isOwner={isOwner}
      config={NFT_CONFIG}
      items={holdings}
      totalCount={totalNfts}
      countDisplay={totalNfts > maxDisplayed ? `${maxDisplayed}/${totalNfts}` : undefined}
      isLoading={isLoading}
      isLoadingMetadata={isLoadingMetadata}
      isRefetching={isRefetching}
      isIndexerEnabled={isIndexerEnabled}
      isIndexerConnected={isIndexerConnected}
      error={error}
      onRefetch={refetchAll}
    />
  );
}
