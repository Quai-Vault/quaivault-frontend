import { describe, it, expect, vi } from 'vitest';
import {
  getBlockExplorerUrl,
  getTransactionUrl,
  getAddressUrl,
  openTransactionInExplorer,
  openAddressInExplorer,
} from './blockExplorer';

describe('blockExplorer', () => {
  describe('getBlockExplorerUrl', () => {
    it('should return the configured block explorer URL', () => {
      const url = getBlockExplorerUrl();
      expect(url).toBe('https://quaiscan.io');
    });
  });

  describe('getTransactionUrl', () => {
    it('should return correct transaction URL', () => {
      const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const url = getTransactionUrl(txHash);

      expect(url).toBe(`https://quaiscan.io/tx/${txHash}`);
    });
  });

  describe('getAddressUrl', () => {
    it('should return correct address URL', () => {
      const address = '0x1234567890123456789012345678901234567890';
      const url = getAddressUrl(address);

      expect(url).toBe(`https://quaiscan.io/address/${address}`);
    });
  });

  describe('openTransactionInExplorer', () => {
    it('should open transaction in new tab', () => {
      const windowOpenSpy = vi.spyOn(window, 'open');
      const txHash = '0xabcdef';

      openTransactionInExplorer(txHash);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        `https://quaiscan.io/tx/${txHash}`,
        '_blank',
        'noopener,noreferrer'
      );
    });
  });

  describe('openAddressInExplorer', () => {
    it('should open address in new tab', () => {
      const windowOpenSpy = vi.spyOn(window, 'open');
      const address = '0x1234567890123456789012345678901234567890';

      openAddressInExplorer(address);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        `https://quaiscan.io/address/${address}`,
        '_blank',
        'noopener,noreferrer'
      );
    });
  });
});
