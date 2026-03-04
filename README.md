# QuaiVault Frontend

Multisig wallet management UI for Quai Network, powered by QuaiVault smart contracts with Zodiac IAvatar compatibility.

## Related Repositories

- **[quaivault-contracts](../quaivault-contracts/)** — Smart contracts (QuaiVault, ProxyFactory, modules)
- **[quaivault-indexer](../quaivault-indexer/)** — Supabase-based blockchain event indexer

## Key Features

- **Decentralized-First** — All core functionality works directly via RPC without backend dependencies
- **Real-Time Updates** — Supabase subscriptions with automatic polling fallback
- **Hybrid Data Fetching** — Indexer for fast reads, blockchain for writes, automatic fallback when indexer is unavailable
- **Transaction Management** — Propose, approve, execute, cancel, and revoke approvals with configurable timelocks and expiration
- **Multi-Asset Support** — Native QUAI, ERC-20 tokens, ERC-721 NFTs, and ERC-1155 semi-fungibles
- **Owner Management** — Add/remove owners and change approval thresholds via multisig proposals
- **Social Recovery** — Guardian-based vault recovery via the SocialRecoveryModule
- **Message Signing** — EIP-1271 message signing and unsigning with browsable history
- **Contract Interaction** — ABI auto-fetch, function selector, and custom calldata builder
- **Modern UI** — Dark vault theme with responsive design, toast notifications, and accessibility features

## Tech Stack

