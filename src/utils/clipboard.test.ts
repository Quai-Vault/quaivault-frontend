import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('clipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('copyToClipboard', () => {
    it('should copy text using navigator.clipboard', async () => {
      const text = 'test text to copy';
      const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

      const result = await copyToClipboard(text);

      expect(result).toBe(true);
      expect(writeTextSpy).toHaveBeenCalledWith(text);
    });

    it('should return false when clipboard API fails', async () => {
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Not supported'));

      const result = await copyToClipboard('test');

      expect(result).toBe(false);
    });

    it('should handle empty string', async () => {
      const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

      const result = await copyToClipboard('');

      expect(result).toBe(true);
      expect(writeTextSpy).toHaveBeenCalledWith('');
    });

    it('should handle long text', async () => {
      const longText = 'a'.repeat(10000);
      const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

      const result = await copyToClipboard(longText);

      expect(result).toBe(true);
      expect(writeTextSpy).toHaveBeenCalledWith(longText);
    });

    it('should handle special characters', async () => {
      const specialText = '!@#$%^&*()_+{}|:"<>?`~[]\\;\',./';
      const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

      const result = await copyToClipboard(specialText);

      expect(result).toBe(true);
      expect(writeTextSpy).toHaveBeenCalledWith(specialText);
    });
  });

});
