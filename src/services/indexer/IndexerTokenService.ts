import { supabase } from '../../config/supabase';
import {
  TokenSchema,
  TokenTransferSchema,
  type Token,
  type TokenTransfer,
} from '../../types/database';
import { validateAddress } from '../utils/TransactionErrorHandler';
import type { PaginationOptions, PaginatedResult } from './IndexerTransactionService';

export class IndexerTokenService {
  private readonly DEFAULT_LIMIT = 50;
  private readonly MAX_LIMIT = 100;
  private readonly NFT_TRANSFER_LIMIT = 500;

  private ensureClient() {
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }
    return supabase;
  }

  /**
   * Get all tokens that have had transfers involving this wallet.
   */
  async getTokensForWallet(walletAddress: string): Promise<Token[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    // Use server-side DISTINCT via RPC to avoid fetching all transfer rows.
    const { data: rows, error: transferError } = await client
      .rpc('get_wallet_token_addresses', { p_wallet_address: validatedWallet.toLowerCase() });

    if (transferError) throw new Error(`Indexer query failed: ${transferError.message}`);

    const uniqueAddresses = (rows ?? []).map((r: { token_address: string }) => r.token_address.toLowerCase());
    if (uniqueAddresses.length === 0) return [];

    // Fetch token metadata for those addresses
    const { data, error } = await client
      .from('tokens')
      .select('*')
      .in('address', uniqueAddresses);

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    return (data ?? []).map((t: unknown) => TokenSchema.parse(t));
  }

  /**
   * Get token transfer history for a wallet, optionally filtered by token address.
   */
  async getTokenTransfers(
    walletAddress: string,
    options: PaginationOptions & { tokenAddress?: string } = {}
  ): Promise<PaginatedResult<TokenTransfer>> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);
    const limit = Math.min(options.limit ?? this.DEFAULT_LIMIT, this.MAX_LIMIT);
    const offset = options.offset ?? 0;

    let query = client
      .from('token_transfers')
      .select('*', { count: 'exact' })
      .eq('wallet_address', validatedWallet.toLowerCase())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (options.tokenAddress) {
      query = query.eq('token_address', options.tokenAddress.toLowerCase());
    }

    const { data, error, count } = await query;

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    const transfers = (data ?? []).map((t: unknown) => TokenTransferSchema.parse(t));
    const total = count ?? 0;

    return {
      data: transfers,
      total,
      hasMore: offset + transfers.length < total,
    };
  }

  /**
   * Get token metadata for multiple addresses in a single query.
   * Returns a map of lowercase address → Token for found tokens.
   */
  async getTokensByAddresses(addresses: string[]): Promise<Map<string, Token>> {
    const result = new Map<string, Token>();
    if (addresses.length === 0) return result;

    const client = this.ensureClient();
    const lowered = addresses.map(a => a.toLowerCase());

    const { data, error } = await client
      .from('tokens')
      .select('*')
      .in('address', lowered);

    if (error) {
      console.warn('[IndexerTokenService] Batch token lookup failed:', error.message);
      return result;
    }

    for (const raw of data ?? []) {
      const token = TokenSchema.parse(raw);
      result.set(token.address.toLowerCase(), token);
    }
    return result;
  }

  /**
   * Get all ERC721 token transfers for a wallet, to derive current NFT holdings.
   * Returns transfers ordered by block_number DESC so the first occurrence of each
   * (token_address, token_id) pair represents the most recent transfer.
   */
  async getErc721TransfersForWallet(
    walletAddress: string,
    erc721TokenAddresses: string[]
  ): Promise<TokenTransfer[]> {
    if (erc721TokenAddresses.length === 0) return [];

    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('token_transfers')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .in('token_address', erc721TokenAddresses.map(a => a.toLowerCase()))
      .not('token_id', 'is', null)
      .order('block_number', { ascending: false })
      .limit(this.NFT_TRANSFER_LIMIT);

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    return (data ?? []).map((t: unknown) => TokenTransferSchema.parse(t));
  }

  /**
   * Get all ERC1155 token transfers for a wallet, to derive current holdings.
   * The indexer fans out TransferBatch events into individual rows, so the
   * query pattern is identical to ERC721.
   */
  async getErc1155TransfersForWallet(
    walletAddress: string,
    erc1155TokenAddresses: string[]
  ): Promise<TokenTransfer[]> {
    if (erc1155TokenAddresses.length === 0) return [];

    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('token_transfers')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .in('token_address', erc1155TokenAddresses.map(a => a.toLowerCase()))
      .not('token_id', 'is', null)
      .order('block_number', { ascending: false })
      .limit(this.NFT_TRANSFER_LIMIT);

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    return (data ?? []).map((t: unknown) => TokenTransferSchema.parse(t));
  }

  /**
   * Get a single token's metadata by address.
   */
  async getTokenByAddress(tokenAddress: string): Promise<Token | null> {
    const client = this.ensureClient();

    const { data, error } = await client
      .from('tokens')
      .select('*')
      .eq('address', tokenAddress.toLowerCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    return TokenSchema.parse(data);
  }
}
