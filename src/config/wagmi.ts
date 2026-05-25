import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { defineChain } from 'viem';

const projectId = import.meta.env.VITE_WC_PROJECT_ID || '';

export const quaiMainnet = defineChain({
  id: 9,
  name: 'Quai Network',
  nativeCurrency: { decimals: 18, name: 'Quai', symbol: 'QUAI' },
  rpcUrls: { default: { http: ['https://rpc.quai.network'] } },
  blockExplorers: { default: { name: 'Quaiscan', url: 'https://quaiscan.io' } },
});

export const quaiOrchardTestnet = defineChain({
  id: 15000,
  name: 'Quai Network Orchard Testnet',
  nativeCurrency: { decimals: 18, name: 'Quai', symbol: 'QUAI' },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL || 'https://rpc.orchard.quai.network'] },
  },
  blockExplorers: {
    default: {
      name: 'Quaiscan',
      url: import.meta.env.VITE_BLOCK_EXPLORER_URL || 'https://orchard.quaiscan.io',
    },
  },
});

const chainId = Number(import.meta.env.VITE_CHAIN_ID);
const activeNetwork = chainId === 9 ? quaiMainnet : quaiOrchardTestnet;

const siteUrl = import.meta.env.VITE_SITE_URL || 'https://testnet.quaivault.org';

if (!projectId) {
  console.error('[QuaiVault] Missing VITE_WC_PROJECT_ID. WalletConnect will not work.');
}

export const wagmiConfig = createConfig({
  chains: [activeNetwork],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId,
      showQrModal: true,
      metadata: {
        name: 'QuaiVault',
        description: 'Decentralized multisig solution for Quai Network',
        url: siteUrl,
        icons: [`${siteUrl}/quai-multisig-icon-final.png`],
      },
    }),
  ],
  transports: {
    [quaiMainnet.id]: http(),
    [quaiOrchardTestnet.id]: http(),
  },
});

export const CONNECTOR_IDS = {
  injected: 'injected',
  walletConnect: 'walletConnect',
} as const;
