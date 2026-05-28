import { Modal } from './Modal';

const variantStyles = {
  danger: {
    button: 'btn-danger',
    icon: (
      <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
  },
  warning: {
    button: 'btn-warning',
    icon: (
      <svg className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
  },
  info: {
    button: 'btn-primary',
    icon: (
      <svg className="w-6 h-6 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
    ),
  },
};

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
  isLoading = false,
  children,
}: ConfirmDialogProps) {
  const styles = variantStyles[variant];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">{styles.icon}</div>
          <div className="flex-1">
            <p className="text-base text-dark-600 dark:text-dark-300 leading-relaxed">{message}</p>
            {children}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-4 sm:justify-end pt-4 border-t border-dark-200 dark:border-dark-600">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="btn-secondary px-4 sm:px-6 py-2.5 w-full sm:w-auto"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            aria-busy={isLoading || undefined}
            className={`${styles.button} w-full sm:w-auto ${isLoading ? 'btn-loading' : ''}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
