import { formatQuai, formatUnits, Interface } from 'quais';
import { CONTRACT_ADDRESSES } from '../config/contracts';
import { formatAddress, formatDuration } from './formatting';
import QuaiVaultABI from '../config/abi/QuaiVault.json';
import type { TokenMetadata } from '../services/utils/ContractMetadataService';

export type TransactionType =
  | 'transfer'
  | 'erc20_transfer'
  | 'erc721_transfer'
  | 'erc1155_transfer'
  | 'erc1155_batch_transfer'
  | 'addOwner'
  | 'removeOwner'
  | 'changeThreshold'
  | 'enableModule'
  | 'disableModule'
  | 'moduleConfig'
  | 'walletAdmin'
  | 'contractCall';

export interface DecodedTransaction {
  type: TransactionType;
  description: string;
  details?: string;
  icon: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

// Known module addresses mapped to human-readable names
const MODULE_NAMES: Record<string, string> = {};
let moduleNamesInitialized = false;

// Build the mapping dynamically from config (addresses may be empty if not configured)
export function getModuleName(address: string): string | null {
  // Lazily populate on first call (env vars are available at import time via Vite)
  if (!moduleNamesInitialized) {
    moduleNamesInitialized = true;
    if (CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE) {
      MODULE_NAMES[CONTRACT_ADDRESSES.SOCIAL_RECOVERY_MODULE.toLowerCase()] = 'Social Recovery';
    }
  }
  return MODULE_NAMES[address.toLowerCase()] || null;
}

// Module function ABIs for decoding calls to known modules
const MODULE_FUNCTION_ABIS = [
  'function setupRecovery(address wallet, address[] guardians, uint256 threshold, uint256 recoveryPeriod)',
];

// Module function descriptions
const MODULE_FUNCTION_DESCRIPTIONS: Record<string, (args: any[]) => string> = {
  setupRecovery: (args) => {
    const guardianCount = args[1]?.length ?? '?';
    const threshold = String(args[2] ?? '?');
    return `Configure recovery: ${guardianCount} guardians, ${threshold} required`;
  },
};

// Hoisted Interface instances (expensive to construct, ABIs are static)
const moduleInterface = new Interface(MODULE_FUNCTION_ABIS);
const quaiVaultInterface = new Interface(QuaiVaultABI.abi);

// Standard ERC20/ERC721 ABIs for decoding external contract calls
const erc20Interface = new Interface([
  'function transfer(address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
]);

const erc721Interface = new Interface([
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
  'function approve(address to, uint256 tokenId)',
  'function setApprovalForAll(address operator, bool approved)',
]);

const erc1155Interface = new Interface([
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)',
  'function setApprovalForAll(address operator, bool approved)',
]);

function decodeModuleCall(data: string): { name: string; description: string } | null {
  try {
    const iface = moduleInterface;
    const decoded = iface.parseTransaction({ data });
    if (!decoded) return null;

    const describer = MODULE_FUNCTION_DESCRIPTIONS[decoded.name];
    const description = describer ? describer(decoded.args) : decoded.name;
    return { name: decoded.name, description };
  } catch (error) {
    console.debug('Module call decode failed:', error instanceof Error ? error.message : 'Unknown');
    return null;
  }
}

/**
 * Format a raw token amount using token metadata when available.
 * Returns a human-readable string like "0.5 WQI" or falls back to the raw value.
 */
function formatTokenAmount(raw: string | bigint, tokenMeta?: TokenMetadata | null): string {
  if (!tokenMeta?.decimals) return String(raw);
  try {
    const formatted = parseFloat(formatUnits(BigInt(raw), tokenMeta.decimals)).toFixed(
      tokenMeta.decimals > 4 ? 4 : tokenMeta.decimals,
    );
    return tokenMeta.symbol ? `${formatted} ${tokenMeta.symbol}` : formatted;
  } catch {
    return String(raw);
  }
}

