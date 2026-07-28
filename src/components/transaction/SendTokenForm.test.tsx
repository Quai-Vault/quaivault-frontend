import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SendTokenForm } from './SendTokenForm';
import { useTokenBalances } from '../../hooks/useTokenBalances';

vi.mock('../../hooks/useTokenBalances', () => ({
  useTokenBalances: vi.fn(),
}));

const WALLET = '0x1234567890123456789012345678901234567890';
const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECIPIENT = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function setTokens(present: boolean) {
  vi.mocked(useTokenBalances).mockReturnValue({
    tokens: present ? [{ address: TOKEN, standard: 'ERC20', name: 'Test Token' }] : [],
    erc20Balances: present
      ? [{ tokenAddress: TOKEN, symbol: 'TT', decimals: 18, balance: '1000000000000000000' }]
      : [],
    isLoadingTokens: false,
    isLoadingBalances: false,
  } as unknown as ReturnType<typeof useTokenBalances>);
}

function setup(props: { initialToken?: string } = {}) {
  const spies = {
    onToChange: vi.fn(),
    onValueChange: vi.fn(),
    onDataChange: vi.fn(),
    onTokenMetadataChange: vi.fn(),
    onRecipientChange: vi.fn(),
    onAmountChange: vi.fn(),
  };
  render(<SendTokenForm walletAddress={WALLET} {...spies} {...props} />);
  return spies;
}

describe('SendTokenForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deep-linked token', () => {
    it('selects the token when the vault holds it', () => {
      setTokens(true);

      const { onTokenMetadataChange } = setup({ initialToken: TOKEN });

      expect(onTokenMetadataChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ address: TOKEN, symbol: 'TT' })
      );
    });

    // A deep link can name a token the vault does not hold; it must not stick.
    it('clears the selection when the token is not available', () => {
      setTokens(true);

      const { onTokenMetadataChange } = setup({
        initialToken: '0xcccccccccccccccccccccccccccccccccccccccc',
      });

      expect(onTokenMetadataChange).toHaveBeenLastCalledWith(null);
    });

    it('reports no selection without a deep link', () => {
      setTokens(true);

      const { onTokenMetadataChange } = setup();

      expect(onTokenMetadataChange).toHaveBeenLastCalledWith(null);
    });
  });

  describe('calldata', () => {
    it('is blank until token, recipient and amount are all set', () => {
      setTokens(true);

      const { onToChange, onValueChange, onDataChange } = setup({ initialToken: TOKEN });

      expect(onToChange).toHaveBeenLastCalledWith('');
      expect(onValueChange).toHaveBeenLastCalledWith('0');
      expect(onDataChange).toHaveBeenLastCalledWith('0x');
    });

    it('targets the token contract once every field is filled', async () => {
      const user = userEvent.setup();
      setTokens(true);

      const { onToChange, onValueChange, onDataChange } = setup({ initialToken: TOKEN });

      const [recipientBox, amountBox] = screen.getAllByRole('textbox');
      await user.type(recipientBox, RECIPIENT);
      await user.type(amountBox, '0.5');

      expect(onToChange).toHaveBeenLastCalledWith(TOKEN);
      expect(onValueChange).toHaveBeenLastCalledWith('0');
      expect(onDataChange).toHaveBeenLastCalledWith('0xENCODED');
    });

    it('stays blank for a malformed recipient', async () => {
      const user = userEvent.setup();
      setTokens(true);

      const { onDataChange } = setup({ initialToken: TOKEN });

      const [recipientBox, amountBox] = screen.getAllByRole('textbox');
      await user.type(recipientBox, 'not-an-address');
      await user.type(amountBox, '0.5');

      expect(onDataChange).toHaveBeenLastCalledWith('0x');
    });
  });

  it('reports empty recipient and amount on mount', () => {
    setTokens(true);

    const { onRecipientChange, onAmountChange } = setup();

    expect(onRecipientChange).toHaveBeenLastCalledWith('');
    expect(onAmountChange).toHaveBeenLastCalledWith('');
  });
});
