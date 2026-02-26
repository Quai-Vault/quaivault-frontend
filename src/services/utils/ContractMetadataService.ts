import { JsonRpcProvider, Interface, Contract as QuaisContract, getAddress } from 'quais';
import { decode, AuxdataStyle } from '@ethereum-sourcify/bytecode-utils';
import { NETWORK_CONFIG, CONTRACT_ADDRESSES } from '../../config/contracts';
import QuaiVaultABI from '../../config/abi/QuaiVault.json';
import QuaiVaultFactoryABI from '../../config/abi/QuaiVaultFactory.json';
import SocialRecoveryModuleABI from '../../config/abi/SocialRecoveryModule.json';
import DailyLimitModuleABI from '../../config/abi/DailyLimitModule.json';
import WhitelistModuleABI from '../../config/abi/WhitelistModule.json';
import MultiSendABI from '../../config/abi/MultiSend.json';

const IPFS_GATEWAY = NETWORK_CONFIG.IPFS_GATEWAY;
const FETCH_TIMEOUT_MS = 10000;
const MAX_PROXY_DEPTH = 5;

// EIP-1967 implementation storage slot
const EIP_1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

// Known contract ABIs keyed by lowercase address
const KNOWN_ABIS: Record<string, { abi: any[]; name: string }> = {};

function registerKnownAbi(address: string | undefined, abi: { abi: any[] }, name: string) {
  if (address) {
    KNOWN_ABIS[address.toLowerCase()] = { abi: abi.abi, name };
  }
}

registerKnownAbi(CONTRACT_ADDRESSES.QUAIVAULT_IMPLEMENTATION, QuaiVaultABI, 'QuaiVault');
registerKnownAbi(CONTRACT_ADDRESSES.QUAIVAULT_FACTORY, QuaiVaultFactoryABI, 'QuaiVault Factory');
registerKnownAbi(CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE, SocialRecoveryModuleABI, 'Social Recovery');
registerKnownAbi(CONTRACT_ADDRESSES.DAILY_LIMIT_MODULE, DailyLimitModuleABI, 'Daily Limit');
registerKnownAbi(CONTRACT_ADDRESSES.WHITELIST_MODULE, WhitelistModuleABI, 'Whitelist');
registerKnownAbi(CONTRACT_ADDRESSES.MULTISEND, MultiSendABI, 'MultiSend');

export interface AbiResult {
  abi: any[] | null;
  source: 'ipfs' | 'explorer' | 'known' | null;
}

interface CacheEntry {
  isContract: boolean;
  abi: any[] | null;
  source: 'ipfs' | 'explorer' | 'known' | null;
}

const provider = new JsonRpcProvider(
  NETWORK_CONFIG.RPC_URL,
  undefined,
  { usePathing: true }
);

const cache = new Map<string, CacheEntry>();

/**
 * Check if an address is a deployed contract.
 */
export async function isContract(address: string): Promise<boolean> {
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) return cached.isContract;

  const checksummed = getAddress(address);
  try {
    const code = await provider.getCode(checksummed);
    const result = code !== '0x' && code !== '0x0' && code.length > 2;
    cache.set(key, { isContract: result, abi: null, source: null });
    return result;
  } catch (e) {
    console.error('[ContractMetadata] getCode failed for', checksummed, e);
    throw e;
  }
}

/**
 * Fetch the ABI for a contract address, trying multiple sources.
 */
export async function fetchAbi(address: string): Promise<AbiResult> {
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached?.abi) return { abi: cached.abi, source: cached.source };

  // Step 1: Known contracts
  const known = KNOWN_ABIS[key];
  if (known) {
    updateCache(key, known.abi, 'known');
    return { abi: known.abi, source: 'known' };
  }

  // Step 2: IPFS via bytecode CBOR metadata
  const ipfsResult = await fetchAbiFromIpfs(address);
  if (ipfsResult) {
    updateCache(key, ipfsResult, 'ipfs');
    return { abi: ipfsResult, source: 'ipfs' };
  }

  // Step 3: Quaiscan API fallback
  const explorerResult = await fetchAbiFromExplorer(address);
  if (explorerResult) {
    updateCache(key, explorerResult, 'explorer');
    return { abi: explorerResult, source: 'explorer' };
  }

  // Step 4: Nothing found
  updateCache(key, null, null);
  return { abi: null, source: null };
}

