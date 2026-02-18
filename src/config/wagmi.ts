import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createAppKit } from '@reown/appkit/react';
import { defineChain } from '@reown/appkit/networks';

const projectId = import.meta.env.VITE_WC_PROJECT_ID || '';

// Quai Orchard Testnet - not in viem's default chain list, so define manually
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

export const networks = [quaiOrchardTestnet] as const;

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
    defaultNetwork: quaiOrchardTestnet,
    metadata: {
      name: 'QuaiVault',
      description: 'Decentralized multisig solution for Quai Network',
      url: import.meta.env.VITE_SITE_URL || 'https://testnet.quaivault.org',
      icons: [`${import.meta.env.VITE_SITE_URL || 'https://testnet.quaivault.org'}/quai-multisig-icon-final.png`],
    },
    features: {
      analytics: false,
    },
  });
} else {
  console.error('[QuaiVault] Missing VITE_WC_PROJECT_ID. WalletConnect will not work.');
}

export const wagmiConfig = wagmiAdapter.wagmiConfig;
