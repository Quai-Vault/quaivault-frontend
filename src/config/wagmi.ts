import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { defineChain } from 'viem';
import { PELAGUS_ICON, getPelagusProvider } from './injectedWallets';
import type { InjectedWindow } from './injectedWallets';

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
    default: { http: [import.meta.env.VITE_RPC_URL || 'https://orchard.rpc.quai.network'] },
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

export const CONNECTOR_IDS = {
  pelagus: 'pelagus',
  injected: 'injected',
  walletConnect: 'walletConnect',
} as const;

export type ConnectorId = (typeof CONNECTOR_IDS)[keyof typeof CONNECTOR_IDS];

export const wagmiConfig = createConfig({
  chains: [activeNetwork],
  connectors: [
    // Bound directly to `window.pelagus`. Without this, the generic injected
    // connector below resolves `window.ethereum`, which Pelagus routes to
    // whichever *other* wallet the user has installed unless they've turned on
    // "default wallet" — see ./injectedWallets.ts.
    //
    // The target must be an object, not a function: wagmi falls back to the
    // `window.ethereum` default target when a *function* target returns
    // undefined, which would silently reintroduce the bug.
    injected({
      shimDisconnect: true,
      target: {
        id: CONNECTOR_IDS.pelagus,
        name: 'Pelagus',
        icon: PELAGUS_ICON,
        provider: (w) => getPelagusProvider(w as InjectedWindow),
      },
    }),
    // Escape hatch for an injected wallet that exposes only `window.ethereum`.
    // Pelagus and Blip Pay both go through the connector above.
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
