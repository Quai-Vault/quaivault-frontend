import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionPreview } from './TransactionPreview';

// Shared across every Interface instance the component builds at module scope,
// so a test can decide what a given calldata decodes to. Hoisted because
// vi.mock is lifted above ordinary declarations.
const { parseTransaction } = vi.hoisted(() => ({ parseTransaction: vi.fn() }));

vi.mock('quais', () => ({
  Interface: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.parseTransaction = parseTransaction;
  }),
  formatQuai: vi.fn(() => '0'),
  parseQuai: vi.fn(() => 0n),
}));

vi.mock('../utils/transactionDecoder', () => ({
  decodeTransaction: vi.fn(() => ({
    type: 'contract_call',
    description: 'Contract Call',
    details: 'A call',
    icon: '>',
    bgColor: '',
    textColor: '',
    borderColor: '',
  })),
}));

vi.mock('../services/TransactionBuilderService', () => ({
  transactionBuilderService: {},
}));

const WALLET = '0x1234567890123456789012345678901234567890';
const CALLDATA = '0xabcdef0123456789';

function setup(data: string) {
  render(
    <TransactionPreview
      to={WALLET}
      value="0"
      data={data}
      walletAddress={WALLET}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

describe('TransactionPreview calldata decoding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseTransaction.mockReset();
  });

  it('shows the decoded function name and arguments when the ABI matches', () => {
    parseTransaction.mockReturnValue({ name: 'addOwner', args: ['0xNewOwner', 2] });

    setup(CALLDATA);

    expect(screen.getByText('Function Call:')).toBeInTheDocument();
    expect(screen.getByText('addOwner')).toBeInTheDocument();
    expect(screen.getByText(/0xNewOwner/)).toBeInTheDocument();
  });

  it('falls back to raw call data when nothing can decode it', () => {
    parseTransaction.mockReturnValue(null);

    setup(CALLDATA);

    expect(screen.queryByText('Function Call:')).not.toBeInTheDocument();
    expect(screen.getByText('Call Data:')).toBeInTheDocument();
    expect(screen.getByText(CALLDATA)).toBeInTheDocument();
  });

  it('falls back to raw call data when decoding throws', () => {
    parseTransaction.mockImplementation(() => {
      throw new Error('unknown selector');
    });

    setup(CALLDATA);

    expect(screen.queryByText('Function Call:')).not.toBeInTheDocument();
    expect(screen.getByText('Call Data:')).toBeInTheDocument();
  });

  it('shows neither section for an empty calldata', () => {
    setup('0x');

    expect(screen.queryByText('Function Call:')).not.toBeInTheDocument();
    expect(screen.queryByText('Call Data:')).not.toBeInTheDocument();
  });

  it('truncates very long call data', () => {
    parseTransaction.mockReturnValue(null);
    const long = '0x' + 'ab'.repeat(200);

    setup(long);

    expect(screen.getByText(`${long.slice(0, 100)}...`)).toBeInTheDocument();
  });
});
