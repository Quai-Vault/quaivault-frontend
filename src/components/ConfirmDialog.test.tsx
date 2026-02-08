import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  describe('rendering', () => {
    it('should render dialog when isOpen is true', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
    });

    it('should not render dialog when isOpen is false', () => {
      render(<ConfirmDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
    });

    it('should render default button text', () => {
      render(<ConfirmDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('should render custom button text', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          confirmText="Delete"
          cancelText="Go Back"
        />
      );

      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go Back' })).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('should render danger variant with red button', () => {
      render(<ConfirmDialog {...defaultProps} variant="danger" />);

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toHaveClass('bg-red-600');
    });

    it('should render warning variant with yellow button', () => {
      render(<ConfirmDialog {...defaultProps} variant="warning" />);

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toHaveClass('bg-yellow-600');
    });

    it('should render info variant by default with primary button', () => {
      render(<ConfirmDialog {...defaultProps} />);

      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmButton).toHaveClass('bg-primary-600');
    });
  });

  describe('interactions', () => {
    it('should call onConfirm when confirm button is clicked', () => {
      const onConfirm = vi.fn();
      render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when cancel button is clicked', () => {
      const onClose = vi.fn();
      render(<ConfirmDialog {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<ConfirmDialog {...defaultProps} onClose={onClose} />);

      // Uses bg-black/50 in light mode (JSDOM doesn't have dark mode enabled)
      const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/50');
      expect(backdrop).toBeInTheDocument();

      fireEvent.click(backdrop!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading state', () => {
    it('should disable buttons when isLoading is true', () => {
      render(<ConfirmDialog {...defaultProps} isLoading={true} />);

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled();
    });

    it('should show spinner when isLoading is true', () => {
      const { container } = render(<ConfirmDialog {...defaultProps} isLoading={true} />);

      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('should not show spinner when isLoading is false', () => {
      const { container } = render(<ConfirmDialog {...defaultProps} isLoading={false} />);

      expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
    });

    it('should not trigger callbacks when disabled', () => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();
      render(
        <ConfirmDialog
          {...defaultProps}
          onConfirm={onConfirm}
          onClose={onClose}
          isLoading={true}
        />
      );

      // Even though button is disabled, clicking it should not trigger callback
      // (disabled button won't fire click event)
      const confirmButton = screen.getByRole('button', { name: /Confirm/ });
      fireEvent.click(confirmButton);

      // Disabled buttons don't fire click events
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('message content', () => {
    it('should display long messages correctly', () => {
      const longMessage = 'This is a very long message that explains in detail what will happen if the user confirms this action. It includes multiple sentences and should wrap properly within the dialog.';
      render(<ConfirmDialog {...defaultProps} message={longMessage} />);

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('should display messages with special characters', () => {
      const specialMessage = 'Are you sure? This action (with "quotes" & special <chars>) cannot be undone!';
      render(<ConfirmDialog {...defaultProps} message={specialMessage} />);

      expect(screen.getByText(specialMessage)).toBeInTheDocument();
    });
  });
});
