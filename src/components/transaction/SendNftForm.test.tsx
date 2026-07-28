import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SendNftForm } from './SendNftForm';
import { useNftHoldings } from '../../hooks/useNftHoldings';

vi.mock('../../hooks/useNftHoldings', () => ({
  useNftHoldings: vi.fn(),
}));

const WALLET = '0x1234567890123456789012345678901234567890';
const COLLECTION = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function holding(tokenId: string) {
  return {
    tokenAddress: COLLECTION,
    tokenId,
    collectionName: 'Test Collection',
    collectionSymbol: 'TEST',
    metadata: { image: null },
  };
}

function setHoldings(holdings: ReturnType<typeof holding>[]) {
  vi.mocked(useNftHoldings).mockReturnValue({
    holdings,
    isLoading: false,
    isLoadingMetadata: false,
  } as unknown as ReturnType<typeof useNftHoldings>);
}

function setup(props: { initialToken?: string; initialTokenId?: string } = {}) {
  const spies = {
    onToChange: vi.fn(),
    onValueChange: vi.fn(),
    onDataChange: vi.fn(),
    onNftMetadataChange: vi.fn(),
    onRecipientChange: vi.fn(),
  };
  render(<SendNftForm walletAddress={WALLET} {...spies} {...props} />);
  return spies;
}

describe('SendNftForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deep-linked selection', () => {
    it('selects the NFT when it is in holdings', () => {
      setHoldings([holding('7')]);

      const { onNftMetadataChange } = setup({ initialToken: COLLECTION, initialTokenId: '7' });

      expect(onNftMetadataChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ tokenAddress: COLLECTION, tokenId: '7' })
      );
    });

    it('matches case-insensitively on the collection address', () => {
      setHoldings([holding('7')]);

      const { onNftMetadataChange } = setup({
        initialToken: COLLECTION.toUpperCase().replace('0X', '0x'),
        initialTokenId: '7',
      });

      expect(onNftMetadataChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ tokenId: '7' })
      );
    });

    // The vault may not hold the deep-linked NFT — the selection must not stick.
    it('clears the selection when the NFT is absent from holdings', () => {
      setHoldings([holding('7')]);

      const { onNftMetadataChange } = setup({ initialToken: COLLECTION, initialTokenId: '999' });

      expect(onNftMetadataChange).toHaveBeenLastCalledWith(null);
    });

    it('reports no selection when there is no deep link', () => {
      setHoldings([holding('7')]);

      const { onNftMetadataChange } = setup();

      expect(onNftMetadataChange).toHaveBeenLastCalledWith(null);
    });
  });

  describe('calldata', () => {
    it('is blank while no NFT and recipient are chosen', () => {
      setHoldings([holding('7')]);

      const { onToChange, onValueChange, onDataChange } = setup();

      expect(onToChange).toHaveBeenLastCalledWith('');
      expect(onValueChange).toHaveBeenLastCalledWith('0');
      expect(onDataChange).toHaveBeenLastCalledWith('0x');
    });

    it('stays blank with an NFT selected but no recipient', () => {
      setHoldings([holding('7')]);

      const { onDataChange } = setup({ initialToken: COLLECTION, initialTokenId: '7' });

      expect(onDataChange).toHaveBeenLastCalledWith('0x');
    });
  });

  it('reports an empty recipient on mount', () => {
    setHoldings([holding('7')]);

    const { onRecipientChange } = setup();

    expect(onRecipientChange).toHaveBeenLastCalledWith('');
  });
});
