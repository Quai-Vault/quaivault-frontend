import { supabase } from '../../config/supabase';
import {
  TransactionSchema,
  ConfirmationSchema,
  DepositSchema,
  type IndexerTransaction,
  type Deposit,
  type Confirmation,
} from '../../types/database';
import { validateAddress, validateTxHash } from '../utils/TransactionErrorHandler';

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}

export class IndexerTransactionService {
  private readonly DEFAULT_LIMIT = 50;
  private readonly MAX_LIMIT = 100;

  private ensureClient() {
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }
    return supabase;
  }

  async getPendingTransactions(walletAddress: string): Promise<IndexerTransaction[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('transactions')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(this.MAX_LIMIT);

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    return (data ?? []).map((tx: unknown) => TransactionSchema.parse(tx));
  }

  async getTransactionByHash(
    walletAddress: string,
    txHash: string
  ): Promise<IndexerTransaction | null> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    const validatedHash = validateTxHash(txHash);

    const { data, error } = await client
      .from('transactions')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('tx_hash', validatedHash)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    return TransactionSchema.parse(data);
  }

  async getTransactionHistory(
    walletAddress: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<IndexerTransaction>> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    const limit = Math.min(options.limit ?? this.DEFAULT_LIMIT, this.MAX_LIMIT);
    const offset = options.offset ?? 0;

    const { data, error, count } = await client
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('wallet_address', validatedWallet.toLowerCase())
      .in('status', ['executed', 'cancelled'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    const transactions = (data ?? []).map((tx: unknown) => TransactionSchema.parse(tx));
    const total = count ?? 0;

    return {
      data: transactions,
      total,
      hasMore: offset + transactions.length < total,
    };
  }

  /**
   * Get all confirmations for a transaction (including revoked)
   */
  async getConfirmationsByTxHash(
    walletAddress: string,
    txHash: string
  ): Promise<Confirmation[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    const validatedHash = validateTxHash(txHash);

    const { data, error } = await client
      .from('confirmations')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('tx_hash', validatedHash)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    return (data ?? []).map((c: unknown) => ConfirmationSchema.parse(c));
  }

  /**
   * Get only active (non-revoked) confirmations
   */
  async getActiveConfirmations(
    walletAddress: string,
    txHash: string
  ): Promise<Confirmation[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    const validatedHash = validateTxHash(txHash);

    const { data, error } = await client
      .from('confirmations')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('tx_hash', validatedHash)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    return (data ?? []).map((c: unknown) => ConfirmationSchema.parse(c));
  }

  /**
   * Get active confirmations for multiple transactions at once (batch query)
   * Prevents N+1 query problem when loading multiple transactions
   */
  async getActiveConfirmationsBatch(
    walletAddress: string,
    txHashes: string[]
  ): Promise<Map<string, Confirmation[]>> {
    if (txHashes.length === 0) {
      return new Map();
    }

    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    // Validate all tx hashes
    const validatedHashes = txHashes.map(hash => validateTxHash(hash));

    const { data, error } = await client
      .from('confirmations')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .in('tx_hash', validatedHashes)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    // Group confirmations by tx_hash
    const result = new Map<string, Confirmation[]>();
    txHashes.forEach((hash) => result.set(hash, []));

    (data ?? []).forEach((c: unknown) => {
      const confirmation = ConfirmationSchema.parse(c);
      const existing = result.get(confirmation.tx_hash) ?? [];
      existing.push(confirmation);
      result.set(confirmation.tx_hash, existing);
    });

    return result;
  }

  async getDeposits(
    walletAddress: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<Deposit>> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    const limit = Math.min(options.limit ?? this.DEFAULT_LIMIT, this.MAX_LIMIT);
    const offset = options.offset ?? 0;

    const { data, error, count } = await client
      .from('deposits')
      .select('*', { count: 'exact' })
      .eq('wallet_address', validatedWallet.toLowerCase())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    const deposits = (data ?? []).map((d: unknown) => DepositSchema.parse(d));
    const total = count ?? 0;

    return {
      data: deposits,
      total,
      hasMore: offset + deposits.length < total,
    };
  }
}
