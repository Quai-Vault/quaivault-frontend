import type { Signer as QuaisSigner, Provider as QuaisProvider, Contract as QuaisContract } from 'quais';

export interface Transaction {
  to: string;
  value: bigint;
  data: string;
  executed: boolean;
  numApprovals: bigint;
  timestamp: bigint;
}

export interface WalletInfo {
  address: string;
  owners: string[];
  threshold: number;  // Changed from bigint for JSON serializability
  balance: string;    // Changed from bigint to string for JSON serializability (preserves precision)
}

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
}

export interface DeploymentConfig {
  owners: string[];
  threshold: number;
  salt?: string;
}

export interface TransactionData {
  to: string;
  value: bigint;
  data: string;
}

export type Signer = QuaisSigner;
export type Provider = QuaisProvider;
export type Contract = QuaisContract;
