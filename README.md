# QuaiVault Frontend

Multisig wallet management UI for Quai Network, powered by QuaiVault smart contracts with Zodiac IAvatar compatibility.

## Related Repositories

- **[quaivault-contracts](../quaivault-contracts/)** - Smart contracts (QuaiVault, ProxyFactory, modules)
- **[quaivault-indexer](../quaivault-indexer/)** - Supabase-based blockchain event indexer

## Key Features

- **Decentralized-First**: All core functionality works directly via RPC without backend dependencies
- **Real-Time Updates**: Supabase subscriptions with polling fallback
- **Hybrid Data Fetching**: Indexer for fast reads, blockchain for writes, automatic fallback
- **Transaction Management**: Propose, approve, execute, cancel, and revoke approvals
- **Owner Management**: Add/remove owners and change approval thresholds via multisig
- **Module Management**: DailyLimit, Whitelist, SocialRecovery configuration
- **Transaction History**: View executed and cancelled transactions with detailed decoding
- **Modern UI**: Dark vault theme with responsive design and comprehensive notifications

## Tech Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **quais.js** for Quai Network blockchain interaction
- **TailwindCSS** with custom vault theme
- **TanStack React Query** for data fetching and caching
- **Zustand** for state management
- **Supabase** for indexer integration and real-time subscriptions
- **Zod** for runtime type validation
- **Vitest** for unit testing

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Pelagus wallet browser extension

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
# Contract addresses (from quaivault-contracts deployment)
VITE_QUAIVAULT_IMPLEMENTATION=0x...
VITE_QUAIVAULT_FACTORY=0x...
VITE_SOCIAL_RECOVERY_MODULE=0x...
VITE_DAILY_LIMIT_MODULE=0x...
VITE_WHITELIST_MODULE=0x...
VITE_MULTISEND=0x...

# Network configuration
VITE_RPC_URL=https://rpc.orchard.quai.network
VITE_CHAIN_ID=9000

# Indexer configuration (optional - enables real-time updates)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_NETWORK_SCHEMA=testnet
VITE_INDEXER_URL=http://localhost:3001
```

See [.env.example](.env.example) for all configuration options.

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

Production build outputs to `dist/`

## Project Structure

```
src/
├── components/         # Reusable UI components
│   ├── modules/        # Module-specific components
│   └── ...
├── pages/              # Page components
├── services/           # Blockchain interaction services
│   ├── core/           # Core services (Wallet, Transaction, Owner)
│   ├── modules/        # Module services (DailyLimit, Whitelist, SocialRecovery)
│   ├── indexer/        # Indexer services (queries, subscriptions, health)
│   └── utils/          # Utility functions
├── hooks/              # Custom React hooks
├── store/              # Zustand state management
├── types/              # TypeScript type definitions
├── config/             # Configuration and ABIs
└── test/               # Test setup and utilities
```

## Key Services

### Core Services
- **MultisigService** - Facade for all wallet operations (uses indexer when available, falls back to blockchain)
- **WalletService** - Wallet deployment and info
- **TransactionService** - Transaction proposal/approval/execution
- **OwnerService** - Owner management operations

### Module Services
- **DailyLimitModuleService** - Daily spending limits
- **WhitelistModuleService** - Address whitelisting
- **SocialRecoveryModuleService** - Guardian-based recovery

### Indexer Services
- **IndexerService** - Main indexer facade
- **IndexerWalletService** - Wallet queries from indexer
- **IndexerTransactionService** - Transaction queries with batch confirmations
- **IndexerSubscriptionService** - Real-time Supabase subscriptions with reconnection handling
- **IndexerHealthService** - Indexer health checks and sync status

## Module Configuration

Module configuration requires **multisig approval**. The frontend uses `propose*` methods that create multisig proposals:

| Action | Method | Workflow |
|--------|--------|----------|
| Set daily limit | `proposeSetDailyLimit()` | Creates proposal -> Requires approval -> Executed |
| Add to whitelist | `proposeAddToWhitelist()` | Creates proposal -> Requires approval -> Executed |
| Setup recovery | `proposeSetupRecovery()` | Creates proposal -> Requires approval -> Executed |

## Testing

357 passing tests covering all service layers, utilities, and core business logic.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment configuration across Nginx, Apache, Netlify, Vercel, and other platforms.

## License

MIT License