export function decodeTransaction(
  tx: { to: string; value: string; data: string; transactionType?: string; decodedParams?: Record<string, unknown> | null },
  walletAddress: string,
  tokenMeta?: TokenMetadata | null,
): DecodedTransaction {
  // ERC20 transfer (indexer-provided type)
  // Handle common alternative field names from indexer decoded_params
  // If all params resolve to '?', fall through to calldata-based decoding below
  if (tx.transactionType === 'erc20_transfer' && tx.decodedParams) {
    const params = tx.decodedParams;
    const rawAmount = params.amount ?? params.value ?? params._value ?? params._amount;
    const rawTo = params.to ?? params.recipient ?? params._to ?? params.dst;
    const amount = rawAmount != null ? formatTokenAmount(String(rawAmount), tokenMeta) : null;
    const to = rawTo ? formatAddress(String(rawTo)) : null;

    // Only use indexer params if we actually got at least one useful value
    if (amount || to) {
      const spender = params.spender ?? params._spender;
      if (spender) {
        return {
          type: 'erc20_transfer',
          description: 'Token Approval',
          details: `Approve ${formatAddress(String(spender))} to spend ${amount ?? '?'} tokens`,
          icon: '🔓',
          bgColor: 'bg-amber-900',
          borderColor: 'border-amber-700',
          textColor: 'text-amber-200',
        };
      }

      const from = params.from ?? params._from ?? params.sender;
      if (from) {
        return {
          type: 'erc20_transfer',
          description: 'Token Transfer',
          details: `Transfer ${amount ?? '?'} tokens from ${formatAddress(String(from))} to ${to ?? '?'}`,
          icon: '🪙',
          bgColor: 'bg-yellow-900',
          borderColor: 'border-yellow-700',
          textColor: 'text-yellow-200',
        };
      }

      return {
        type: 'erc20_transfer',
        description: 'Token Transfer',
        details: `Send ${amount ?? '?'} tokens to ${to ?? '?'}`,
        icon: '🪙',
        bgColor: 'bg-yellow-900',
        borderColor: 'border-yellow-700',
        textColor: 'text-yellow-200',
      };
    }
    // If no useful params found, fall through to calldata decoding
  }

  // ERC721 transfer (indexer-provided type)
  if (tx.transactionType === 'erc721_transfer' && tx.decodedParams) {
    const params = tx.decodedParams;
    const from = params.from ? formatAddress(String(params.from)) : null;
    const to = params.to ? formatAddress(String(params.to)) : null;
    const tokenId = params.tokenId ?? params.token_id;

    if (from || to || tokenId != null) {
      return {
        type: 'erc721_transfer',
        description: 'NFT Transfer',
        details: `Transfer NFT #${tokenId ?? '?'} from ${from ?? '?'} to ${to ?? '?'}`,
        icon: '🖼️',
        bgColor: 'bg-purple-900',
        borderColor: 'border-purple-700',
        textColor: 'text-purple-200',
      };
    }
    // Fall through to calldata decoding if no useful params
  }

  // ERC1155 transfer (indexer-provided type)
  if (tx.transactionType === 'erc1155_transfer' && tx.decodedParams) {
    const params = tx.decodedParams;
    const from = params.from ? formatAddress(String(params.from)) : null;
    const to = params.to ? formatAddress(String(params.to)) : null;
    const tokenId = params.tokenId ?? params.token_id;
    const amount = params.amount ?? params.value;

    if (from || to || tokenId != null) {
      return {
        type: 'erc1155_transfer',
        description: 'ERC1155 Transfer',
        details: `Transfer ${amount != null ? `${amount}x ` : ''}Token #${tokenId ?? '?'} from ${from ?? '?'} to ${to ?? '?'}`,
        icon: '🎭',
        bgColor: 'bg-violet-900',
        borderColor: 'border-violet-700',
        textColor: 'text-violet-200',
      };
    }
  }

  // Plain transfer
  if (tx.data === '0x' || tx.data === '') {
    return {
      type: 'transfer',
      description: 'Transfer QUAI',
      details: `${parseFloat(formatQuai(tx.value)).toFixed(4)} QUAI`,
      icon: '💸',
      bgColor: 'bg-primary-900',
      borderColor: 'border-primary-700',
      textColor: 'text-primary-200',
    };
  }

  // Self-call (wallet calling itself) - owner/module management
  if (tx.to.toLowerCase() === walletAddress.toLowerCase()) {
    try {
      const decoded = quaiVaultInterface.parseTransaction({ data: tx.data });

      if (!decoded) {
        return {
          type: 'contractCall',
          description: 'Contract Call',
          details: 'Unknown function',
          icon: '📄',
          bgColor: 'bg-dark-400',
          borderColor: 'border-dark-500',
          textColor: 'text-dark-900',
        };
      }

      switch (decoded.name) {
        case 'cancelByConsensus': {
          const targetHash = decoded.args?.[0] ? String(decoded.args[0]) : '?';
          return {
            type: 'contractCall',
            description: 'Cancel by Consensus',
            details: `Cancel transaction ${targetHash.slice(0, 10)}...`,
            icon: '🚫',
            bgColor: 'bg-red-900',
            borderColor: 'border-red-700',
            textColor: 'text-red-200',
          };
        }
        case 'setMinExecutionDelay': {
          const delay = decoded.args?.[0] != null ? Number(decoded.args[0]) : 0;
          return {
            type: 'contractCall',
            description: 'Set Timelock',
            details: delay > 0
              ? `Set minimum execution delay to ${formatDuration(delay)}`
              : 'Remove minimum execution delay',
            icon: '⏱️',
            bgColor: 'bg-blue-900',
            borderColor: 'border-blue-700',
            textColor: 'text-blue-200',
          };
        }
        case 'addDelegatecallTarget': {
          const target = decoded.args[0] as string;
          return {
            type: 'walletAdmin' as const,
            description: 'Whitelist DelegateCall Target',
            details: `Allow DelegateCall to ${target}`,
            icon: '🔓',
            bgColor: 'bg-green-100 dark:bg-green-900/30',
            textColor: 'text-green-800 dark:text-green-300',
            borderColor: 'border-green-300 dark:border-green-700/50',
          };
        }
        case 'removeDelegatecallTarget': {
          const target = decoded.args[0] as string;
          return {
            type: 'walletAdmin' as const,
            description: 'Remove DelegateCall Target',
            details: `Revoke DelegateCall permission for ${target}`,
            icon: '🔒',
            bgColor: 'bg-orange-100 dark:bg-orange-900/30',
            textColor: 'text-orange-800 dark:text-orange-300',
            borderColor: 'border-orange-300 dark:border-orange-700/50',
          };
        }
        case 'signMessage': {
          return {
            type: 'contractCall',
            description: 'Sign Message',
            details: 'Sign a message on behalf of the wallet (EIP-1271)',
            icon: '✍️',
            bgColor: 'bg-indigo-900',
            borderColor: 'border-indigo-700',
            textColor: 'text-indigo-200',
          };
        }
        case 'unsignMessage': {
          return {
            type: 'contractCall',
            description: 'Unsign Message',
            details: 'Revoke a previously signed message',
            icon: '✍️',
            bgColor: 'bg-orange-900',
            borderColor: 'border-orange-700',
            textColor: 'text-orange-200',
          };
        }
        case 'addOwner': {
          if (!decoded.args || decoded.args.length < 1) {
            return {
              type: 'addOwner',
              description: 'Add Owner',
              details: 'Invalid arguments',
              icon: '➕',
              bgColor: 'bg-green-900',
              borderColor: 'border-green-700',
              textColor: 'text-green-200',
            };
          }
          const ownerAddress = String(decoded.args[0]);
          return {
            type: 'addOwner',
            description: 'Add Owner',
            details: `Add ${formatAddress(ownerAddress)} as owner`,
            icon: '➕',
            bgColor: 'bg-green-900',
            borderColor: 'border-green-700',
            textColor: 'text-green-200',
          };
        }
        case 'removeOwner': {
          if (!decoded.args || decoded.args.length < 1) {
            return {
              type: 'removeOwner',
              description: 'Remove Owner',
              details: 'Invalid arguments',
              icon: '➖',
              bgColor: 'bg-red-900',
              borderColor: 'border-red-700',
              textColor: 'text-red-200',
            };
          }
          const ownerAddress = String(decoded.args[0]);
          return {
            type: 'removeOwner',
            description: 'Remove Owner',
            details: `Remove ${formatAddress(ownerAddress)} as owner`,
            icon: '➖',
            bgColor: 'bg-red-900',
            borderColor: 'border-red-700',
            textColor: 'text-red-200',
          };
        }
        case 'changeThreshold': {
          if (!decoded.args || decoded.args.length < 1) {
            return {
              type: 'changeThreshold',
              description: 'Change Threshold',
              details: 'Invalid arguments',
              icon: '🔢',
              bgColor: 'bg-blue-900',
              borderColor: 'border-blue-700',
              textColor: 'text-blue-200',
            };
          }
          const newThreshold = decoded.args[0];
          return {
            type: 'changeThreshold',
            description: 'Change Threshold',
            details: `Set threshold to ${String(newThreshold)}`,
            icon: '🔢',
            bgColor: 'bg-blue-900',
            borderColor: 'border-blue-700',
            textColor: 'text-blue-200',
          };
        }
        case 'enableModule': {
          if (!decoded.args || decoded.args.length < 1) {
            return {
              type: 'enableModule',
              description: 'Enable Module',
              details: 'Invalid arguments',
              icon: '🔌',
              bgColor: 'bg-emerald-900',
              borderColor: 'border-emerald-700',
              textColor: 'text-emerald-200',
            };
          }
          const moduleAddress = String(decoded.args[0]);
          const moduleName = getModuleName(moduleAddress);
          return {
            type: 'enableModule',
            description: 'Enable Module',
            details: moduleName
              ? `Enable ${moduleName} module`
              : `Enable module ${formatAddress(moduleAddress)}`,
            icon: '🔌',
            bgColor: 'bg-emerald-900',
            borderColor: 'border-emerald-700',
            textColor: 'text-emerald-200',
          };
        }
        case 'disableModule': {
          if (!decoded.args || decoded.args.length < 2) {
            return {
              type: 'disableModule',
              description: 'Disable Module',
              details: 'Invalid arguments',
              icon: '🔌',
              bgColor: 'bg-orange-900',
              borderColor: 'border-orange-700',
              textColor: 'text-orange-200',
            };
          }
          // disableModule(prevModule, module) - second arg is the module being disabled
          const moduleAddress = String(decoded.args[1]);
          const moduleName = getModuleName(moduleAddress);
          return {
            type: 'disableModule',
            description: 'Disable Module',
            details: moduleName
              ? `Disable ${moduleName} module`
              : `Disable module ${formatAddress(moduleAddress)}`,
            icon: '🔌',
            bgColor: 'bg-orange-900',
            borderColor: 'border-orange-700',
            textColor: 'text-orange-200',
          };
        }
        default:
          return {
            type: 'contractCall',
            description: 'Wallet Operation',
            details: decoded.name,
            icon: '📄',
            bgColor: 'bg-dark-400',
            borderColor: 'border-dark-500',
            textColor: 'text-dark-900',
          };
      }
    } catch (error) {
      console.error('Failed to decode transaction:', error);
      return {
        type: 'contractCall',
        description: 'Contract Call',
        details: 'Unable to decode',
        icon: '📄',
        bgColor: 'bg-dark-400',
        borderColor: 'border-dark-500',
        textColor: 'text-dark-900',
      };
    }
  }

  // Call to a known module address — try to decode the module function
  const moduleName = getModuleName(tx.to);
  if (moduleName) {
    const moduleCall = decodeModuleCall(tx.data);
    if (moduleCall) {
      return {
        type: 'moduleConfig',
        description: `${moduleName} Module`,
        details: moduleCall.description,
        icon: '⚙️',
        bgColor: 'bg-purple-900',
        borderColor: 'border-purple-700',
        textColor: 'text-purple-200',
      };
    }

    // Known module but couldn't decode the specific function
    return {
      type: 'moduleConfig',
      description: `${moduleName} Module`,
      details: `Configure ${moduleName}`,
      icon: '⚙️',
      bgColor: 'bg-purple-900',
      borderColor: 'border-purple-700',
      textColor: 'text-purple-200',
    };
  }

  // Try to decode as ERC20 call from raw calldata
  if (tx.data && tx.data.length > 10) {
    try {
      const decoded = erc20Interface.parseTransaction({ data: tx.data });
      if (decoded) {
        if (decoded.name === 'transfer') {
          const to = formatAddress(String(decoded.args[0]));
          const amount = formatTokenAmount(decoded.args[1], tokenMeta);
          return {
            type: 'erc20_transfer',
            description: 'Token Transfer',
            details: `Send ${amount} to ${to}`,
            icon: '🪙',
            bgColor: 'bg-yellow-900',
            borderColor: 'border-yellow-700',
            textColor: 'text-yellow-200',
          };
        }
        if (decoded.name === 'approve') {
          const spender = formatAddress(String(decoded.args[0]));
          const amount = formatTokenAmount(decoded.args[1], tokenMeta);
          return {
            type: 'erc20_transfer',
            description: 'Token Approval',
            details: `Approve ${spender} to spend ${amount}`,
            icon: '🔓',
            bgColor: 'bg-amber-900',
            borderColor: 'border-amber-700',
            textColor: 'text-amber-200',
          };
        }
        if (decoded.name === 'transferFrom') {
          const from = formatAddress(String(decoded.args[0]));
          const to = formatAddress(String(decoded.args[1]));
          const amount = formatTokenAmount(decoded.args[2], tokenMeta);
          return {
            type: 'erc20_transfer',
            description: 'Token Transfer',
            details: `Transfer ${amount} from ${from} to ${to}`,
            icon: '🪙',
            bgColor: 'bg-yellow-900',
            borderColor: 'border-yellow-700',
            textColor: 'text-yellow-200',
          };
        }
      }
    } catch {
      // Not an ERC20 call — try ERC721
    }

    try {
      const decoded = erc721Interface.parseTransaction({ data: tx.data });
      if (decoded) {
        if (decoded.name === 'transferFrom' || decoded.name === 'safeTransferFrom') {
          const from = formatAddress(String(decoded.args[0]));
          const to = formatAddress(String(decoded.args[1]));
          const tokenId = String(decoded.args[2]);
          return {
            type: 'erc721_transfer',
            description: 'NFT Transfer',
            details: `Transfer NFT #${tokenId} from ${from} to ${to}`,
            icon: '🖼️',
            bgColor: 'bg-purple-900',
            borderColor: 'border-purple-700',
            textColor: 'text-purple-200',
          };
        }
        if (decoded.name === 'approve') {
          const approved = formatAddress(String(decoded.args[0]));
          const tokenId = String(decoded.args[1]);
          return {
            type: 'erc721_transfer',
            description: 'NFT Approval',
            details: `Approve ${approved} for NFT #${tokenId}`,
            icon: '🔓',
            bgColor: 'bg-amber-900',
            borderColor: 'border-amber-700',
            textColor: 'text-amber-200',
          };
        }
        if (decoded.name === 'setApprovalForAll') {
          const operator = formatAddress(String(decoded.args[0]));
          const approved = decoded.args[1] ? 'approve' : 'revoke';
          return {
            type: 'erc721_transfer',
            description: 'NFT Approval',
            details: `${approved === 'approve' ? 'Approve' : 'Revoke'} ${operator} for all NFTs`,
            icon: '🔓',
            bgColor: 'bg-amber-900',
            borderColor: 'border-amber-700',
            textColor: 'text-amber-200',
          };
        }
      }
    } catch {
      // Not an ERC721 call either
    }

    // Try to decode as ERC1155 call
    try {
      const decoded = erc1155Interface.parseTransaction({ data: tx.data });
      if (decoded) {
        if (decoded.name === 'safeTransferFrom') {
          const from = formatAddress(String(decoded.args[0]));
          const to = formatAddress(String(decoded.args[1]));
          const tokenId = String(decoded.args[2]);
          const amount = String(decoded.args[3]);
          return {
            type: 'erc1155_transfer',
            description: 'ERC1155 Transfer',
            details: `Transfer ${amount}x Token #${tokenId} from ${from} to ${to}`,
            icon: '🎭',
            bgColor: 'bg-violet-900',
            borderColor: 'border-violet-700',
            textColor: 'text-violet-200',
          };
        }
        if (decoded.name === 'safeBatchTransferFrom') {
          const from = formatAddress(String(decoded.args[0]));
          const to = formatAddress(String(decoded.args[1]));
          const ids: unknown[] = decoded.args[2];
          const amounts: unknown[] = decoded.args[3];
          const itemCount = ids.length;
          const totalAmount = amounts.reduce((sum: bigint, a: unknown) => sum + BigInt(String(a)), 0n);
          return {
            type: 'erc1155_batch_transfer',
            description: 'ERC1155 Batch Transfer',
            details: `Transfer ${itemCount} token types (${totalAmount} total) from ${from} to ${to}`,
            icon: '🎭',
            bgColor: 'bg-violet-900',
            borderColor: 'border-violet-700',
            textColor: 'text-violet-200',
          };
        }
        if (decoded.name === 'setApprovalForAll') {
          const operator = formatAddress(String(decoded.args[0]));
          const approved = decoded.args[1] ? 'approve' : 'revoke';
          return {
            type: 'erc1155_transfer',
            description: 'ERC1155 Approval',
            details: `${approved === 'approve' ? 'Approve' : 'Revoke'} ${operator} for all tokens`,
            icon: '🔓',
            bgColor: 'bg-amber-900',
            borderColor: 'border-amber-700',
            textColor: 'text-amber-200',
          };
        }
      }
    } catch {
      // Not an ERC1155 call either
    }
  }

  // External contract call (unknown function)
  return {
    type: 'contractCall',
    description: 'Contract Call',
    details: `Call to ${formatAddress(tx.to)}`,
    icon: '📄',
    bgColor: 'bg-dark-400',
    borderColor: 'border-dark-500',
    textColor: 'text-dark-900',
  };
}