function updateCache(key: string, abi: any[] | null, source: 'ipfs' | 'explorer' | 'known' | null) {
  const existing = cache.get(key);
  cache.set(key, {
    isContract: existing?.isContract ?? true,
    abi,
    source,
  });
}

/**
 * Fetch ABI from IPFS via bytecode CBOR metadata (Pelagus pattern).
 * Handles proxy contracts by recursing into implementation addresses.
 */
async function fetchAbiFromIpfs(address: string, depth = 0): Promise<any[] | null> {
  if (depth >= MAX_PROXY_DEPTH) return null;

  try {
    const checksummed = getAddress(address);
    const bytecode = await provider.getCode(checksummed);
    if (!bytecode || bytecode === '0x' || bytecode.length <= 2) return null;

    // Check for EIP-1167 minimal proxy
    const implAddress = detectMinimalProxy(bytecode);
    if (implAddress) {
      return fetchAbiFromIpfs(implAddress, depth + 1);
    }

    // Decode CBOR metadata from bytecode
    const metadata = decode(bytecode, AuxdataStyle.SOLIDITY);
    if (!metadata.ipfs) {
      console.warn('[ContractMetadata] No IPFS CID in bytecode metadata for', checksummed);
      return null;
    }

    // Fetch metadata JSON from IPFS
    const url = `${IPFS_GATEWAY}/ipfs/${metadata.ipfs}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      console.warn('[ContractMetadata] IPFS fetch failed:', response.status, url);
      return null;
    }

    const metadataJson = await response.json();
    const abi = metadataJson?.output?.abi;
    if (!abi || !Array.isArray(abi)) {
      console.warn('[ContractMetadata] No ABI in IPFS metadata for', checksummed);
      return null;
    }

    // Validate the ABI parses correctly
    Interface.from(abi);

    // Check if this looks like a proxy contract (EIP-1967)
    if (looksLikeProxy(abi)) {
      const implAddr = await getEip1967Implementation(checksummed);
      if (implAddr) {
        const implAbi = await fetchAbiFromIpfs(implAddr, depth + 1);
        if (implAbi) return implAbi;
      }
    }

    return abi;
  } catch (e) {
    console.warn('[ContractMetadata] IPFS ABI fetch failed for', address, e);
    return null;
  }
}

/**
 * Detect EIP-1167 minimal proxy pattern and extract implementation address.
 * Pattern: 363d3d373d3d3d363d73<20-byte-addr>5af43d82803e903d91602b57fd5bf3
 */
function detectMinimalProxy(bytecode: string): string | null {
  const normalized = bytecode.toLowerCase().replace('0x', '');
  // Standard EIP-1167 is 45 bytes (90 hex chars)
  if (normalized.length !== 90) return null;

  const prefix = '363d3d373d3d3d363d73';
  const suffix = '5af43d82803e903d91602b57fd5bf3';
  if (normalized.startsWith(prefix) && normalized.endsWith(suffix)) {
    return '0x' + normalized.slice(prefix.length, prefix.length + 40);
  }
  return null;
}

/**
 * Check if an ABI looks like a proxy contract.
 */
function looksLikeProxy(abi: any[]): boolean {
  const proxyMethods = ['upgradeTo', 'upgradeToAndCall', 'implementation'];
  const methodNames = abi
    .filter((item: any) => item.type === 'function')
    .map((item: any) => item.name);
  return proxyMethods.some(m => methodNames.includes(m));
}

/**
 * Read EIP-1967 implementation storage slot.
 */
async function getEip1967Implementation(proxyAddress: string): Promise<string | null> {
  try {
    const slot = await provider.getStorage(getAddress(proxyAddress), EIP_1967_IMPL_SLOT);
    if (!slot || slot === '0x' || slot === '0x' + '0'.repeat(64)) return null;
    // Address is in the last 20 bytes (40 hex chars) of the 32-byte slot
    return '0x' + slot.slice(-40);
  } catch {
    return null;
  }
}

// --- Contract type detection ---

export type ContractType = 'erc20' | 'erc721' | 'generic';

/**
 * Detect whether an ABI represents an ERC20 or ERC721 contract.
 */
export function detectContractType(abi: any[]): ContractType {
  const functionNames = new Set(
    abi
      .filter((item: any) => item.type === 'function')
      .map((item: any) => item.name)
  );

  // ERC721: has ownerOf + safeTransferFrom (distinguishes from ERC20)
  const erc721Markers = ['ownerOf', 'safeTransferFrom', 'approve', 'setApprovalForAll'];
  if (erc721Markers.every((m) => functionNames.has(m))) {
    return 'erc721';
  }

  // ERC20: has transfer + balanceOf + approve (and NOT ownerOf)
  const erc20Markers = ['transfer', 'balanceOf', 'approve', 'totalSupply'];
  if (erc20Markers.every((m) => functionNames.has(m)) && !functionNames.has('ownerOf')) {
    return 'erc20';
  }

  return 'generic';
}

// --- Token metadata ---

export interface TokenMetadata {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
}

const ERC20_METADATA_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const tokenMetadataCache = new Map<string, TokenMetadata>();

/**
 * Fetch ERC20 token metadata (name, symbol, decimals) from the contract.
 */
export async function fetchTokenMetadata(address: string): Promise<TokenMetadata> {
  const key = address.toLowerCase();
  const cached = tokenMetadataCache.get(key);
  if (cached) return cached;

  const contract = new QuaisContract(getAddress(address), ERC20_METADATA_ABI, provider);
  const [name, symbol, decimals] = await Promise.allSettled([
    contract.name() as Promise<string>,
    contract.symbol() as Promise<string>,
    contract.decimals() as Promise<bigint>,
  ]);

  const result: TokenMetadata = {
    name: name.status === 'fulfilled' ? name.value : null,
    symbol: symbol.status === 'fulfilled' ? symbol.value : null,
    decimals: decimals.status === 'fulfilled' ? Number(decimals.value) : null,
  };

  tokenMetadataCache.set(key, result);
  return result;
}

// --- On-chain balance/ownership checks ---

const ERC20_BALANCE_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
];

const ERC721_OWNER_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
];

/**
 * Fetch the ERC20 balance of a wallet for a specific token contract.
 * Returns the raw bigint balance, or null if the call fails.
 */
export async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string,
): Promise<bigint | null> {
  try {
    const contract = new QuaisContract(getAddress(tokenAddress), ERC20_BALANCE_ABI, provider);
    const balance: bigint = await contract.balanceOf(getAddress(walletAddress));
    return balance;
  } catch (e) {
    console.warn('[ContractMetadata] Failed to fetch ERC20 balance:', e);
    return null;
  }
}

/**
 * Check the owner of an ERC721 token.
 * Returns the owner address, or null if the call fails (token may not exist).
 */
export async function getNftOwner(
  tokenAddress: string,
  tokenId: string,
): Promise<string | null> {
  try {
    const contract = new QuaisContract(getAddress(tokenAddress), ERC721_OWNER_ABI, provider);
    const owner: string = await contract.ownerOf(tokenId);
    return owner;
  } catch (e) {
    console.warn('[ContractMetadata] Failed to fetch ERC721 ownerOf:', e);
    return null;
  }
}

/**
 * Fetch ABI from Quaiscan block explorer API.
 */
async function fetchAbiFromExplorer(address: string): Promise<any[] | null> {
  try {
    const url = `${NETWORK_CONFIG.BLOCK_EXPLORER_URL}/api?module=contract&action=getabi&address=${getAddress(address)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== '1' || !data.result) return null;

    const abi = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    if (!Array.isArray(abi)) return null;

    // Validate
    Interface.from(abi);
    return abi;
  } catch (e) {
    console.warn('[ContractMetadata] Explorer ABI fetch failed for', address, e);
    return null;
  }
}
