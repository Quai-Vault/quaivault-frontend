import type { Signer as QuaisSigner, Provider as QuaisProvider, Contract as QuaisContract } from 'quais';

export interface Transaction {
  to: string;
  timestamp: bigint;       // uint48
  expiration: bigint;      // uint48, 0 = no expiry
  proposer: string;
  executed: boolean;
  cancelled: boolean;
  approvedAt: bigint;      // uint48, 0 = not yet approved
  executionDelay: number;  // uint32, seconds
  value: bigint;
  data: string;
}

export interface WalletInfo {
  address: string;
  owners: string[];
  threshold: number;  // Changed from bigint for JSON serializability
  balance: string;    // Changed from bigint to string for JSON serializability (preserves precision)
  minExecutionDelay: number;  // Vault-level min timelock (seconds, 0 = none)
  delegatecallDisabled: boolean;  // CR-1: true = DelegateCall blocked (secure default)
}

export type TransactionStatus = 'pending' | 'executed' | 'cancelled' | 'expired' | 'failed';

export interface PendingTransaction {
  hash: string;
  to: string;
  value: string;      // Changed from bigint to string for JSON serializability
  data: string;
  numApprovals: number;  // Changed from bigint for JSON serializability
  threshold: number;     // Changed from bigint for JSON serializability
  executed: boolean;
  cancelled: boolean;
  timestamp: number;     // Changed from bigint for JSON serializability
  proposer: string;      // Address of the transaction proposer
  approvals: { [owner: string]: boolean };
  executedBy?: string;
  transactionType?: string;
  decodedParams?: Record<string, unknown> | null;
  // New fields for 5-state lifecycle
  status: TransactionStatus;
  expiration: number;        // unix timestamp, 0 = no expiry
  executionDelay: number;    // seconds, 0 = immediate
  approvedAt: number;        // unix timestamp, 0 = not yet approved
  executableAfter: number;   // approvedAt + executionDelay, 0 if not approved
  isExpired: boolean;
  failedReturnData?: string | null;
}

export interface DeploymentConfig {
  owners: string[];
  threshold: number;
  salt?: string;
  minExecutionDelay?: number;  // seconds, 0 = no timelock
  delegatecallDisabled?: boolean;  // CR-1: defaults to true if omitted
}

export interface TransactionData {
  to: string;
  value: bigint;
  data: string;
  expiration?: number;      // unix timestamp, 0 = no expiry
  executionDelay?: number;  // seconds, 0 = immediate
}

export type TransactionMode = 'send-quai' | 'send-token' | 'send-nft' | 'send-erc1155' | 'contract-call' | 'sign-message';

export interface SendTokenMeta {
  symbol: string;
  name: string | null;
  decimals: number;
  address: string;
}

export interface SendNftMeta {
  collectionName: string | null;
  collectionSymbol: string | null;
  tokenId: string;
  image: string | null;
  tokenAddress: string;
}

export interface SendErc1155Meta {
  collectionName: string | null;
  collectionSymbol: string | null;
  tokenId: string;
  image: string | null;
  tokenAddress: string;
  balance: string; // vault's on-chain balance of this tokenId
}

export type Signer = QuaisSigner;
export type Provider = QuaisProvider;
export type Contract = QuaisContract;
