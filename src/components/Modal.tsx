import type { ReactNode } from 'react';
import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Focus trap: auto-focus on open, restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Delay focus to allow render to complete
      requestAnimationFrame(() => {
        const firstFocusable = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        (firstFocusable ?? modalRef.current)?.focus();
      });
    }

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  // Trap Tab/Shift+Tab within modal, Escape to close
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !modalRef.current) return;

    const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, [onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return createPortal(
    <>
      {/* Backdrop - covers full screen */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/80 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal container - centered over full viewport */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className="fixed inset-0 z-50 overflow-y-auto pointer-events-none pt-20 pb-12"
        onClick={onClose}
        onKeyDown={handleKeyDown}
      >
        <div className="flex min-h-[calc(100vh-5rem-3rem)] items-start justify-center p-5 pointer-events-none">
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            tabIndex={-1}
            className={`relative w-full ${sizeClasses[size]} vault-panel shadow-vault-outer border-2 border-dark-200 dark:border-dark-700 max-h-[calc(100vh-5rem-6rem)] flex flex-col pointer-events-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Fixed */}
            <div className="flex items-center justify-between p-5 border-b-2 border-dark-200 dark:border-dark-700 relative flex-shrink-0">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary-600/50 to-transparent"></div>
              <h2 id="modal-title" className="text-lg font-display font-bold text-gradient-red vault-text-glow">{title}</h2>
              <button
                onClick={onClose}
                className="text-dark-400 dark:text-dark-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors p-4 rounded hover:bg-dark-100 dark:hover:bg-vault-dark-4"
                aria-label="Close"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="p-5 overflow-y-auto flex-1 min-h-0">
              {children}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
