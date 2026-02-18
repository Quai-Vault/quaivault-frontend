import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createAppKit } from '@reown/appkit/react';
import { defineChain, type AppKitNetwork } from '@reown/appkit/networks';

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
    // Only show injected wallets (Pelagus) + WalletConnect QR (Tangem).
    // Quai Network is not supported by other wallets.
    // NOTE: includeWalletIds must contain a non-empty dummy value because
    // the AppKit API treats an empty array as "no filter" and returns
    // default recommended wallets (MetaMask, Binance, etc.).
    featuredWalletIds: [],
    includeWalletIds: ['none'],
    allWallets: 'HIDE',
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
  });
} else {
  console.error('[QuaiVault] Missing VITE_WC_PROJECT_ID. WalletConnect will not work.');
}

export const wagmiConfig = wagmiAdapter.wagmiConfig;
