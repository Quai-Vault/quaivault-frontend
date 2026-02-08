import { formatQuai, parseQuai } from 'quais';

export class TransactionBuilderService {
  /**
   * Parse transaction value from string
   */
  parseValue(value: string): bigint {
    try {
      // Normalize leading decimal (e.g. ".01" → "0.01") for parseQuai compatibility
      let normalized = value.trim();
      if (normalized.startsWith('.')) {
        normalized = '0' + normalized;
      }
      return parseQuai(normalized);
    } catch (error) {
      throw new Error(`Invalid value format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Format value for display
   */
  formatValue(value: bigint, decimals: number = 4): string {
    return parseFloat(formatQuai(value)).toFixed(decimals);
  }
}

// Singleton instance
export const transactionBuilderService = new TransactionBuilderService();