| Category | Libraries |
|----------|-----------|
| Framework | React 18, TypeScript, Vite |
| Blockchain | quais.js (Quai SDK), viem, wagmi |
| Wallet Connect | Reown AppKit, WalletConnect |
| Data Fetching | TanStack React Query |
| State Management | Zustand (persisted) |
| Styling | TailwindCSS (custom vault theme) |
| Backend | Supabase (indexer, real-time subscriptions) |
| Validation | Zod, React Hook Form |
| Testing | Vitest, Testing Library |

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- [Pelagus](https://pelaguswallet.io/) wallet browser extension (or WalletConnect-compatible wallet)

### Installation

```bash
npm install
```

### Environment Configuration

Copy the environment template and configure:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Network
VITE_RPC_URL=https://rpc.orchard.quai.network
VITE_CHAIN_ID=15000
VITE_BLOCK_EXPLORER_URL=https://orchard.quaiscan.io

# Contract addresses (from quaivault-contracts deployment)
VITE_QUAIVAULT_IMPLEMENTATION=0x...
VITE_QUAIVAULT_FACTORY=0x...
VITE_SOCIAL_RECOVERY_MODULE=0x...
VITE_MULTISEND=0x...

# Indexer (optional — enables real-time updates and fast queries)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_NETWORK_SCHEMA=dev
VITE_INDEXER_URL=https://index.devnet.quaivault.org

# WalletConnect
VITE_WC_PROJECT_ID=your-walletconnect-project-id

# NFT metadata resolution
VITE_IPFS_GATEWAY=https://ipfs.qu.ai
VITE_NFT_IPFS_GATEWAY=https://ipfs.io

# Site metadata
VITE_SITE_URL=https://testnet.quaivault.org
VITE_GITHUB_URL=https://github.com/Quai-Vault/quaivault-frontend
```

See [.env.example](.env.example) for defaults and all options.

### Development

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

### Build

```bash
npm run build    # Type-check + production build → dist/
npm run preview  # Preview the production build locally
```

## Project Structure

```
src/
├── components/              # UI components
│   ├── transaction/         # Transaction forms (SendToken, SendNft, SignMessage, etc.)
│   ├── Modal.tsx            # Accessible modal with focus trap
│   ├── OwnerManagement.tsx  # Owner list and management
│   ├── ModuleManagement.tsx # Module configuration panel
│   ├── WalletCard.tsx       # Vault card for dashboard
│   ├── Layout.tsx           # App shell (sidebar + content)
│   └── ...                  # 36 components total
├── pages/                   # Route pages
│   ├── Dashboard.tsx        # Vault list (owned + guardian)
│   ├── WalletDetail.tsx     # Vault overview, pending txs, owners, modules
│   ├── CreateWallet.tsx     # Vault deployment wizard
│   ├── NewTransaction.tsx   # Propose transaction (6 modes)
│   ├── TransactionHistory.tsx
│   └── LookupTransaction.tsx
├── services/                # Blockchain and data services
│   ├── core/                # WalletService, TransactionService, OwnerService
│   ├── modules/             # SocialRecoveryModuleService
│   ├── indexer/             # Supabase indexer queries, subscriptions, health
│   ├── utils/               # Gas estimation, error handling, metadata, verification
│   └── MultisigService.ts   # Facade — indexer-first with blockchain fallback
├── hooks/                   # 17 custom React hooks
├── store/                   # Zustand stores (wallet, theme)
├── config/                  # Chain config, ABIs, provider, Supabase client
├── types/                   # TypeScript type definitions
├── utils/                   # Formatting, validation, clipboard
└── test/                    # Test setup and mocks
```

## Routes

| Path | Page | Purpose |
|------|------|---------|
| `/` | Dashboard | Lists owned vaults and guardian-only vaults |
| `/create` | CreateWallet | Deploy a new multisig vault |
| `/wallet/:address` | WalletDetail | Balance, pending transactions, owners, modules, assets |
| `/wallet/:address/transaction/new` | NewTransaction | Propose a transaction (send QUAI, tokens, NFTs, contract calls, message signing) |
| `/wallet/:address/history` | TransactionHistory | Executed, cancelled, expired, and failed transactions |
| `/wallet/:address/lookup` | LookupTransaction | Search for a specific transaction by hash |

## Architecture

### Service Layer

The service layer follows a **facade + fallback** pattern:

- **MultisigService** is the single entry point for all wallet operations.
- It queries the **Supabase indexer** first for fast reads.
- If the indexer is unavailable, it falls back to direct **blockchain RPC** calls.
- Write operations always go through the blockchain (propose, approve, execute, cancel).

### Core Services

| Service | Responsibility |
|---------|---------------|
| `WalletService` | Vault deployment (CREATE2) and on-chain wallet info |
| `TransactionService` | Propose, approve, revoke, execute, cancel transactions |
| `OwnerService` | Add/remove owners, change threshold, change timelock |

### Indexer Services

| Service | Responsibility |
|---------|---------------|
| `IndexerWalletService` | Wallet details and owner lists |
| `IndexerTransactionService` | Transaction queries with batch confirmation lookups |
| `IndexerTokenService` | Token/NFT discovery and transfer history |
| `IndexerSubscriptionService` | Real-time Supabase subscriptions with reconnection |
| `IndexerHealthService` | Health checks and sync status (5s polling) |
| `SubscriptionManager` | Limits concurrent subscriptions (max 10), LRU cleanup |

### State Management

- **Zustand** — Global UI state (connected wallet, vault list, theme). Persisted to localStorage.
- **React Query** — Server state (wallet info, transactions, token balances). Smart caching with configurable stale times.

### Wallet Connection

- **Pelagus** (Quai-native) and **WalletConnect** (via Reown AppKit) are supported.
- A bridge layer (`walletBridge.ts`) converts raw EIP-1193 providers into quais `Signer` instances.
- Supported chains: **Quai Mainnet** (chainId 9) and **Quai Orchard Testnet** (chainId 15000), selected via `VITE_CHAIN_ID`.

## Transaction Modes

| Mode | Description |
|------|-------------|
| Send QUAI | Native currency transfer (auto-detects contracts and offers to switch to Contract Call) |
| Send Token | ERC-20 transfer with token picker and balance validation |
| Send NFT | ERC-721 transfer with collection browser and image previews |
| Send ERC-1155 | ERC-1155 transfer with quantity input and on-chain balance verification |
| Contract Call | ABI auto-fetch from Sourcify, function selector, parameter builder, or raw calldata |
| Sign Message | EIP-1271 message signing/unsigning with browsable history of signed messages |

All modes support optional **expiration** and **execution delay** (timelock) settings, except message signing (self-calls bypass timelock on-chain).

## Module Configuration

Module configuration requires **multisig approval**:

| Module | Description |
|--------|-------------|
| Social Recovery | Guardian-based vault recovery — add guardians, initiate and finalize recovery |

## Testing

```bash
npm test              # Watch mode
npm run test:run      # Single run (CI)
npm run test:coverage # Coverage report
```

16 test files covering services, utilities, and components.

## Linting & Formatting

```bash
npm run lint    # ESLint
npm run format  # Prettier
```

## License

MIT License
