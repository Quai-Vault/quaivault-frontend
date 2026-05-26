import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TransactionFlowOverlayProps {
  children: ReactNode;
  onClose?: () => void;
}

/**
 * Overlay wrapper for TransactionFlow that provides:
 * - Scroll lock while open
 * - ESC key to close
 * - Consistent backdrop styling
 */
export function TransactionFlowOverlay({ children, onClose }: TransactionFlowOverlayProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // NOTE: do not nest this component inside <Modal> — both set
  // document.body.style.overflow and would fight on unmount.
  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/80 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
        <div className="min-h-full flex items-center justify-center p-2 sm:p-5">
          <div className="vault-panel max-w-lg w-full my-4 sm:my-8 p-4 sm:p-6">
            {children}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
