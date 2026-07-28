import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionFlow } from './TransactionFlow';

describe('TransactionFlow', () => {
  // Never settles, so the flow stays mid-execution and the header stays mounted.
  const pendingExecute = () => new Promise<string>(() => {});

  const defaultProps = {
    onExecute: pendingExecute,
    onComplete: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('header', () => {
    it('renders the title as a heading when provided', () => {
      render(<TransactionFlow {...defaultProps} title="Cancel Transaction" />);

      expect(
        screen.getByRole('heading', { name: 'Cancel Transaction' })
      ).toBeInTheDocument();
    });

    it('renders the description when provided', () => {
      render(
        <TransactionFlow
          {...defaultProps}
          description="You are cancelling transaction 0x1234ab..."
        />
      );

      expect(
        screen.getByText('You are cancelling transaction 0x1234ab...')
      ).toBeInTheDocument();
    });

    it('renders a description without a title', () => {
      // Modal-wrapped callers omit `title` so the modal header isn't duplicated,
      // but still pass a description.
      render(
        <TransactionFlow {...defaultProps} description="You are executing transaction 0xabc..." />
      );

      expect(screen.getByText('You are executing transaction 0xabc...')).toBeInTheDocument();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('renders no header at all when both are omitted', () => {
      render(<TransactionFlow {...defaultProps} />);

      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      // The flow itself still renders.
      expect(
        screen.getByText('Please approve the transaction in your wallet')
      ).toBeInTheDocument();
    });
  });

  it('still shows progress alongside the header', () => {
    render(
      <TransactionFlow
        {...defaultProps}
        title="Remove Owner"
        description="Removing owner 0xabcdef01..."
      />
    );

    expect(screen.getByRole('heading', { name: 'Remove Owner' })).toBeInTheDocument();
    expect(screen.getByText('Removing owner 0xabcdef01...')).toBeInTheDocument();
    expect(
      screen.getByText('Please approve the transaction in your wallet')
    ).toBeInTheDocument();
  });
});
