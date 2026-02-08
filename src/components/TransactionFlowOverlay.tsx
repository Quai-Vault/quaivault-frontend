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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm">
      <div className="vault-panel max-w-lg w-full mx-4 p-6">
        {children}
      </div>
    </div>,
    document.body
  );
}
