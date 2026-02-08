import { NETWORK_CONFIG } from '../config/contracts';

/**
 * Get block explorer URL for Quai Network
 * Uses VITE_BLOCK_EXPLORER_URL environment variable or defaults from NETWORK_CONFIG
 */
export function getBlockExplorerUrl(): string {
  const url = NETWORK_CONFIG.BLOCK_EXPLORER_URL;
  if (!url.startsWith('https://')) {
    console.error('Block explorer URL must use HTTPS');
    return 'https://quaiscan.io';
  }
  return url;
}

/**
 * Get transaction URL on block explorer
 */
export function getTransactionUrl(txHash: string): string {
  const baseUrl = getBlockExplorerUrl();
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get address URL on block explorer
 */
export function getAddressUrl(address: string): string {
  const baseUrl = getBlockExplorerUrl();
  return `${baseUrl}/address/${address}`;
}

/**
 * Open transaction in block explorer (new tab)
 */
export function openTransactionInExplorer(txHash: string): void {
  const url = getTransactionUrl(txHash);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Open address in block explorer (new tab)
 */
export function openAddressInExplorer(address: string): void {
  const url = getAddressUrl(address);
  window.open(url, '_blank', 'noopener,noreferrer');
}
