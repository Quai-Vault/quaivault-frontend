import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignMessageForm } from './SignMessageForm';

// The browser modal pulls in indexer queries; it is not under test here.
vi.mock('./SignedMessageBrowser', () => ({
  SignedMessageBrowser: () => null,
}));

vi.mock('../../services/TransactionBuilderService', () => ({
  transactionBuilderService: {
    buildSignMessage: vi.fn(() => '0xSIGNED'),
    buildUnsignMessage: vi.fn(() => '0xUNSIGNED'),
  },
}));

const WALLET = '0x1234567890123456789012345678901234567890';

function setup() {
  const onToChange = vi.fn();
  const onValueChange = vi.fn();
  const onDataChange = vi.fn();
  render(
    <SignMessageForm
      walletAddress={WALLET}
      onToChange={onToChange}
      onValueChange={onValueChange}
      onDataChange={onDataChange}
    />
  );
  return { onToChange, onValueChange, onDataChange };
}

const messageBox = () => screen.getByRole('textbox');

describe('SignMessageForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty message', () => {
    it('clears the parent target, value and calldata', () => {
      const { onToChange, onValueChange, onDataChange } = setup();

      expect(onToChange).toHaveBeenCalledWith('');
      expect(onValueChange).toHaveBeenCalledWith('0');
      expect(onDataChange).toHaveBeenCalledWith('0x');
    });

    it('shows no message hash', () => {
      setup();

      expect(screen.queryByText(/Message Hash/i)).not.toBeInTheDocument();
    });
  });

  describe('valid text message', () => {
    it('targets the vault and forwards the encoded calldata', async () => {
      const user = userEvent.setup();
      const { onToChange, onValueChange, onDataChange } = setup();

      await user.type(messageBox(), 'hello');

      expect(onToChange).toHaveBeenLastCalledWith(WALLET);
      expect(onValueChange).toHaveBeenLastCalledWith('0');
      expect(onDataChange).toHaveBeenLastCalledWith('0xSIGNED');
    });

    it('shows the message hash', async () => {
      const user = userEvent.setup();
      setup();

      await user.type(messageBox(), 'hello');

      expect(screen.getByText(/Message Hash/i)).toBeInTheDocument();
    });

    it('encodes an unsign when that action is selected', async () => {
      const user = userEvent.setup();
      const { onDataChange } = setup();

      await user.click(screen.getByRole('button', { name: /Unsign Message/i }));
      await user.type(messageBox(), 'hello');

      expect(onDataChange).toHaveBeenLastCalledWith('0xUNSIGNED');
    });
  });

  describe('invalid input', () => {
    it('reports an over-long message and blanks the calldata', async () => {
      const user = userEvent.setup();
      const { onDataChange } = setup();

      // Typing 10k characters is far too slow; paste instead.
      await user.click(messageBox());
      await user.paste('x'.repeat(10_001));

      expect(await screen.findByText(/Message too long/i)).toBeInTheDocument();
      expect(onDataChange).toHaveBeenLastCalledWith('0x');
    });

    it('reports a malformed hex message in hex mode', async () => {
      const user = userEvent.setup();
      const { onDataChange } = setup();

      await user.click(screen.getByRole('button', { name: /^Hex$/i }));
      await user.type(messageBox(), 'not-hex');

      expect(await screen.findByText(/Invalid hex string/i)).toBeInTheDocument();
      expect(onDataChange).toHaveBeenLastCalledWith('0x');
    });

    it('clears the error once the message becomes valid again', async () => {
      const user = userEvent.setup();
      setup();

      await user.click(screen.getByRole('button', { name: /^Hex$/i }));
      await user.type(messageBox(), 'zz');
      expect(await screen.findByText(/Invalid hex string/i)).toBeInTheDocument();

      await user.clear(messageBox());
      await user.type(messageBox(), '0xabcd');

      expect(screen.queryByText(/Invalid hex string/i)).not.toBeInTheDocument();
    });
  });

  it('clears the message when switching input format', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(messageBox(), 'hello');
    expect(messageBox()).toHaveValue('hello');

    await user.click(screen.getByRole('button', { name: /^Hex$/i }));

    expect(messageBox()).toHaveValue('');
  });
});
