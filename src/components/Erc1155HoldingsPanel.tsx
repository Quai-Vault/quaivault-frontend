import { useErc1155Holdings } from '../hooks/useErc1155Holdings';
import { HoldingsPanel, type HoldingsPanelConfig } from './HoldingsPanel';

const ERC1155_CONFIG: HoldingsPanelConfig = {
  title: 'ERC1155 Holdings',
  placeholderLetter: 'M',
  colorScheme: 'violet',
  routeMode: 'send-erc1155',
  fallbackAltName: 'ERC1155',
};

interface Erc1155HoldingsPanelProps {
  walletAddress: string;
  isOwner?: boolean;
}

export function Erc1155HoldingsPanel({ walletAddress, isOwner }: Erc1155HoldingsPanelProps) {
  const {
    holdings,
    totalItems,
    isLoading,
    isLoadingMetadata,
    isRefetching,
    isIndexerEnabled,
    isIndexerConnected,
    error,
    refetchAll,
  } = useErc1155Holdings(walletAddress);

  return (
    <HoldingsPanel
      walletAddress={walletAddress}
      isOwner={isOwner}
      config={ERC1155_CONFIG}
      items={holdings}
      totalCount={totalItems}
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
