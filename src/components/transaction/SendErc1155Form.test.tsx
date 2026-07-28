import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SendErc1155Form } from './SendErc1155Form';
import { useErc1155Holdings } from '../../hooks/useErc1155Holdings';

vi.mock('../../hooks/useErc1155Holdings', () => ({
  useErc1155Holdings: vi.fn(),
}));

const WALLET = '0x1234567890123456789012345678901234567890';
const COLLECTION = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function holding(tokenId: string, quantity = '10') {
  return {
    tokenAddress: COLLECTION,
    tokenId,
    quantity,
    collectionName: 'Test Edition',
    collectionSymbol: 'TE',
    metadata: { image: null },
  };
}

function setHoldings(holdings: ReturnType<typeof holding>[]) {
  vi.mocked(useErc1155Holdings).mockReturnValue({
    holdings,
    isLoading: false,
    isLoadingMetadata: false,
  } as unknown as ReturnType<typeof useErc1155Holdings>);
}

function setup(props: { initialToken?: string; initialTokenId?: string } = {}) {
  const spies = {
    onToChange: vi.fn(),
    onValueChange: vi.fn(),
    onDataChange: vi.fn(),
    onErc1155MetadataChange: vi.fn(),
    onRecipientChange: vi.fn(),
    onQuantityChange: vi.fn(),
  };
  render(<SendErc1155Form walletAddress={WALLET} {...spies} {...props} />);
  return spies;
}

describe('SendErc1155Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deep-linked selection', () => {
    it('selects the item when the vault holds it', () => {
      setHoldings([holding('7')]);

      const { onErc1155MetadataChange } = setup({ initialToken: COLLECTION, initialTokenId: '7' });

      expect(onErc1155MetadataChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ tokenId: '7', balance: '10' })
      );
    });

    it('clears the selection when the item is absent from holdings', () => {
      setHoldings([holding('7')]);

      const { onErc1155MetadataChange } = setup({ initialToken: COLLECTION, initialTokenId: '999' });

      expect(onErc1155MetadataChange).toHaveBeenLastCalledWith(null);
    });
  });

  describe('quantity', () => {
    it('starts at 1', () => {
      setHoldings([holding('7')]);

      const { onQuantityChange } = setup({ initialToken: COLLECTION, initialTokenId: '7' });

      expect(onQuantityChange).toHaveBeenLastCalledWith('1');
    });

    it('resets to 1 when a different item is picked', async () => {
      const user = userEvent.setup();
      setHoldings([holding('7'), holding('8')]);

      const { onQuantityChange } = setup({ initialToken: COLLECTION, initialTokenId: '7' });

      const quantityBox = screen.getByRole('spinbutton');
      await user.clear(quantityBox);
      await user.type(quantityBox, '5');
      expect(onQuantityChange).toHaveBeenLastCalledWith('5');

      // Pick the other edition; the stale quantity must not carry over.
      await user.click(screen.getByText(/#8/));

      expect(onQuantityChange).toHaveBeenLastCalledWith('1');
    });
  });

  describe('calldata', () => {
    it('is blank without a recipient', () => {
      setHoldings([holding('7')]);

      const { onToChange, onValueChange, onDataChange } = setup({
        initialToken: COLLECTION,
        initialTokenId: '7',
      });

      expect(onToChange).toHaveBeenLastCalledWith('');
      expect(onValueChange).toHaveBeenLastCalledWith('0');
      expect(onDataChange).toHaveBeenLastCalledWith('0x');
    });

    it('stays blank when the quantity exceeds the held balance', async () => {
      const user = userEvent.setup();
      setHoldings([holding('7', '3')]);

      const { onDataChange } = setup({ initialToken: COLLECTION, initialTokenId: '7' });

      const recipientBox = screen.getByRole('textbox');
      await user.type(recipientBox, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

      const quantityBox = screen.getByRole('spinbutton');
      await user.clear(quantityBox);
      await user.type(quantityBox, '99');

      expect(onDataChange).toHaveBeenLastCalledWith('0x');
    });
  });
});
