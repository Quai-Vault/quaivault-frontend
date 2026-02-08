import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    to?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  const defaultIcon = (
    <svg
      className="w-12 h-12 text-dark-400 dark:text-dark-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );

  const ActionButton = action?.to ? (
    <Link to={action.to} className="btn-primary inline-flex items-center gap-2">
      {action.label}
    </Link>
  ) : action?.onClick ? (
    <button onClick={action.onClick} className="btn-primary inline-flex items-center gap-2">
      {action.label}
    </button>
  ) : null;

  return (
    <div className={`text-center py-12 ${className}`}>
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-dark-100 dark:bg-vault-dark-4 border-2 border-dark-300 dark:border-dark-600 mb-4">
        {icon || defaultIcon}
      </div>
      <h3 className="text-lg font-display font-bold text-dark-700 dark:text-dark-200 mb-2">{title}</h3>
      {description && (
        <p className="text-base text-dark-500 mb-6 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {ActionButton && <div className="mt-6">{ActionButton}</div>}
    </div>
  );
}
