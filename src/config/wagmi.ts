import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createAppKit } from '@reown/appkit/react';
import { defineChain, type AppKitNetwork } from '@reown/appkit/networks';
import { ApiController } from '@reown/appkit-controllers';
import { subscribe } from 'valtio/vanilla';

const projectId = import.meta.env.VITE_WC_PROJECT_ID || '';

// Quai chains - not in viem's default chain list, so define manually
export const quaiMainnet = defineChain({
  id: 9,
  caipNetworkId: 'eip155:9',
  chainNamespace: 'eip155',
  name: 'Quai Network',
  nativeCurrency: {
    decimals: 18,
    name: 'Quai',
    symbol: 'QUAI',
  },
  rpcUrls: {
    default: { http: ['https://rpc.quai.network'] },
  },
  blockExplorers: {
    default: { name: 'Quaiscan', url: 'https://quaiscan.io' },
  },
});

export const quaiOrchardTestnet = defineChain({
  id: 15000,
  caipNetworkId: 'eip155:15000',
  chainNamespace: 'eip155',
  name: 'Quai Network Orchard Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Quai',
    symbol: 'QUAI',
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_RPC_URL || 'https://rpc.orchard.quai.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Quaiscan',
      url: import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://orchard.quaiscan.io',
    },
  },
});

// Select active network based on VITE_CHAIN_ID
const chainId = Number(import.meta.env.VITE_CHAIN_ID);
const activeNetwork = chainId === 9 ? quaiMainnet : quaiOrchardTestnet;
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [activeNetwork];

export const wagmiAdapter = new WagmiAdapter({
  storage: undefined,
  ssr: false,
  projectId,
  networks,
});

if (projectId) {
  createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks,
    defaultNetwork: activeNetwork,
    metadata: {
      name: 'QuaiVault',
      description: 'Decentralized multisig solution for Quai Network',
      url: import.meta.env.VITE_SITE_URL || 'https://testnet.quaivault.org',
      icons: [`${import.meta.env.VITE_SITE_URL || 'https://testnet.quaivault.org'}/quai-multisig-icon-final.png`],
    },
    // Only show Pelagus (via EIP-6963 announcement) + WalletConnect QR (Tangem).
    // Quai Network is not supported by other wallets. enableEIP6963 defaults to
    // false in current AppKit releases — without it, Pelagus's announce event
    // is ignored even though Pelagus broadcasts it correctly.
    // Suppress "Switch Network" dialog - Pelagus reports a zone-specific
    // chain ID that may not exactly match our configured caipNetworkId.
    // Network validation is handled by the quais bridge layer.
    allowUnsupportedChain: true,
    enableEIP6963: true,
    enableCoinbase: false,
    featuredWalletIds: [],
    allWallets: 'HIDE',
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
  });

  // Pelagus isn't in the WalletConnect explorer (621 wallets, none for Quai),
  // and includeWalletIds is only an API-side filter — neither can express
  // "only show Pelagus and WC QR". Instead, force the explorer-sourced wallet
  // arrays to stay empty. Pelagus shows via EIP-6963 (ANNOUNCED connector
  // type), which is independent of these arrays.
  const clearExplorerWallets = () => {
    if (ApiController.state.recommended.length) ApiController.state.recommended = [];
    if (ApiController.state.allRecommended.length) ApiController.state.allRecommended = [];
    if (ApiController.state.featured.length) ApiController.state.featured = [];
    if (ApiController.state.allFeatured.length) ApiController.state.allFeatured = [];
    if (ApiController.state.wallets.length) ApiController.state.wallets = [];
    if (ApiController.state.filteredWallets.length) ApiController.state.filteredWallets = [];
  };
  clearExplorerWallets();
  subscribe(ApiController.state, clearExplorerWallets);
} else {
  console.error('[QuaiVault] Missing VITE_WC_PROJECT_ID. WalletConnect will not work.');
}

export const wagmiConfig = wagmiAdapter.wagmiConfig;
