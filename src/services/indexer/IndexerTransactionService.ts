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
import type { TransactionStatus } from '../../types';

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}

/**
 * View added by indexer migration 001. Exposes `effective_status`, which reports
 * `expired` for pending rows past their deadline. Absent on schemas predating it.
 */
const TRANSACTIONS_EFFECTIVE_VIEW = 'transactions_effective';

/**
 * Does this error mean the relation isn't there?
 *
 * `42P01` is Postgres undefined_table; `PGRST205` is PostgREST failing to find it
 * in its schema cache. Matched narrowly on purpose — a broader match would swallow
 * genuine query failures and silently downgrade to stored-status bucketing.
 */
function isMissingRelationError(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

export class IndexerTransactionService {
  private readonly DEFAULT_LIMIT = 50;
  private readonly MAX_LIMIT = 100;

  /** Null until the first query tells us whether migration 001 is applied. */
  private effectiveViewAvailable: boolean | null = null;

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
      .in('status', ['executed', 'cancelled', 'expired', 'failed'])
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

  /**
   * Fetch transactions in a given lifecycle state, filtered and counted server-side.
   *
   * Reads `transactions_effective` so clock-expired transactions land in the
   * `expired` bucket. Expiry is a timestamp comparison on chain, not a state
   * transition — `expireTransaction` is a permissionless cleanup call that
   * frequently nobody makes, so a past-deadline row keeps `status = 'pending'`
   * indefinitely. The view resolves that at query time, which client-side
   * filtering cannot: a paginated query has to bucket rows before slicing them.
   *
   * Falls back to the base table when the view is absent (schema predating
   * indexer migration 001), which reverts to stored-status bucketing rather
   * than failing the query.
   */
  async getTransactionsByStatus(
    walletAddress: string,
    statuses: TransactionStatus[],
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<IndexerTransaction>> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    const limit = Math.min(options.limit ?? this.DEFAULT_LIMIT, this.MAX_LIMIT);
    const offset = options.offset ?? 0;

    if (statuses.length === 0) {
      return { data: [], total: 0, hasMore: false };
    }

    const query = (table: string, statusColumn: string) =>
      client
        .from(table)
        .select('*', { count: 'exact' })
        .eq('wallet_address', validatedWallet.toLowerCase())
        .in(statusColumn, statuses)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    let result;
    if (this.effectiveViewAvailable === false) {
      result = await query('transactions', 'status');
    } else {
      result = await query(TRANSACTIONS_EFFECTIVE_VIEW, 'effective_status');
      if (isMissingRelationError(result.error)) {
        // Latch so we stop probing a view that isn't coming back.
        this.effectiveViewAvailable = false;
        console.warn(
          `[IndexerTransactionService] ${TRANSACTIONS_EFFECTIVE_VIEW} not found — ` +
            'falling back to stored status. Past-deadline transactions will stay in ' +
            'the pending bucket until indexer migration 001 is applied.'
        );
        result = await query('transactions', 'status');
      } else if (!result.error) {
        this.effectiveViewAvailable = true;
      }
    }

    const { data, error, count } = result;
    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    const transactions = (data ?? []).map((tx: unknown) => TransactionSchema.parse(tx));
    const total = count ?? 0;

    return {
      data: transactions,
      total,
      hasMore: offset + transactions.length < total,
    };
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
