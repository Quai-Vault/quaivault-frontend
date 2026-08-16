import { Contract } from 'quais';
import { daoShipsSupabase, DAO_SHIPS_CONFIG } from '../config/daoShips';
import { NETWORK_CONFIG } from '../config/contracts';
import { getActiveProvider } from '../config/provider';
import {
  DaoShipSummarySchema,
  DaoShipsIndexerStateSchema,
  type DaoShipDisplay,
  type DaoShipsIndexerState,
  type DaoShipSummary,
  type Untrusted,
} from '../types/daoShips';
import { validateAddress } from './utils/TransactionErrorHandler';

const DAO_SHIP_READ_ABI = [
  'function avatar() view returns (address)',
  'function multisendLibrary() view returns (address)',
] as const;
const VAULT_DELEGATECALL_READ_ABI = [
  'function delegatecallAllowed(address target) view returns (bool)',
] as const;

const DAO_SELECT = [
  'id', 'avatar', 'launcher_contract', 'new_vault', 'created_at', 'updated_at', 'tx_hash',
  'name', 'description', 'avatar_img', 'profile_source',
  'share_token_name', 'share_token_symbol', 'loot_token_name', 'loot_token_symbol',
  'voting_period', 'grace_period', 'proposal_offering', 'quorum_percent',
  'sponsor_threshold', 'min_retention_percent', 'default_expiry_window',
  'active_member_count', 'proposal_count', 'total_shares', 'total_loot',
].join(',');

export interface DaoDetailsResult {
  details: Untrusted<DaoShipSummary>[];
  state: DaoShipsIndexerState;
  isStale: boolean;
}

export interface DaoShipVerification {
  avatarMatches: boolean;
  multisendLibrary: string | null;
  delegatecallAllowed: boolean | null;
}

function stripUnsafeDisplayCharacters(value: string, maxLength: number): string | null {
  // Remove controls and bidi overrides that can visually reorder an address or label.
  const cleaned = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return !(
        code <= 0x1f
        || (code >= 0x7f && code <= 0x9f)
        || code === 0x061c
        || code === 0x200e
        || code === 0x200f
        || (code >= 0x202a && code <= 0x202e)
        || (code >= 0x2066 && code <= 0x2069)
      );
    })
    .join('')
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}

