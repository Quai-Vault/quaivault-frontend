import { getTransactionUrl, getAddressUrl } from '../utils/blockExplorer';

interface ExplorerLinkProps {
  type: 'transaction' | 'address';
  value: string;
  className?: string;
  showIcon?: boolean;
  children?: React.ReactNode;
}

export function ExplorerLink({
  type,
  value,
  className = '',
  showIcon = true,
  children,
}: ExplorerLinkProps) {
  const url = type === 'transaction' ? getTransactionUrl(value) : getAddressUrl(value);
  const displayText = children || (type === 'transaction' ? 'View on Explorer' : 'View Address');

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <a
      href={url}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 transition-colors ${className}`}
    >
      {showIcon && (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      )}
      {displayText}
    </a>
  );
}
