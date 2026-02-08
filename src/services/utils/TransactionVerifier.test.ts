import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyTransactionOnChain, verifyTransactionsBatch, needsVerification } from './TransactionVerifier';
import type { IndexerTransaction } from '../../types/database';

// Mock MultisigService
vi.mock('../MultisigService', () => ({
  multisigService: {
    getTransaction: vi.fn(),
  },
}));

import { multisigService } from '../MultisigService';

const WALLET = '0x1234567890123456789012345678901234567890';

function makeIndexerTx(overrides: Partial<IndexerTransaction> = {}): IndexerTransaction {
  return {
    id: '1',
    wallet_address: WALLET.toLowerCase(),
    tx_hash: '0xabc123',
    to_address: '0xrecipient0000000000000000000000000000000',
    value: '1000000000000000000',
    data: '0x',
    transaction_type: 'transfer',
    decoded_params: null,
    status: 'pending',
    confirmation_count: 1,
    submitted_by: '0xsubmitter000000000000000000000000000000',
    submitted_at_block: 100,
    submitted_at_tx: '0xtx1',
    executed_at_block: null,
    executed_at_tx: null,
    executed_by: null,
    cancelled_at_block: null,
    cancelled_at_tx: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('TransactionVerifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyTransactionOnChain', () => {
    it('should return verified when on-chain data matches indexer', async () => {
      const indexerTx = makeIndexerTx();
      vi.mocked(multisigService.getTransaction).mockResolvedValue({
        to: indexerTx.to_address,
        value: BigInt(indexerTx.value),
        data: '0x',
        executed: false,
        numApprovals: 1,
      });

      const result = await verifyTransactionOnChain(WALLET, indexerTx);

      expect(result.verified).toBe(true);
      expect(result.discrepancies).toHaveLength(0);
    });

    it('should detect recipient mismatch', async () => {
      const indexerTx = makeIndexerTx();
      vi.mocked(multisigService.getTransaction).mockResolvedValue({
        to: '0xDIFFERENT00000000000000000000000000000000',
        value: BigInt(indexerTx.value),
        data: '0x',
        executed: false,
        numApprovals: 1,
      });

      const result = await verifyTransactionOnChain(WALLET, indexerTx);

      expect(result.verified).toBe(false);
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0]).toContain('Recipient mismatch');
    });

    it('should detect value mismatch', async () => {
      const indexerTx = makeIndexerTx();
      vi.mocked(multisigService.getTransaction).mockResolvedValue({
        to: indexerTx.to_address,
        value: BigInt('999'),
        data: '0x',
        executed: false,
        numApprovals: 1,
      });

      const result = await verifyTransactionOnChain(WALLET, indexerTx);

      expect(result.verified).toBe(false);
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0]).toContain('Value mismatch');
    });

    it('should detect data mismatch', async () => {
      const indexerTx = makeIndexerTx({ data: '0xabcdef' });
      vi.mocked(multisigService.getTransaction).mockResolvedValue({
        to: indexerTx.to_address,
        value: BigInt(indexerTx.value),
        data: '0x112233',
        executed: false,
        numApprovals: 1,
      });

      const result = await verifyTransactionOnChain(WALLET, indexerTx);

      expect(result.verified).toBe(false);
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0]).toContain('data mismatch');
    });

    it('should detect execution status mismatch', async () => {
      const indexerTx = makeIndexerTx({ status: 'executed' });
      vi.mocked(multisigService.getTransaction).mockResolvedValue({
        to: indexerTx.to_address,
        value: BigInt(indexerTx.value),
        data: '0x',
        executed: false,
        numApprovals: 1,
      });

      const result = await verifyTransactionOnChain(WALLET, indexerTx);

      expect(result.verified).toBe(false);
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0]).toContain('Execution status mismatch');
    });

    it('should detect multiple discrepancies at once', async () => {
      const indexerTx = makeIndexerTx({ status: 'executed' });
      vi.mocked(multisigService.getTransaction).mockResolvedValue({
        to: '0xDIFFERENT00000000000000000000000000000000',
        value: BigInt('0'),
        data: '0xdifferent',
        executed: false,
        numApprovals: 1,
      });

      const result = await verifyTransactionOnChain(WALLET, indexerTx);

      expect(result.verified).toBe(false);
      expect(result.discrepancies.length).toBeGreaterThanOrEqual(3);
    });

    it('should treat null indexer data as 0x', async () => {
      const indexerTx = makeIndexerTx({ data: null });
      vi.mocked(multisigService.getTransaction).mockResolvedValue({
        to: indexerTx.to_address,
        value: BigInt(indexerTx.value),
        data: '0x',
        executed: false,
        numApprovals: 1,
      });

      const result = await verifyTransactionOnChain(WALLET, indexerTx);

      expect(result.verified).toBe(true);
    });

    it('should return unverified with error message on blockchain failure', async () => {
      vi.mocked(multisigService.getTransaction).mockRejectedValue(
        new Error('Network timeout')
      );

      const result = await verifyTransactionOnChain(WALLET, makeIndexerTx());

      expect(result.verified).toBe(false);
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0]).toContain('Failed to verify');
      expect(result.discrepancies[0]).toContain('Network timeout');
    });

    it('should handle non-Error thrown objects', async () => {
      vi.mocked(multisigService.getTransaction).mockRejectedValue('string error');

      const result = await verifyTransactionOnChain(WALLET, makeIndexerTx());

      expect(result.verified).toBe(false);
      expect(result.discrepancies[0]).toContain('Unknown error');
    });
  });

  describe('verifyTransactionsBatch', () => {
    it('should verify multiple transactions in parallel', async () => {
      const tx1 = makeIndexerTx({ tx_hash: '0xhash1' });
      const tx2 = makeIndexerTx({ tx_hash: '0xhash2' });

      vi.mocked(multisigService.getTransaction).mockResolvedValue({
        to: tx1.to_address,
        value: BigInt(tx1.value),
        data: '0x',
        executed: false,
        numApprovals: 1,
      });

      const results = await verifyTransactionsBatch(WALLET, [tx1, tx2]);

      expect(results.size).toBe(2);
      expect(results.get('0xhash1')?.verified).toBe(true);
      expect(results.get('0xhash2')?.verified).toBe(true);
    });

    it('should handle empty array', async () => {
      const results = await verifyTransactionsBatch(WALLET, []);

      expect(results.size).toBe(0);
    });

    it('should handle mixed success and failure', async () => {
      const tx1 = makeIndexerTx({ tx_hash: '0xhash1' });
      const tx2 = makeIndexerTx({ tx_hash: '0xhash2' });

      vi.mocked(multisigService.getTransaction)
        .mockResolvedValueOnce({
          to: tx1.to_address,
          value: BigInt(tx1.value),
          data: '0x',
          executed: false,
          numApprovals: 1,
        })
        .mockRejectedValueOnce(new Error('Failed'));

      const results = await verifyTransactionsBatch(WALLET, [tx1, tx2]);

      expect(results.get('0xhash1')?.verified).toBe(true);
      expect(results.get('0xhash2')?.verified).toBe(false);
    });
  });

  describe('needsVerification', () => {
    it('should return true for pending unverified transaction', () => {
      const tx = makeIndexerTx({ status: 'pending' });

      expect(needsVerification(tx, new Set())).toBe(true);
    });

    it('should return false for executed transaction', () => {
      const tx = makeIndexerTx({ status: 'executed' });

      expect(needsVerification(tx, new Set())).toBe(false);
    });

    it('should return false for cancelled transaction', () => {
      const tx = makeIndexerTx({ status: 'cancelled' });

      expect(needsVerification(tx, new Set())).toBe(false);
    });

    it('should return false for already verified transaction', () => {
      const tx = makeIndexerTx({ tx_hash: '0xverified' });

      expect(needsVerification(tx, new Set(['0xverified']))).toBe(false);
    });

    it('should return true for pending transaction not in verified set', () => {
      const tx = makeIndexerTx({ tx_hash: '0xunverified', status: 'pending' });

      expect(needsVerification(tx, new Set(['0xother']))).toBe(true);
    });
  });
});