function safeAvatarUrl(value?: string | null): string | null {
  if (!value) return null;

  let candidate = value.trim();
  if (candidate.startsWith('ipfs://')) {
    const path = candidate.slice('ipfs://'.length).replace(/^ipfs\//, '');
    if (!/^[a-zA-Z0-9]+(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%-]+)*$/.test(path)) return null;
    const gateway = NETWORK_CONFIG.IPFS_GATEWAY || 'https://ipfs.qu.ai';
    candidate = `${gateway.replace(/\/$/, '')}/ipfs/${path}`;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return null;
    const allowedHosts = new Set([
      'ipfs.io',
      'ipfs.qu.ai',
      new URL(NETWORK_CONFIG.IPFS_GATEWAY || 'https://ipfs.qu.ai').hostname,
      new URL(NETWORK_CONFIG.NFT_IPFS_GATEWAY || 'https://ipfs.io').hostname,
    ]);
    return allowedHosts.has(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Convert explicitly untrusted profile fields into render-safe display text. */
export function toDaoShipDisplay(dao: Untrusted<DaoShipSummary>): DaoShipDisplay {
  return {
    id: dao.id.toLowerCase(),
    name: dao.name ? stripUnsafeDisplayCharacters(dao.name, 80) : null,
    description: dao.description ? stripUnsafeDisplayCharacters(dao.description, 240) : null,
    avatarUrl: safeAvatarUrl(dao.avatar_img),
    profileSource: dao.profile_source,
  };
}

export class DaoShipsService {
  private ensureClient() {
    if (!daoShipsSupabase) throw new Error('DAO Ships indexer is not configured');
    return daoShipsSupabase;
  }

  /**
   * Resolve only known module addresses by primary key, then require the
   * indexed avatar to match the vault. Never discover DAOs by avatar alone.
   */
  async getDaoDetailsForModules(
    vaultAddress: string,
    moduleAddresses: string[]
  ): Promise<DaoDetailsResult> {
    const client = this.ensureClient();
    const vault = validateAddress(vaultAddress).toLowerCase();
    const modules = Array.from(new Set(moduleAddresses.map((address) =>
      validateAddress(address).toLowerCase()
    ))).slice(0, 100);

    const { data: stateData, error: stateError } = await client
      .from('ds_indexer_state')
      .select('last_block_number,last_indexed_at,chain_id,is_syncing,requires_full_reindex')
      .eq('id', 1)
      .maybeSingle();

    if (stateError) throw new Error(`DAO Ships indexer state failed: ${stateError.message}`);
    const state = DaoShipsIndexerStateSchema.parse(stateData);
    if (state.chain_id !== DAO_SHIPS_CONFIG.EXPECTED_CHAIN_ID) {
      throw new Error(
        `DAO Ships indexer chain mismatch (${state.chain_id}, expected ${DAO_SHIPS_CONFIG.EXPECTED_CHAIN_ID})`
      );
    }
    if (state.requires_full_reindex) {
      throw new Error('DAO Ships indexer requires a full reindex');
    }

    if (modules.length === 0) {
      return { details: [], state, isStale: this.isStale(state) };
    }

    const chunks: string[][] = [];
    for (let index = 0; index < modules.length; index += DAO_SHIPS_CONFIG.QUERY_CHUNK_SIZE) {
      chunks.push(modules.slice(index, index + DAO_SHIPS_CONFIG.QUERY_CHUNK_SIZE));
    }

    const results = await Promise.all(chunks.map((chunk) =>
      client
        .from('ds_daos')
        .select(DAO_SELECT)
        .in('id', chunk)
        .eq('avatar', vault)
    ));

    const details: Untrusted<DaoShipSummary>[] = [];
    for (const result of results) {
      if (result.error) throw new Error(`DAO Ships details query failed: ${result.error.message}`);
      for (const row of result.data ?? []) {
        const parsed = DaoShipSummarySchema.safeParse(row);
        if (parsed.success) {
          details.push(parsed.data as Untrusted<DaoShipSummary>);
        } else {
          console.warn('[DaoShipsService] Ignoring malformed DAO row:', parsed.error.message);
        }
      }
    }

    return { details, state, isStale: this.isStale(state) };
  }

  /** Verify a DAOShip's vault binding and execution dependency on-chain. */
  async verifyDaoShip(vaultAddress: string, moduleAddress: string): Promise<DaoShipVerification> {
    const vault = validateAddress(vaultAddress);
    const module = validateAddress(moduleAddress);
    const provider = getActiveProvider();
    const daoShip = new Contract(module, DAO_SHIP_READ_ABI, provider);
    const avatar = String(await daoShip.avatar());

    if (avatar.toLowerCase() !== vault.toLowerCase()) {
      return { avatarMatches: false, multisendLibrary: null, delegatecallAllowed: null };
    }

    try {
      const multisendLibrary = String(await daoShip.multisendLibrary());
      const vaultContract = new Contract(vault, VAULT_DELEGATECALL_READ_ABI, provider);
      const delegatecallAllowed = Boolean(await vaultContract.delegatecallAllowed(multisendLibrary));
      return { avatarMatches: true, multisendLibrary, delegatecallAllowed };
    } catch (error) {
      // The avatar binding is the identity check. A secondary dependency read
      // failure should degrade readiness, not erase a successfully verified DAO.
      console.warn('[DAO Ships] Multisend readiness check failed:', error);
      return { avatarMatches: true, multisendLibrary: null, delegatecallAllowed: null };
    }
  }

  private isStale(state: DaoShipsIndexerState): boolean {
    if (state.is_syncing || !state.last_indexed_at) return true;
    const timestamp = Date.parse(state.last_indexed_at);
    return !Number.isFinite(timestamp) || Date.now() - timestamp > DAO_SHIPS_CONFIG.STALE_AFTER_MS;
  }
}

export const daoShipsService = new DaoShipsService();
