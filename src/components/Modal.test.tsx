import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Test Modal',
    children: <div>Modal content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up body overflow style
    document.body.style.overflow = '';
  });

  describe('rendering', () => {
    it('should render modal when isOpen is true', () => {
      render(<Modal {...defaultProps} />);

      expect(screen.getByText('Test Modal')).toBeInTheDocument();
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('should not render modal when isOpen is false', () => {
      render(<Modal {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
      expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
    });

    it('should render children correctly', () => {
      render(
        <Modal {...defaultProps}>
          <button>Action Button</button>
          <p>Some text content</p>
        </Modal>
      );

      expect(screen.getByRole('button', { name: 'Action Button' })).toBeInTheDocument();
      expect(screen.getByText('Some text content')).toBeInTheDocument();
    });
  });

  describe('size variants', () => {
    it('should apply sm size class', () => {
      const { container } = render(<Modal {...defaultProps} size="sm" />);

      expect(container.querySelector('.max-w-sm')).toBeInTheDocument();
    });

    it('should apply md size class by default', () => {
      const { container } = render(<Modal {...defaultProps} />);

      expect(container.querySelector('.max-w-md')).toBeInTheDocument();
    });

    it('should apply lg size class', () => {
      const { container } = render(<Modal {...defaultProps} size="lg" />);

      expect(container.querySelector('.max-w-2xl')).toBeInTheDocument();
    });

    it('should apply xl size class', () => {
      const { container } = render(<Modal {...defaultProps} size="xl" />);

      expect(container.querySelector('.max-w-4xl')).toBeInTheDocument();
    });
  });

  describe('close behavior', () => {
    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      const closeButton = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      // Find the backdrop element (uses bg-black/50 in light mode)
      const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/50');
      expect(backdrop).toBeInTheDocument();

      fireEvent.click(backdrop!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not close when modal content is clicked', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByText('Modal content'));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('body overflow', () => {
    it('should set body overflow to hidden when opened', () => {
      render(<Modal {...defaultProps} isOpen={true} />);

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should reset body overflow when closed', () => {
      const { rerender } = render(<Modal {...defaultProps} isOpen={true} />);

      expect(document.body.style.overflow).toBe('hidden');

      rerender(<Modal {...defaultProps} isOpen={false} />);

      expect(document.body.style.overflow).toBe('');
    });

    it('should reset body overflow on unmount', () => {
      const { unmount } = render(<Modal {...defaultProps} isOpen={true} />);

      expect(document.body.style.overflow).toBe('hidden');

      unmount();

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('accessibility', () => {
    it('should have an accessible close button', () => {
      render(<Modal {...defaultProps} />);

      const closeButton = screen.getByRole('button', { name: 'Close' });
      expect(closeButton).toHaveAttribute('aria-label', 'Close');
    });

    it('should render title as heading', () => {
      render(<Modal {...defaultProps} title="Accessible Title" />);

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Accessible Title');
    });
  });

  describe('complex content', () => {
    it('should render form content', () => {
      render(
        <Modal {...defaultProps}>
          <form data-testid="test-form">
            <input type="text" placeholder="Enter value" />
            <button type="submit">Submit</button>
          </form>
        </Modal>
      );

      expect(screen.getByTestId('test-form')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter value')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });

    it('should render nested modals content', () => {
      render(
        <Modal {...defaultProps}>
          <div>
            <h3>Nested Header</h3>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </div>
        </Modal>
      );

      expect(screen.getByText('Nested Header')).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });
  });
});
