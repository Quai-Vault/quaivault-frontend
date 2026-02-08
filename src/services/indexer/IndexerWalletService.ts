import { supabase, INDEXER_CONFIG } from '../../config/supabase';
import { WalletSchema, WalletOwnerSchema, type Wallet, type WalletOwner } from '../../types/database';
import { validateAddress } from '../utils/TransactionErrorHandler';

export class IndexerWalletService {
  private ensureClient() {
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }
    return supabase;
  }

  async getWalletsForOwner(ownerAddress: string): Promise<Wallet[]> {
    const client = this.ensureClient();
    const validatedOwner = validateAddress(ownerAddress);

    const { data, error } = await client
      .from('wallet_owners')
      .select(`
        wallet_address,
        wallets (*)
      `)
      .eq('owner_address', validatedOwner.toLowerCase())
      .eq('is_active', true)
      .limit(100);

    if (error) {
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    // Validate each wallet against schema
    const wallets = (data ?? [])
      .map((row: { wallet_address: string; wallets: unknown }) => row.wallets)
      .filter(Boolean)
      .map((wallet: unknown) => {
        try {
          return WalletSchema.parse(wallet);
        } catch {
          return null;
        }
      })
      .filter((w): w is Wallet => w !== null);

    return wallets;
  }

  async getWalletDetails(walletAddress: string): Promise<Wallet | null> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('wallets')
      .select('*')
      .eq('address', validatedWallet.toLowerCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    return WalletSchema.parse(data);
  }

  async getWalletOwners(walletAddress: string): Promise<string[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('wallet_owners')
      .select('owner_address')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('is_active', true);

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    return (data ?? []).map((row: { owner_address: string }) => row.owner_address);
  }

  async getWalletOwnersDetailed(walletAddress: string): Promise<WalletOwner[]> {
    const client = this.ensureClient();
    const validatedWallet = validateAddress(walletAddress);

    const { data, error } = await client
      .from('wallet_owners')
      .select('*')
      .eq('wallet_address', validatedWallet.toLowerCase())
      .eq('is_active', true);

    if (error) throw new Error(`Indexer query failed: ${error.message}`);

    return (data ?? []).map((owner: unknown) => WalletOwnerSchema.parse(owner));
  }

  async getWalletsForGuardian(guardianAddress: string): Promise<Wallet[]> {
    const client = this.ensureClient();
    const validatedGuardian = validateAddress(guardianAddress);

    const { data, error } = await client
      .from('social_recovery_guardians')
      .select(`
        wallet_address,
        wallets (*)
      `)
      .eq('guardian_address', validatedGuardian.toLowerCase())
      .eq('is_active', true)
      .limit(100);

    if (error) {
      throw new Error(`Indexer query failed: ${error.message}`);
    }

    // Validate each wallet against schema
    const wallets = (data ?? [])
      .map((row: { wallet_address: string; wallets: unknown }) => row.wallets)
      .filter(Boolean)
      .map((wallet: unknown) => {
        try {
          return WalletSchema.parse(wallet);
        } catch {
          return null;
        }
      })
      .filter((w): w is Wallet => w !== null);

    return wallets;
  }
}
